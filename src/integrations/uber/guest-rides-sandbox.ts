// Server-only integration: Node's crypto is intentionally unavailable to browser bundles.
import { createHash } from 'node:crypto';

export type SandboxRoute = { pickup: { latitude: number; longitude: number }; dropoff: { latitude: number; longitude: number } };
export type SandboxAuthorization = { identityVerified: boolean; preciseLocationAuthorized: boolean; userConfirmed: boolean } | { kind: 'synthetic_demo'; demoMode: boolean };
export type SandboxConfig = { enabled?: boolean; apiFamily?: string; accessToken?: string; organizationId?: string; timeoutMs?: number; now?: () => number };
export type SandboxQuote = { source: 'uber_guest_rides_sandbox'; runId: string; productId: string; parentProductTypeId: string; name: string; fareId: string; amountMinor: number; currency: 'USD'; expiresAt: number; pickupEtaMinutes: number; travelSeconds: number; route: SandboxRoute; cancellationFeeMaximumMinor: null };
export type SandboxTrip = { source: 'uber_guest_rides_sandbox'; id: string; status: 'processing' | 'accepted' | 'arriving' | 'in_progress' | 'completed' | 'cancelled' | 'declined'; rawStatus: string; pickupEtaMinutes: number | null; destinationEtaMinutes: number | null; driver: { name: string | null } | null; vehicle: { make: string | null; model: string | null; color: string | null; licensePlate: string | null } | null; meetingInstructions: string | null };
export type BookingRecord = { bookingKey: string; expenseMemo: string; runId: string; productId: string; fareId: string; route: SandboxRoute; guestId: string; amountMinor: number; expiresAt: number; createdAt: number; binding: string; state: 'pending' | 'confirmed' | 'uncertain' | 'rejected'; requestId?: string };
export interface BookingJournal { claim(record: BookingRecord): Promise<boolean>; read(bookingKey: string): Promise<BookingRecord | undefined>; save(record: BookingRecord): Promise<void> }
export type BookingResult = { state: 'confirmed'; bookingKey: string; trip: SandboxTrip } | { state: 'uncertain' | 'rejected'; bookingKey: string };
export type DriverState = 'GO_ONLINE' | 'ACCEPT' | 'ARRIVED' | 'BEGIN_TRIP' | 'DROPOFF' | 'CANCEL' | 'GO_OFFLINE';
export class UberSandboxError extends Error {
  constructor(public readonly code: string) { super(`Uber sandbox: ${code}`); this.name = 'UberSandboxError'; }
}

