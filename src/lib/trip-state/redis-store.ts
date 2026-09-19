import { randomUUID } from "node:crypto";
import { TripError, type TripRecord } from "./model";
import type { TripStore } from "./store";

/** Redis REST persistence for multiple/serverless instances. No service SDK dependency. */
export class RedisTripStore implements TripStore {
  private leases = new Map<string, string>();
  constructor(private readonly url: string, private readonly token: string) {
    if (new URL(url).protocol !== "https:") throw new Error("Redis REST requires HTTPS");
  }
  private key(id: string) { if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new TripError("TRIP_NOT_FOUND", "Trip not found", 404); return `beacon:trip:${id}`; }
  private async command(...args: (string | number)[]) {
    const response = await fetch(this.url, { method: "POST", headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }, body: JSON.stringify(args), signal: AbortSignal.timeout(5000), redirect: "error", cache: "no-store" });
    if (!response.ok) throw new Error("Trip store unavailable");
    const body = await response.json() as { result?: unknown; error?: string }; if (body.error) throw new Error("Trip store command failed"); return body.result;
  }
  async create(record: TripRecord) {
    await this.command("EVAL", "redis.call('SET',KEYS[1],ARGV[1],'EX',86400);redis.call('ZADD',KEYS[2],ARGV[2],ARGV[3]);return 1", 2, this.key(record.trip.id), "beacon:trips", JSON.stringify(record), Date.now(), record.trip.id);
  }
  async read(id: string): Promise<TripRecord> { const raw = await this.command("GET", this.key(id)); if (typeof raw !== "string") throw new TripError("TRIP_NOT_FOUND", "Trip not found", 404); return JSON.parse(raw); }
  async list(): Promise<string[]> {
    await this.command("ZREMRANGEBYSCORE", "beacon:trips", "-inf", Date.now() - 86_400_000);
    return await this.command("ZRANGE", "beacon:trips", 0, -1) as string[];
  }
  async checkpoint(record: TripRecord) {
    const token = this.leases.get(record.trip.id); if (!token) throw new Error("Trip lock required");
    const saved = await this.command("EVAL", "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end;redis.call('SET',KEYS[2],ARGV[2],'KEEPTTL');return 1", 2, `${this.key(record.trip.id)}:lock`, this.key(record.trip.id), token, JSON.stringify(record));
    if (saved !== 1) throw new Error("Trip lock expired");
  }
  async update<T>(id: string, fn: (record: TripRecord) => Promise<T>): Promise<T> {
    const token = randomUUID(); const lock = `${this.key(id)}:lock`;
    const acquired = await this.command("SET", lock, token, "NX", "PX", 180_000);
    if (acquired !== "OK") throw new TripError("TRIP_BUSY", "Trip is being updated; retry shortly", 409);
    this.leases.set(id, token);
    try { const record = await this.read(id); try { return await fn(record); } finally { await this.checkpoint(record); } }
    finally { this.leases.delete(id); await this.command("EVAL", "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end;return 0", 1, lock, token); }
  }
}
