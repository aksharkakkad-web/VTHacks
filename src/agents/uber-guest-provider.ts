import { createHash, randomUUID } from 'node:crypto';
import { GuestRidesSandboxClient, prepareBooking, SYNTHETIC_DEMO_ROUTE, type BookingJournal, type BookingRecord, type BookingResult, type SandboxConfig, type SandboxQuote, type SandboxTrip } from '../integrations/uber/guest-rides-sandbox';
import type { JsonStore } from '../lib/planner/store';
import { simulatedAuthorization } from '../lib/payments/simulated';
import { parseProviderTrip, point, text, type ProviderAgent, type ProviderDescriptor, type ProviderQuote, type ProviderTrip, type QuoteRequest, type TripRequest } from './contract';
import { networkProfile, normalizeNetworkQuote, parseProviderOffer, type NetworkOffer, type ProviderManifest } from './provider-manifest';
import type { JourneyRideBinding } from './student/journey-coordinator';

/** Internal adapter identity, never an assertion that ANS verified Uber. */
export const uberGuestSandboxDescriptor: ProviderDescriptor = {
  id: 'uber-guest-sandbox', serviceId: 'uber-guest-sandbox', name: 'Uber Guest Rides — sandbox',
  source: 'demo', mode: 'independent_ride', profileVersion: networkProfile,
  baseUrl: 'http://127.0.0.1:4315', agentHost: 'localhost',
  functions: ['quote_trip', 'request_trip', 'trip_status', 'cancel_trip', 'reconcile_trip'],
};
type SavedQuote = { network: NetworkOffer; sandbox: SandboxQuote };
type RequestBinding = { bookingKey: string; binding?: string; intent?: BookingRecord; cancelRequested: boolean; result?: ProviderTrip };
export type UberGuestProviderState = {
  version: 1; quotes: Record<string, SavedQuote>; requests: Record<string, RequestBinding>; bookings: Record<string, BookingRecord>;
};
export function emptyUberGuestProviderState(): UberGuestProviderState { return { version: 1, quotes: {}, requests: {}, bookings: {} }; }
export type UberGuestProviderConfig = SandboxConfig & { demoMode?: boolean; runId?: string; guestId?: string; productId?: string };
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const terminal = (result?: ProviderTrip) => result && ['completed', 'cancelled', 'declined'].includes(result.status);
const fail = (code: string): never => { throw new Error(`Uber sandbox provider: ${code}`); };
const instructions = 'Uber sandbox simulation only. No vehicle will arrive and no real charge occurs. Demo ledger policy: confirmed cancellation retains the full demo fare; confirmed decline voids the demo authorization. Actual Uber charges and cancellation fees are unknown.';

/** Atomic journal and request tombstones share the same durable store. */
class JsonBookingJournal implements BookingJournal {
  constructor(private readonly store: JsonStore<UberGuestProviderState>) {}
  claim(record: BookingRecord) {
    return this.store.update(state => {
      const request = Object.values(state.requests).find(r => r.bookingKey === record.bookingKey);
      if (!request || request.cancelRequested || state.bookings[record.bookingKey]) return false;
      state.bookings[record.bookingKey] = structuredClone(record); return true;
    });
  }
  async read(key: string) { return (await this.store.read()).bookings[key]; }
  async save(record: BookingRecord) {
    await this.store.update(state => {
      const prior = state.bookings[record.bookingKey];
      if (!prior || prior.binding !== record.binding) fail('JOURNAL_BINDING_CONFLICT');
      // A late uncertain write cannot discard an already reconciled request ID.
      if (prior.requestId && !record.requestId) return;
      if (prior.requestId && prior.requestId !== record.requestId) fail('JOURNAL_BINDING_CONFLICT');
      state.bookings[record.bookingKey] = structuredClone(record);
    });
  }
}