const HOST = 'https://sandbox-api.uber.com';
export const SYNTHETIC_DEMO_ROUTE: SandboxRoute = { pickup: { latitude: 37.229, longitude: -80.414 }, dropoff: { latitude: 37.221, longitude: -80.420 } };
const fail = (code: string): never => { throw new UberSandboxError(code); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('MALFORMED_RESPONSE');
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(value)) return fail('INVALID_IDENTIFIER');
  return value;
}
function display(value: unknown, max = 160): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max || /[<>\u0000-\u001f]|https?:\/\//i.test(value)) return fail('MALFORMED_RESPONSE');
  return value;
}
function finite(value: unknown, max = 86_400): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max; }
function normalizeRoute(route: SandboxRoute): SandboxRoute {
  for (const point of [route?.pickup, route?.dropoff]) {
    if (!point || !Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90 || !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180) fail('INVALID_ROUTE');
  }
  return { pickup: { latitude: route.pickup.latitude, longitude: route.pickup.longitude }, dropoff: { latitude: route.dropoff.latitude, longitude: route.dropoff.longitude } };
}
function authorize(authorization: SandboxAuthorization, route: SandboxRoute) {
  if (authorization && 'kind' in authorization && authorization.kind === 'synthetic_demo') {
    if (authorization.demoMode === true && JSON.stringify(normalizeRoute(route)) === JSON.stringify(SYNTHETIC_DEMO_ROUTE)) return;
  } else if (authorization && 'identityVerified' in authorization && authorization.identityVerified === true && authorization.preciseLocationAuthorized === true && authorization.userConfirmed === true) return;
  fail('AUTHORIZATION_REQUIRED');
}
function binding(record: Omit<BookingRecord, 'binding' | 'state' | 'requestId'>): string {
  return createHash('sha256').update(JSON.stringify([record.bookingKey, record.expenseMemo, record.runId, record.productId, record.fareId, normalizeRoute(record.route), record.guestId, record.amountMinor, record.expiresAt, record.createdAt])).digest('hex');
}
function normalizeTrip(value: unknown, expectedId?: string): SandboxTrip {
  const raw = object(value);
  if (raw.follow_up_trip_details != null || raw.linked_request_id != null || raw.linked_trip_details != null) return fail('UNSUPPORTED_FOLLOWUP');
  if (typeof raw.request_id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(raw.request_id) || expectedId && raw.request_id !== expectedId) return fail('MALFORMED_RESPONSE');
  const statuses: Record<string, SandboxTrip['status']> = { processing: 'processing', accepted: 'accepted', arriving: 'arriving', in_progress: 'in_progress', completed: 'completed', driver_canceled: 'cancelled', rider_canceled: 'cancelled', no_drivers_available: 'declined', failed: 'declined' };
  if (typeof raw.status !== 'string' || !Object.hasOwn(statuses, raw.status)) return fail('MALFORMED_RESPONSE');
  const driver = raw.driver == null ? null : object(raw.driver);
  const vehicle = raw.vehicle == null ? null : object(raw.vehicle);
  const pickup = raw.pickup == null ? {} : object(raw.pickup);
  const destination = raw.destination == null ? {} : object(raw.destination);
  return { source: 'uber_guest_rides_sandbox', id: raw.request_id, status: statuses[raw.status], rawStatus: raw.status,
    pickupEtaMinutes: finite(pickup.eta, 1440) ? pickup.eta : null, destinationEtaMinutes: finite(destination.eta, 1440) ? destination.eta : null,
    driver: driver ? { name: display(driver.name, 80) } : null,
    vehicle: vehicle ? { make: display(vehicle.make, 80), model: display(vehicle.model, 80), color: display(vehicle.vehicle_color_name, 40), licensePlate: display(vehicle.license_plate, 32) } : null,
    meetingInstructions: display(pickup.rider_wayfinding_note, 500),
  };
}

export function prepareBooking(input: { bookingKey: string; quote: SandboxQuote; guestId: string; approvedAmountMinor: number }, now = Date.now()): BookingRecord {
  const q = input.quote;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.bookingKey) || q.source !== 'uber_guest_rides_sandbox' || q.currency !== 'USD' || !Number.isSafeInteger(q.amountMinor) || q.amountMinor < 0 || !Number.isSafeInteger(input.approvedAmountMinor) || q.amountMinor > input.approvedAmountMinor || !Number.isFinite(q.expiresAt) || q.expiresAt <= now) return fail('INVALID_BOOKING');
  const record = { bookingKey: input.bookingKey, expenseMemo: `beacon:${input.bookingKey}`, runId: id(q.runId), productId: id(q.productId), fareId: id(q.fareId), route: normalizeRoute(q.route), guestId: id(input.guestId), amountMinor: q.amountMinor, expiresAt: q.expiresAt, createdAt: now };
  return { ...record, binding: binding(record), state: 'pending' };
}

