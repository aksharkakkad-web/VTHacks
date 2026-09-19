/** Opt-in server-side public research. No page content enters ranking, SQL or a model. */
import { createHash } from "node:crypto";

export const RESEARCH_TOPICS = ["crime", "lighting", "activity", "closures", "notices", "weather", "transit"] as const;
export type ResearchTopic = typeof RESEARCH_TOPICS[number];
export type ResearchRequest = { corridorId: "newman-pritchard" | "eggleston-pritchard" | "downtown-pritchard"; topic: ResearchTopic };
/** Providers return discovery leads only. Search snippets/answers are never evidence. */
export interface SearchProvider {
  search(request: { query: string; maxResults: number; signal: AbortSignal }): Promise<readonly { url: string }[]>;
}
export type PublicResearchSource = {
  url: string;
  discoveredUrl: string;
  title: string;
  retrievedAt: string;
  pageTimestamp: string | null;
  pageTimestampKind: "published" | "modified" | "http_last_modified" | "source_generated" | null;
  contentSha256: string;
  contentBytes: number;
  extraction: "page_metadata_only";
  coverageWarning: string;
};
export type PublicResearchResult = {
  schemaVersion: "beacon-public-research-v1";
  request: ResearchRequest;
  discoveryMethod: "fixed_official_sources" | "injected_search_provider";
  status: "sources_found" | "unavailable";
  sources: PublicResearchSource[];
  gaps: { code: "SEARCH_UNAVAILABLE" | "NO_SEARCH_RESULTS" | "REJECTED_URL" | "SOURCE_UNAVAILABLE" | "DEADLINE_EXCEEDED"; message: string }[];
  rankingEligible: false;
  limitations: string[];
};
export type ResearchDependencies = { fetch?: typeof fetch; searchProvider?: SearchProvider; now?: () => number; timeoutMs?: number };

const MAX_SOURCES = 3, MAX_BYTES = 500_000, MAX_REDIRECTS = 2, MAX_DEADLINE = 8_000;
const PLACES = {
  "newman-pritchard": "Newman Library to Pritchard Hall",
  "eggleston-pritchard": "East Eggleston Hall to Pritchard Hall",
  "downtown-pritchard": "Downtown Blacksburg to Pritchard Hall",
} as const;
const OFFICIAL_DOMAINS = new Set(["police.vt.edu", "www.facilities.vt.edu", "arcgis-central.gis.vt.edu", "news.vt.edu", "ridebt.org", "www.ridebt.org", "api.weather.gov", "www.weather.gov", "weather.gov", "rosap.ntl.bts.gov", "drpt.virginia.gov"]);
const DIRECT_SOURCES: Record<ResearchTopic, readonly string[]> = {
  crime: ["https://police.vt.edu/crime-stats/crime-logs.html", "https://police.vt.edu/crime-alerts.html"],
  lighting: ["https://www.facilities.vt.edu/university-engineer/gis/GISMapCatalog/UtilityGISMaps.html"],
  activity: ["https://rosap.ntl.bts.gov/view/dot/34766"],
  closures: ["https://arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/Construction_Closures/FeatureServer/0?f=pjson", "https://www.facilities.vt.edu/campus-impacts.html"],
  notices: ["https://police.vt.edu/crime-alerts.html", "https://www.facilities.vt.edu/campus-impacts.html"],
  weather: ["https://api.weather.gov/gridpoints/RNK/58,66/forecast/hourly", "https://api.weather.gov/alerts/active?point=37.2296,-80.4139"],
  transit: ["https://ridebt.org/news-alerts", "https://ridebt.org/fare-information", "https://drpt.virginia.gov/data/gtfs-feed-clearinghouse/"],
};
const TOPIC_TERMS: Record<ResearchTopic, string> = {
  crime: "site:police.vt.edu published crime logs",
  lighting: "site:www.facilities.vt.edu outdoor lighting GIS",
  activity: "site:rosap.ntl.bts.gov Blacksburg pedestrian count study",
  closures: "site:www.facilities.vt.edu campus construction closures",
  notices: "site:police.vt.edu campus notices",
  weather: "site:weather.gov Blacksburg forecast alerts",
  transit: "site:ridebt.org bus schedules fares alerts",
};