export class UberGuestProvider implements ProviderAgent {
  readonly descriptor = structuredClone(uberGuestSandboxDescriptor);
  private readonly client: GuestRidesSandboxClient;
  private readonly journal: BookingJournal;
  constructor(private readonly config: UberGuestProviderConfig, private readonly dependencies: { store: JsonStore<UberGuestProviderState>; fetch?: typeof fetch }) {
    this.journal = new JsonBookingJournal(dependencies.store);
    this.client = new GuestRidesSandboxClient(config, { fetch: dependencies.fetch, journal: this.journal });
  }
  private now() { return (this.config.now ?? Date.now)(); }
  private ready() {
    if (this.config.enabled !== true || this.config.demoMode !== true || this.config.apiFamily !== 'guest-rides') fail('DISABLED');
    if (!this.config.accessToken || !this.config.runId || !this.config.guestId) fail('MISSING_CONFIGURATION');
  }
  private authorization() { return { kind: 'synthetic_demo' as const, demoMode: this.config.demoMode === true }; }
  private manifest(): ProviderManifest {
    return { profileVersion: networkProfile, providerId: this.descriptor.id, serviceId: this.descriptor.serviceId!, operatorName: 'Beacon demo team — Uber sandbox adapter',
      operatorAnsId: null, endpoint: this.descriptor.baseUrl, mode: this.descriptor.mode, capabilities: [...this.descriptor.functions],
      serviceArea: { originZones: ['Downtown Blacksburg'], destinationZones: ['VT residential campus'] },
      executionMode: 'simulated', authorization: 'beacon-hmac-v1', payment: 'simulated-usd-v1' };
  }
  async quote(request: QuoteRequest): Promise<ProviderQuote> {
    this.ready();
    if (request.originZone !== 'Downtown Blacksburg' || request.destinationZone !== 'VT residential campus') fail('UNSUPPORTED_CORRIDOR');
    const quotes = await this.client.estimates(this.config.runId!, SYNTHETIC_DEMO_ROUTE, this.authorization());
    const sandbox = quotes.filter(q => !this.config.productId || q.productId === this.config.productId).sort((a, b) => a.amountMinor - b.amountMinor || a.productId.localeCompare(b.productId))[0];
    if (!sandbox) return fail('NO_SUPPORTED_OFFER');
    const now = this.now(), quoteId = randomUUID();
    const network: NetworkOffer = { manifest: this.manifest(), offer: {
      profileVersion: networkProfile, quoteId, providerId: this.descriptor.id, serviceId: this.descriptor.serviceId!,
      issuedAt: new Date(now).toISOString(), expiresAt: new Date(Math.min(sandbox.expiresAt, now + 120_000)).toISOString(), available: true,
      price: { currency: 'USD', totalMinor: sandbox.amountMinor, kind: 'fixed', feesIncluded: true },
      // This is our conservative sandbox budget policy, not Uber's minimum fee.
      cancellation: { feeMinor: sandbox.amountMinor }, pickup: { instructions, accessVerified: false },
      waitMinutes: sandbox.pickupEtaMinutes, travelMinutes: sandbox.travelSeconds / 60, walkingMinutes: 0, transfers: 0, simulated: true,
    } };
    const normalized = normalizeNetworkQuote(network, this.descriptor, request, now);
    await this.dependencies.store.update(state => { state.quotes[quoteId] = { network: structuredClone(network), sandbox: structuredClone(sandbox) }; });
    return { ...normalized.candidate, network: normalized.network, quoteSource: 'simulated', quoteExpiresAt: normalized.quoteExpiresAt };
  }
  async journeyRideBinding(network: NetworkOffer): Promise<JourneyRideBinding | null> {
    this.ready();
    const saved = (await this.dependencies.store.read()).quotes[network.offer.quoteId];
    if (!saved || digest(saved.network) !== digest(network) || Date.parse(saved.network.offer.expiresAt) <= this.now()) return null;
    const pickupAt = Date.parse(network.offer.issuedAt) + network.offer.waitMinutes * 60_000;
    return {
      pickup: { id: 'uber-sandbox-pickup', name: 'Sandbox pickup (simulated access)', point: { lat: saved.sandbox.route.pickup.latitude, lng: saved.sandbox.route.pickup.longitude } },
      dropoff: { id: 'uber-sandbox-dropoff', name: 'Sandbox drop-off (simulated access)', point: { lat: saved.sandbox.route.dropoff.latitude, lng: saved.sandbox.route.dropoff.longitude } },
      pickupAt: new Date(pickupAt).toISOString(), arrivalAt: new Date(pickupAt + saved.sandbox.travelSeconds * 1000).toISOString(), pickupPermitted: true,
    };
  }
  async requestTrip(request: TripRequest): Promise<ProviderTrip> {
    this.ready();
    const requestId = text(request.tripId, 'request ID');
    const consentId = text(request.network?.consentId, 'consent ID');
    const pickup = point(request.pickup), destination = point(request.destination);
    if (pickup.lat !== SYNTHETIC_DEMO_ROUTE.pickup.latitude || pickup.lng !== SYNTHETIC_DEMO_ROUTE.pickup.longitude
      || destination.lat !== SYNTHETIC_DEMO_ROUTE.dropoff.latitude || destination.lng !== SYNTHETIC_DEMO_ROUTE.dropoff.longitude) fail('SYNTHETIC_ENDPOINT_MISMATCH');
    const offer = request.network!.offer;
    const key = digest(requestId), binding = digest([requestId, offer, pickup, destination, consentId]);
    const saved = (await this.dependencies.store.read()).quotes[offer.quoteId];
    if (!saved || digest(saved.network.offer) !== digest(offer)) fail('QUOTE_BINDING_MISMATCH');
    const record = await this.dependencies.store.update(state => {
      const existing = state.requests[key];
      if (existing) {
        if (existing.binding && existing.binding !== binding) fail('IDEMPOTENCY_CONFLICT');
        return existing;
      }
      parseProviderOffer(offer, saved.network.manifest, this.now());
      const intent = prepareBooking({ bookingKey: randomUUID(), quote: saved.sandbox, guestId: this.config.guestId!, approvedAmountMinor: offer.price.totalMinor }, this.now());
      const next: RequestBinding = { bookingKey: intent.bookingKey, binding, intent, cancelRequested: false };
      state.requests[key] = next; return next;
    });
    if (terminal(record.result)) return record.result!;
    const prior = await this.journal.read(record.bookingKey);
    const result = prior ? await this.client.reconcile(record.bookingKey) : await this.client.createTrip(record.intent!, this.authorization());
    return this.finish(record.bookingKey, result);
  }
  private async requestFor(bookingKey: string) {
    const record = Object.values((await this.dependencies.store.read()).requests).find(r => r.bookingKey === bookingKey);
    return record ?? fail('BOOKING_NOT_FOUND');
  }
  private async saveResult(bookingKey: string, result: ProviderTrip) {
    return this.dependencies.store.update(state => {
      const record = Object.values(state.requests).find(r => r.bookingKey === bookingKey);
      if (!record) return fail('BOOKING_NOT_FOUND');
      if (!terminal(record.result)) record.result = result;
      return record.result!;
    });
  }
  private async finish(bookingKey: string, result: BookingResult): Promise<ProviderTrip> {
    const record = await this.requestFor(bookingKey);
    if (terminal(record.result)) return record.result!;
    if (result.state === 'uncertain') return fail('BOOKING_UNCERTAIN');
    if (result.state === 'rejected') return this.saveResult(bookingKey, { id: bookingKey, status: 'declined', payment: { ...simulatedAuthorization(record.intent!.amountMinor), state: 'voided' } });
    if (result.state !== 'confirmed') return fail('BOOKING_UNCERTAIN');
    const trip = record.cancelRequested && !['cancelled', 'completed', 'declined'].includes(result.trip.status) ? await this.client.cancelTrip(result.trip.id) : result.trip;
    return this.saveResult(bookingKey, this.normalize(bookingKey, trip, record.intent!.amountMinor));
  }
  private normalize(id: string, trip: SandboxTrip, amountMinor: number): ProviderTrip {
    const status = trip.status === 'in_progress' ? 'in_trip' : ['completed', 'cancelled', 'declined'].includes(trip.status) ? trip.status : 'waiting';
    const stages = { processing: 'searching', accepted: 'assigned', arriving: 'approaching', in_progress: 'in_trip', completed: 'completed', cancelled: 'cancelled', declined: 'unknown' };
    const payment = simulatedAuthorization(amountMinor);
    // Explicit Beacon demo ledger policy, never an inference about Uber charges.
    // Uncertain booking results cannot reach this authoritative-status branch.
    if (trip.status === 'completed' || trip.status === 'cancelled') { payment.state = 'captured'; payment.retainedMinor = amountMinor; }
    else if (trip.status === 'declined') payment.state = 'voided';
    return parseProviderTrip({ id, status, payment, details: {
      stage: stages[trip.status], ...(trip.pickupEtaMinutes === null || ['in_progress', 'completed', 'cancelled', 'declined'].includes(trip.status) ? {} : { pickupEtaSeconds: trip.pickupEtaMinutes * 60 }),
      meetingInstructions: trip.meetingInstructions ?? instructions,
      ...(trip.driver ? { driver: { displayName: trip.driver.name } } : {}), ...(trip.vehicle ? { vehicle: trip.vehicle } : {}),
    } });
  }
  async getStatus(id: string): Promise<ProviderTrip> {
    this.ready(); const record = await this.requestFor(text(id, 'booking ID'));
    return terminal(record.result) ? record.result! : this.finish(id, await this.client.reconcile(id));
  }
  async getRequestStatus(requestId: string): Promise<ProviderTrip | undefined> {
    this.ready(); const record = (await this.dependencies.store.read()).requests[digest(text(requestId, 'request ID'))];
    if (!record) return undefined;
    if (terminal(record.result)) return record.result!;
    // An intent exists but the process may have stopped before/after transmission.
    if (!await this.journal.read(record.bookingKey)) return fail('BOOKING_UNCERTAIN');
    return this.finish(record.bookingKey, await this.client.reconcile(record.bookingKey));
  }
  async cancelRequest(requestId: string): Promise<ProviderTrip> {
    this.ready(); const key = digest(text(requestId, 'request ID'));
    const record = await this.dependencies.store.update(state => {
      const request = state.requests[key] ??= { bookingKey: randomUUID(), cancelRequested: false };
      request.cancelRequested = true;
      if (!state.bookings[request.bookingKey] && !request.result) request.result = { id: request.bookingKey, status: 'cancelled', payment: { ...simulatedAuthorization(0), state: 'voided' } };
      return request;
    });
    return terminal(record.result) ? record.result! : this.finish(record.bookingKey, await this.client.reconcile(record.bookingKey));
  }
  async cancelTrip(id: string): Promise<ProviderTrip> {
    this.ready(); const record = await this.requestFor(text(id, 'booking ID'));
    if (terminal(record.result)) return record.result!;
    await this.dependencies.store.update(state => { const request = Object.values(state.requests).find(r => r.bookingKey === id)!; request.cancelRequested = true; });
    return this.finish(id, await this.client.reconcile(id));
  }
}