export class GuestRidesSandboxClient {
  constructor(private readonly config: SandboxConfig = {}, private readonly dependencies: { fetch?: typeof fetch; journal?: BookingJournal } = {}) {}
  private ready() {
    if (typeof window !== 'undefined') fail('SERVER_ONLY');
    if (this.config.enabled !== true) fail('DISABLED');
    if (this.config.apiFamily !== 'guest-rides') fail('UNSUPPORTED_API_FAMILY');
    if (!this.config.accessToken || !/^[\x21-\x7e]{1,8192}$/.test(this.config.accessToken)) fail('MISSING_CREDENTIALS');
    if (this.config.organizationId !== undefined) id(this.config.organizationId);
    if (this.config.timeoutMs !== undefined && (!Number.isFinite(this.config.timeoutMs) || this.config.timeoutMs < 1 || this.config.timeoutMs > 30_000)) fail('INVALID_TIMEOUT');
  }
  private async request(method: string, path: string, body?: unknown, runId?: string, empty = false): Promise<unknown> {
    this.ready();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new UberSandboxError('TIMEOUT')); }, this.config.timeoutMs ?? 8_000); });
    try {
      return await Promise.race([timeout, (async () => {
        const headers: Record<string, string> = { authorization: `Bearer ${this.config.accessToken}`, accept: 'application/json', 'content-type': 'application/json' };
        if (runId !== undefined) headers['x-uber-sandbox-runuuid'] = id(runId);
        if (this.config.organizationId) headers['x-uber-organizationuuid'] = this.config.organizationId;
        const response = await (this.dependencies.fetch ?? fetch)(`${HOST}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: controller.signal, cache: 'no-store' });
        if (response.status >= 300 && response.status < 400) fail('REDIRECT_REJECTED');
        if (response.status === 401 || response.status === 403) fail('ACCESS_DENIED');
        if (response.status === 429) fail('RATE_LIMITED');
        if (response.status === 404) fail('NOT_FOUND');
        if (response.status === 408) fail('TIMEOUT');
        if (response.status === 409) fail('REQUEST_CONFLICT');
        if (response.status >= 500) fail('UPSTREAM_UNAVAILABLE');
        if (!response.ok) fail('REQUEST_REJECTED');
        if (empty) { void response.body?.cancel().catch(() => undefined); return undefined; }
        const text = await response.text();
        if (text.length > 1_000_000) fail('MALFORMED_RESPONSE');
        try { return JSON.parse(text); } catch { return fail('MALFORMED_RESPONSE'); }
      })()]);
    } catch (error) { if (error instanceof UberSandboxError) throw error; return fail('NETWORK_ERROR'); }
    finally { if (timer) clearTimeout(timer); controller.abort(); }
  }
  async createRun(input: SandboxRoute & { parentProductTypeId: string }, authorization: SandboxAuthorization): Promise<{ runId: string }> {
    const route = normalizeRoute(input); authorize(authorization, route);
    const raw = object(await this.request('POST', '/v1/guests/sandbox/run', { pickup_location: route.pickup, dropoff_location: route.dropoff, driver_locations: [{}], parent_product_type_id: id(input.parentProductTypeId) }));
    return { runId: id(raw.run_id) };
  }
  async getRun(runId: string): Promise<{ runId: string; driverIds: string[] }> {
    const raw = object(await this.request('GET', `/v1/guests/sandbox/run/${id(runId)}`));
    if (raw.run_id !== runId || !Array.isArray(raw.driver_ids) || raw.driver_ids.length > 10) return fail('MALFORMED_RESPONSE');
    return { runId, driverIds: raw.driver_ids.map(id) };
  }
  async checkAccess(runId: string): Promise<{ status: 'available' | 'unavailable'; apiFamily: 'guest-rides'; sandbox: true; reason?: string }> {
    try { await this.getRun(runId); return { status: 'available', apiFamily: 'guest-rides', sandbox: true }; }
    catch (error) { return { status: 'unavailable', reason: error instanceof UberSandboxError ? error.code : 'UPSTREAM_UNAVAILABLE', apiFamily: 'guest-rides', sandbox: true }; }
  }
  async estimates(runId: string, route: SandboxRoute, authorization: SandboxAuthorization): Promise<SandboxQuote[]> {
    const exact = normalizeRoute(route); authorize(authorization, exact);
    const raw = object(await this.request('POST', '/v1/guests/trips/estimates', exact, runId));
    if (!Array.isArray(raw.product_estimates) || raw.product_estimates.length > 100 || typeof raw.etas_unavailable !== 'boolean' || typeof raw.fares_unavailable !== 'boolean') return fail('MALFORMED_RESPONSE');
    if (raw.etas_unavailable === true || raw.fares_unavailable === true) return [];
    const quotes: SandboxQuote[] = [];
    for (const item of raw.product_estimates) {
      const entry = object(item), product = object(entry.product), info = object(entry.estimate_info);
      if (['RESERVE', 'HOURLY'].includes(String(product.advance_booking_type))) continue;
      if (info.no_cars_available != null && typeof info.no_cars_available !== 'boolean') return fail('MALFORMED_RESPONSE');
      if (info.no_cars_available === true || !finite(info.pickup_estimate, 1440) || info.fare == null || info.trip == null) continue;
      const fare = object(info.fare), trip = object(info.trip);
      const now = (this.config.now ?? Date.now)();
      if (fare.currency_code !== 'USD' || !finite(fare.value, 10_000) || !finite(fare.expires_at, 10_000_000_000) || fare.expires_at * 1000 <= now || !finite(trip.duration_estimate) || product.upfront_fare_enabled !== true || info.fare_id == null) continue;
      const amountMinor = Math.round(fare.value * 100);
      if (Math.abs(amountMinor - fare.value * 100) > 0.000001 || fare.fare_id != null && fare.fare_id !== info.fare_id) continue;
      quotes.push({ source: 'uber_guest_rides_sandbox', runId: id(runId), productId: id(product.product_id), parentProductTypeId: id(product.parent_product_type_id), name: display(product.display_name) ?? 'Uber sandbox', fareId: id(info.fare_id), amountMinor, currency: 'USD', expiresAt: fare.expires_at * 1000, pickupEtaMinutes: info.pickup_estimate, travelSeconds: trip.duration_estimate, route: structuredClone(exact), cancellationFeeMaximumMinor: null });
    }
    return quotes;
  }
  private journal(): BookingJournal { return this.dependencies.journal ?? fail('JOURNAL_REQUIRED'); }
  async createTrip(record: BookingRecord, authorization: SandboxAuthorization): Promise<BookingResult> {
    this.ready(); authorize(authorization, record.route);
    if (record.binding !== binding(record) || record.state !== 'pending' || record.expiresAt <= (this.config.now ?? Date.now)()) fail('INVALID_BOOKING');
    const journal = this.journal();
    let claimed: boolean;
    try { claimed = await journal.claim(structuredClone(record)); } catch { return fail('JOURNAL_UNAVAILABLE'); }
    if (!claimed) {
      const saved = await journal.read(record.bookingKey);
      if (!saved || saved.binding !== record.binding) return fail('BOOKING_CONFLICT');
      if (saved.state === 'rejected') return { state: 'rejected', bookingKey: record.bookingKey };
      if (saved.requestId) return this.reconcile(record.bookingKey);
      return { state: 'uncertain', bookingKey: record.bookingKey };
    }
    let result: BookingResult;
    let saved: BookingRecord;
    try {
      const raw = object(await this.request('POST', '/v1/guests/trips', { ...normalizeRoute(record.route), product_id: id(record.productId), fare_id: id(record.fareId), guest: { guest_id: id(record.guestId) }, expense_memo: record.expenseMemo }, record.runId));
      if (raw.guest != null && object(raw.guest).guest_id !== record.guestId || raw.product_id != null && raw.product_id !== record.productId || raw.product != null && object(raw.product).product_id !== record.productId) fail('MALFORMED_RESPONSE');
      const trip = normalizeTrip(raw);
      saved = { ...record, state: 'confirmed', requestId: trip.id }; result = { state: 'confirmed', bookingKey: record.bookingKey, trip };
    } catch (error) {
      const rejected = error instanceof UberSandboxError && ['ACCESS_DENIED', 'RATE_LIMITED', 'NOT_FOUND', 'REQUEST_REJECTED'].includes(error.code);
      saved = { ...record, state: rejected ? 'rejected' : 'uncertain' }; result = { state: saved.state as 'rejected' | 'uncertain', bookingKey: record.bookingKey };
    }
    try { await journal.save(saved); } catch { return { state: 'uncertain', bookingKey: record.bookingKey }; }
    return result;
  }
  async reconcile(bookingKey: string): Promise<BookingResult> {
    this.ready();
    const journal = this.journal();
    const record = await journal.read(id(bookingKey));
    if (!record || record.binding !== binding(record)) return fail('BOOKING_NOT_FOUND');
    const uncertain: BookingResult = { state: 'uncertain', bookingKey };
    if (record.state === 'rejected') return { state: 'rejected', bookingKey };
    try {
      if (record.requestId) return { state: 'confirmed', bookingKey, trip: await this.getTrip(record.requestId) };
      const matches = new Map<string, SandboxTrip>();
      for (const status of ['ACTIVE', 'PAST']) {
        let startKey = '';
        for (let page = 0; page < 3; page++) {
          const params = new URLSearchParams({ trip_status: status, limit: '50', ...(startKey ? { start_key: startKey } : {}) });
          const raw = object(await this.request('GET', `/v1/guests/trips?${params}`));
          if (!Array.isArray(raw.trips) || raw.trips.length > 50) return uncertain;
          for (const value of raw.trips) {
            const t = object(value);
            if (t.expense_memo !== record.expenseMemo) continue;
            if (object(t.guest).guest_id !== record.guestId || object(t.product).product_id !== record.productId) return uncertain;
            const pickup = object(t.pickup), destination = object(t.destination);
            if (pickup.latitude !== record.route.pickup.latitude || pickup.longitude !== record.route.pickup.longitude || destination.latitude !== record.route.dropoff.latitude || destination.longitude !== record.route.dropoff.longitude) return uncertain;
            const trip = normalizeTrip(t); matches.set(trip.id, trip);
          }
          if (raw.next_key == null || raw.next_key === '') break;
          if (typeof raw.next_key !== 'string' || raw.next_key.length > 2000 || page === 2) return uncertain;
          startKey = raw.next_key;
        }
      }
      if (matches.size !== 1) return uncertain;
      const trip = [...matches.values()][0];
      await journal.save({ ...record, state: 'confirmed', requestId: trip.id });
      return { state: 'confirmed', bookingKey, trip };
    } catch { return uncertain; }
  }
  async getTrip(requestId: string): Promise<SandboxTrip> {
    return normalizeTrip(await this.request('GET', `/v1/guests/trips/${id(requestId)}`), requestId);
  }
  async cancelTrip(requestId: string): Promise<SandboxTrip> {
    await this.request('DELETE', `/v1/guests/trips/${id(requestId)}`, undefined, undefined, true);
    return this.getTrip(requestId);
  }
  async advanceDriver(input: { runId: string; driverId: string; from: DriverState; to: DriverState }): Promise<void> {
    const transitions: Record<DriverState, DriverState[]> = { GO_ONLINE: ['ACCEPT', 'GO_OFFLINE'], ACCEPT: ['ARRIVED', 'CANCEL'], ARRIVED: ['BEGIN_TRIP', 'CANCEL'], BEGIN_TRIP: ['DROPOFF'], DROPOFF: [], CANCEL: [], GO_OFFLINE: ['GO_ONLINE'] };
    if (!Object.hasOwn(transitions, input.from) || !transitions[input.from].includes(input.to)) fail('INVALID_TRANSITION');
    await this.request('POST', '/v1/guests/sandbox/driver-state', { run_id: id(input.runId), driver_id: id(input.driverId), driver_state: input.to }, undefined, true);
  }
}