function parseRequest(value: unknown): ResearchRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Research accepts only corridorId and topic");
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== 2 || !Object.hasOwn(r, "corridorId") || !Object.hasOwn(r, "topic") || typeof r.corridorId !== "string" || !Object.hasOwn(PLACES, r.corridorId) || typeof r.topic !== "string" || !(RESEARCH_TOPICS as readonly string[]).includes(r.topic)) throw new Error("Research accepts only a named public corridor and supported topic; no private or free-form fields");
  return { corridorId: r.corridorId as ResearchRequest["corridorId"], topic: r.topic as ResearchTopic };
}
function officialUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !OFFICIAL_DOMAINS.has(url.hostname) || url.pathname.length > 1024 || url.search.length > 512 || [...url.searchParams].length > 8 || [...url.searchParams].some(([k, v]) => k.length > 64 || v.length > 256)) return null;
    url.hash = "";
    return url;
  } catch { return null; }
}
function htmlText(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&(?:lt|gt|nbsp);/gi, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}
function validPageTime(value: unknown, now: number): string | null {
  if (typeof value !== "string" || value.length > 100) return null;
  const date = Date.parse(value);
  return Number.isFinite(date) && date <= now ? new Date(date).toISOString() : null;
}
function pageMetadata(body: string, contentType: string, response: Response, fallbackTitle: string, now: number): Pick<PublicResearchSource, "title" | "pageTimestamp" | "pageTimestampKind"> {
  let title = fallbackTitle, pageTimestamp: string | null = null, pageTimestampKind: PublicResearchSource["pageTimestampKind"] = null;
  if (contentType.includes("json")) {
    try {
      const json = JSON.parse(body), props = json && typeof json === "object" ? (json.properties ?? json) : {};
      const name = props.name ?? props.title;
      if (typeof name === "string") title = htmlText(name);
      pageTimestamp = validPageTime(props.generatedAt ?? props.updated ?? props.updatedAt, now);
      if (pageTimestamp) pageTimestampKind = "source_generated";
    } catch { /* Parsing failure does not invent page metadata. */ }
  } else {
    const match = body.match(/<title\b[^>]*>([\s\S]{0,2000}?)<\/title\s*>/i);
    if (match) title = htmlText(match[1]);
    const metadata = body.match(/<meta\b[^>]{1,2000}>/gi) ?? [];
    for (const tag of metadata) {
      const attrs = Object.fromEntries(Array.from(tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']{0,1000})["']/g), m => [m[1].toLowerCase(), m[2]]));
      const kind = attrs.property ?? attrs.name;
      if (!["article:published_time", "article:modified_time", "datePublished", "dateModified", "dcterms.issued"].includes(kind)) continue;
      const parsed = validPageTime(attrs.content, now);
      if (parsed) { pageTimestamp = parsed; pageTimestampKind = /modified/i.test(kind) ? "modified" : "published"; break; }
    }
  }
  if (!pageTimestamp) {
    pageTimestamp = validPageTime(response.headers.get("last-modified"), now);
    if (pageTimestamp) pageTimestampKind = "http_last_modified";
  }
  return { title: title || fallbackTitle, pageTimestamp, pageTimestampKind };
}
async function deadline<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new Error("Research deadline exceeded");
  let abort: () => void = () => {};
  const expired = new Promise<never>((_, reject) => { abort = () => reject(new Error("Research deadline exceeded")); signal.addEventListener("abort", abort, { once: true }); });
  try { return await Promise.race([operation, expired]); }
  finally { signal.removeEventListener("abort", abort); }
}
async function bodyBytes(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) { void response.body?.cancel().catch(() => {}); throw new Error("Public source exceeds byte limit"); }
  if (!response.body) throw new Error("Source body missing");
  const reader = response.body.getReader(), parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await deadline(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error("Public source exceeds byte limit");
      parts.push(value);
    }
  } catch (error) { void reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  if (!size) throw new Error("Source body empty");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return bytes;
}
async function readSource(discovered: URL, fetcher: typeof fetch, signal: AbortSignal, now: () => number): Promise<PublicResearchSource> {
  let target = discovered;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await deadline(fetcher(target.href, { redirect: "manual", credentials: "omit", referrerPolicy: "no-referrer", signal, headers: { Accept: "text/html, application/json, application/geo+json", "User-Agent": "BeaconHackathonPublicResearch/1.0" } }), signal);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      void response.body?.cancel().catch(() => {});
      const location = response.headers.get("location"), next = location && officialUrl(new URL(location, target).href);
      if (!next || hop === MAX_REDIRECTS) throw new Error("Unapproved or excessive redirect");
      target = next; continue;
    }
    // Guard injected clients that follow a redirect despite redirect:manual.
    if (response.redirected || (response.url && response.url !== target.href)) throw new Error("Unexpected redirect behavior");
    if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new Error("Public source unavailable"); }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/json") && !contentType.includes("application/geo+json")) { void response.body?.cancel().catch(() => {}); throw new Error("Source requires a structured importer or unsupported extraction"); }
    const bytes = await bodyBytes(response, signal), captured = now();
    return { url: target.href, discoveredUrl: discovered.href, ...pageMetadata(new TextDecoder().decode(bytes), contentType, response, target.hostname, captured), retrievedAt: new Date(captured).toISOString(), contentSha256: createHash("sha256").update(bytes).digest("hex"), contentBytes: bytes.byteLength, extraction: "page_metadata_only", coverageWarning: "Verified retrieval of a public source page, not verified route conditions. Publication or retrieval time does not establish a current hazard, full coverage or safety." };
  }
  throw new Error("Redirect limit exceeded");
}

