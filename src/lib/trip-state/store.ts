import { mkdir, readFile, rename, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { TripError, type TripRecord } from "./model";

export interface TripStore {
  create(record: TripRecord): Promise<void>;
  checkpoint(record: TripRecord): Promise<void>;
  read(id: string): Promise<TripRecord>;
  update<T>(id: string, fn: (record: TripRecord) => Promise<T>): Promise<T>;
  list(): Promise<string[]>;
}
/** Serialized updates prevent duplicate bookings/notifications within a server. */
export class MemoryTripStore implements TripStore {
  protected records = new Map<string, TripRecord>();
  private locks = new Map<string, Promise<unknown>>();
  async create(record: TripRecord) { this.records.set(record.trip.id, structuredClone(record)); }
  async checkpoint(record: TripRecord) { await this.save(record); }
  async read(id: string) { const r = this.records.get(id); if (!r) throw new TripError("TRIP_NOT_FOUND", "Trip not found", 404); return structuredClone(r); }
  protected async save(record: TripRecord) { this.records.set(record.trip.id, structuredClone(record)); }
  async update<T>(id: string, fn: (record: TripRecord) => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => { const record = await this.read(id); try { return await fn(record); } finally { await this.save(record); } });
    this.locks.set(id, operation);
    try { return await operation; } finally { if (this.locks.get(id) === operation) this.locks.delete(id); }
  }
  async list() { return [...this.records.keys()]; }
}
/** Local single-process demo persistence. Hosted/serverless deployments must use a shared store. */
export class FileTripStore extends MemoryTripStore {
  constructor(private readonly directory: string) { super(); }
  private path(id: string) { if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new TripError("TRIP_NOT_FOUND", "Trip not found", 404); return join(this.directory, `${id}.json`); }
  async create(record: TripRecord) { await this.save(record); }
  async read(id: string): Promise<TripRecord> {
    try { return JSON.parse(await readFile(this.path(id), "utf8")) as TripRecord; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new TripError("TRIP_NOT_FOUND", "Trip not found", 404); throw error; }
  }
  protected async save(record: TripRecord) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = this.path(record.trip.id); const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(record), { mode: 0o600 }); await rename(temporary, path);
  }
  async list() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    return (await readdir(this.directory)).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
  }
}
