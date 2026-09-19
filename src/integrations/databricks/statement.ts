/** Dependency-free server-side Databricks Statement Execution transport. Never expose config to clients. */
export type DatabricksConfig = { host: string; token: string; warehouseId: string };
export type SqlParameter = { name: string; value: string; type?: string };
export type StatementResult = { statementId: string; columns: string[]; rows: (string | null)[][] };
export class DatabricksError extends Error {
  constructor(public readonly code: string) { super(code); this.name = "DatabricksError"; }
}
type Json = Record<string, unknown>;
const object = (value: unknown): Json => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const fail = (code: string): never => { throw new DatabricksError(code); };

export function validateConfig(config: DatabricksConfig): DatabricksConfig {
  let host: URL;
  try { host = new URL(config.host); } catch { return fail("INVALID_WORKSPACE_CONFIG"); }
  const validHost = /^[a-z0-9][a-z0-9.-]*\.(?:cloud\.databricks\.com|gcp\.databricks\.com|azuredatabricks\.net)$/.test(host.hostname);
  if (host.protocol !== "https:" || !validHost || host.port || host.username || host.password || host.search || host.hash || !["", "/"].includes(host.pathname) || !config.token?.trim() || /[\r\n]/.test(config.token) || !/^[A-Za-z0-9_-]{1,128}$/.test(config.warehouseId)) return fail("INVALID_WORKSPACE_CONFIG");
  return { ...config, host: host.origin };
}

/** Identifiers are deployment config, never SQL supplied by the caller. */
export function qualifiedTable(value: string): string {
  const pieces = value.split(".");
  if (pieces.length !== 3 || !pieces.every((part) => /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test(part))) return fail("INVALID_TABLE_CONFIG");
  return pieces.map((part) => `\`${part}\``).join(".");
}

export async function executeStatement(
  configuration: DatabricksConfig,
  request: { statement: string; parameters?: SqlParameter[]; timeoutMs?: number },
  options: { fetch?: typeof fetch; pollIntervalMs?: number } = {},
): Promise<StatementResult> {
  const config = validateConfig(configuration);
  const fetcher = options.fetch ?? fetch;
  const timeout = Math.max(100, Math.min(request.timeoutMs ?? 10000, 120000));
  const deadline = Date.now() + timeout;
  const workDeadline = deadline - Math.min(300, timeout / 5);
  const body = JSON.stringify({ warehouse_id: config.warehouseId, statement: request.statement, parameters: request.parameters ?? [], wait_timeout: "0s", disposition: "INLINE", format: "JSON_ARRAY", row_limit: 1000, byte_limit: 1048576 });
  if (Buffer.byteLength(body, "utf8") > 65536) return fail("REQUEST_TOO_LARGE");
  let statementId: string | undefined;
  let running = false;
  let retryUsed = false;
  const pause = async (ms: number) => {
    if (Date.now() + ms >= workDeadline) return fail("STATEMENT_TIMEOUT");
    await new Promise((resolve) => setTimeout(resolve, ms));
  };
  const call = async (path: string, method: "POST" | "GET", payload?: string): Promise<Json> => {
    const remaining = workDeadline - Date.now();
    if (remaining <= 0) return fail("STATEMENT_TIMEOUT");
    try {
      const response = await fetcher(`${config.host}/api/2.0/sql/statements${path}`, { method, redirect: "error", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" }, body: payload, signal: AbortSignal.timeout(remaining), cache: "no-store" });
      if (!response.ok) {
        if (method === "GET" && !retryUsed && [429, 502, 503, 504].includes(response.status)) {
          retryUsed = true;
          const header = response.headers.get("retry-after");
          const delay = header && /^\d+$/.test(header) ? Number(header) * 1000 : 250;
          await pause(delay);
          return call(path, method, payload);
        }
        return fail(response.status === 401 || response.status === 403 ? "WORKSPACE_AUTH_FAILED" : "WORKSPACE_HTTP_FAILED");
      }
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > 1048576) return fail("RESULT_TOO_LARGE");
      return object(JSON.parse(text));
    } catch (error) {
      if (error instanceof DatabricksError) throw error;
      if (Date.now() >= workDeadline || (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))) return fail("STATEMENT_TIMEOUT");
      if (method === "GET" && !retryUsed) { retryUsed = true; await pause(250); return call(path, method, payload); }
      return fail("WORKSPACE_TRANSPORT_FAILED");
    }
  };
  try {
    let response = await call("", "POST", body);
    let attempt = 0;
    while (true) {
      if (typeof response.statement_id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(response.statement_id) || (statementId && statementId !== response.statement_id)) return fail("INVALID_STATEMENT_ID");
      statementId = response.statement_id;
      const state = object(response.status).state;
      running = state === "PENDING" || state === "RUNNING";
      if (state === "SUCCEEDED") {
        const manifest = object(response.manifest);
        const result = object(response.result);
        if (manifest.truncated === true || Number(manifest.total_chunk_count ?? 0) > 1 || result.next_chunk_index !== undefined || result.external_links !== undefined) return fail("INCOMPLETE_RESULT");
        const columnsRaw = object(manifest.schema).columns ?? [];
        const rows = result.data_array ?? [];
        if (!Array.isArray(columnsRaw) || !Array.isArray(rows)) return fail("INVALID_RESULT");
        const columns = columnsRaw.map((column, index) => {
          const value = object(column);
          if (typeof value.name !== "string" || (value.position !== undefined && value.position !== index)) return fail("INVALID_RESULT");
          return value.name;
        });
        if (new Set(columns).size !== columns.length || rows.length > 1000 || (manifest.total_row_count !== undefined && Number(manifest.total_row_count) !== rows.length) || rows.some((row) => !Array.isArray(row) || row.length !== columns.length || row.some((cell) => cell !== null && typeof cell !== "string"))) return fail("INVALID_RESULT");
        return { statementId, columns, rows: rows as (string | null)[][] };
      }
      if (!running) return fail(state === "FAILED" ? "STATEMENT_FAILED" : state === "CANCELED" ? "STATEMENT_CANCELED" : "INVALID_STATEMENT_STATE");
      await pause(options.pollIntervalMs ?? Math.min(250 * 2 ** attempt++, 1000));
      response = await call(`/${statementId}`, "GET");
    }
  } finally {
    if (running && statementId) {
      try {
        await fetcher(`${config.host}/api/2.0/sql/statements/${statementId}/cancel`, { method: "POST", redirect: "error", headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
      } catch { /* Cancellation is best effort; never leak a token or vendor error to the UI. */ }
    }
  }
}