/** Explicit research call only. Never invoke automatically for every trip. */
export async function researchPublicCampusSources(value: unknown, dependencies: ResearchDependencies = {}): Promise<PublicResearchResult> {
  const request = parseRequest(value), fetcher = dependencies.fetch ?? fetch, now = dependencies.now ?? Date.now;
  const timeoutMs = dependencies.timeoutMs ?? MAX_DEADLINE;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_DEADLINE || !Number.isFinite(now())) throw new Error("Invalid research deadline or clock");
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  const result: PublicResearchResult = { schemaVersion: "beacon-public-research-v1", request, discoveryMethod: dependencies.searchProvider ? "injected_search_provider" : "fixed_official_sources", status: "unavailable", sources: [], gaps: [], rankingEligible: false, limitations: ["Page metadata and links are research leads only; structured importers must validate facts before decision use.", "Search snippets, page instructions and generated summaries are never ranked or treated as evidence.", "Named corridors are public research scope; downtown walking geometry remains unsupported."] };
  try {
    let leads: readonly { url: string }[] = DIRECT_SOURCES[request.topic].map(url => ({ url }));
    if (dependencies.searchProvider) {
      try {
        const query = `Virginia Tech ${PLACES[request.corridorId]} ${TOPIC_TERMS[request.topic]}`;
        const response = await deadline(dependencies.searchProvider.search({ query, maxResults: MAX_SOURCES, signal: controller.signal }), controller.signal);
        if (!Array.isArray(response)) throw new Error("Invalid search result");
        leads = response.slice(0, MAX_SOURCES); // Ignore every property except URL, including snippets.
        if (!leads.length) result.gaps.push({ code: "NO_SEARCH_RESULTS", message: "No public source leads were returned; coverage remains unknown." });
      } catch { leads = []; result.gaps.push({ code: "SEARCH_UNAVAILABLE", message: "Public source discovery is unavailable; no evidence was inferred." }); }
    }
    const seen = new Set<string>();
    for (const lead of leads.slice(0, MAX_SOURCES)) {
      if (controller.signal.aborted) break;
      const url = officialUrl(lead && typeof lead === "object" ? lead.url : undefined);
      if (!url) { result.gaps.push({ code: "REJECTED_URL", message: "A source lead was outside the approved official public domains or URL bounds." }); continue; }
      if (seen.has(url.href)) continue;
      seen.add(url.href);
      try { result.sources.push(await readSource(url, fetcher, controller.signal, now)); }
      catch { result.gaps.push({ code: "SOURCE_UNAVAILABLE", message: "An official source could not be retrieved within the byte, format, redirect and deadline limits; no facts were inferred." }); }
    }
    if (controller.signal.aborted) result.gaps.push({ code: "DEADLINE_EXCEEDED", message: "The bounded research deadline expired; missing sources remain unknown." });
    result.status = result.sources.length ? "sources_found" : "unavailable";
    return result;
  } finally { clearTimeout(timer); }
}
