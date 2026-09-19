import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { checkServerIdentity, type TLSSocket } from "node:tls";
import { privateAddress, providerUrl } from "../../agents/http-provider";

export function fingerprint(value: string) { return "SHA256:" + value.replace(/^SHA256:/i, "").replace(/:/g, "").toLowerCase(); }
/** Pin DNS for this connection, reject redirects, validate TLS before sending a body. */
export async function publicJson(urlText: string, options: { method?: string; body?: unknown; headers?: Record<string, string>; pin?: string; timeoutMs?: number } = {}) {
  const url = new URL(urlText);
  providerUrl(`${url.origin}${url.pathname}`);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => privateAddress(a.address))) throw new Error("Nonpublic address blocked");
  const address = addresses[0];
  return new Promise<{ value: unknown; fingerprint: string }>((resolve, reject) => {
    const req = request(url, {
      method: options.method ?? "GET", agent: false, family: address.family,
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      headers: { "Content-Type": "application/json", ...options.headers },
      checkServerIdentity(host, cert) {
        const invalid = checkServerIdentity(host, cert);
        if (invalid) return invalid;
        if (options.pin && fingerprint(cert.fingerprint256) !== options.pin) return new Error("ANS certificate pin changed");
      },
    }, (res) => {
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) { res.resume(); reject(new Error(`Remote request failed (${res.statusCode})`)); return; }
      const fp = fingerprint((res.socket as TLSSocket).getPeerCertificate().fingerprint256);
      const chunks: Buffer[] = []; let bytes = 0;
      res.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 1_048_576) { res.destroy(new Error("Response too large")); return; } chunks.push(chunk); });
      res.on("error", reject);
      res.on("end", () => { try { resolve({ value: JSON.parse(Buffer.concat(chunks).toString()), fingerprint: fp }); } catch { reject(new Error("Invalid remote JSON")); } });
    });
    const deadline = setTimeout(() => req.destroy(new Error("Remote request timed out")), options.timeoutMs ?? 6000);
    req.on("error", reject); req.on("close", () => clearTimeout(deadline));
    req.end(options.body === undefined ? undefined : JSON.stringify(options.body));
  });
}
