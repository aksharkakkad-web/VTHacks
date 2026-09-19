import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type BookingGrantClaims = {
  version: 1; issuer: "beacon"; audience: string; scope: "book_trip"; requestId: string; quoteId: string;
  payloadHash: string; amountMinor: number; currency: "USD"; issuedAt: number; expiresAt: number; simulated: true;
};
const prefix = "beacon-hmac-v1";
function invalid(label: string): never { throw new Error(`Invalid ${label}`); }
function text(value: unknown, label: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) invalid(label);
  return value;
}
function integer(value: unknown, label: string, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) invalid(label);
  return value;
}
function signingKey(key: string) {
  if (typeof key !== "string" || key.trim().length < 16 || key.length > 4096) invalid("booking signing key");
  return key;
}
function digest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) invalid("booking payload hash");
  return value;
}
function parseClaims(value: unknown, now: number): BookingGrantClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("booking claims");
  const claims = value as Record<string, unknown>;
  if (claims.version !== 1 || claims.issuer !== "beacon" || claims.scope !== "book_trip" || claims.currency !== "USD" || claims.simulated !== true) invalid("booking grant constants");
  const issuedAt = integer(claims.issuedAt, "booking issue time");
  const expiresAt = integer(claims.expiresAt, "booking expiry");
  integer(now, "current time");
  if (issuedAt > now || expiresAt <= now || expiresAt <= issuedAt || expiresAt - issuedAt > 120_000) invalid("booking grant lifetime");
  return {
    version: 1, issuer: "beacon", audience: text(claims.audience, "booking audience", 512), scope: "book_trip",
    requestId: text(claims.requestId, "booking request ID"), quoteId: text(claims.quoteId, "booking quote ID"), payloadHash: digest(claims.payloadHash),
    amountMinor: integer(claims.amountMinor, "booking amount", 1_000_000), currency: "USD", issuedAt, expiresAt, simulated: true,
  };
}
function location(value: { lat: number; lng: number }) {
  if (!value || typeof value.lat !== "number" || !Number.isFinite(value.lat) || Math.abs(value.lat) > 90 || typeof value.lng !== "number" || !Number.isFinite(value.lng) || Math.abs(value.lng) > 180) invalid("booking coordinates");
  return { lat: value.lat, lng: value.lng };
}

/** Explicit ordering makes hashes stable; raw coordinates never enter grant claims. */
export function bookingPayloadHash(input: { requestId: string; quoteId: string; pickup: { lat: number; lng: number }; destination: { lat: number; lng: number } }): string {
  if (!input) invalid("booking payload");
  const payload = { requestId: text(input.requestId, "booking request ID"), quoteId: text(input.quoteId, "booking quote ID"), pickup: location(input.pickup), destination: location(input.destination) };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function issueBookingGrant(claims: BookingGrantClaims, key: string): string {
  signingKey(key);
  const body = Buffer.from(JSON.stringify(parseClaims(claims, Date.now()))).toString("base64url");
  const content = `${prefix}.${body}`;
  return `${content}.${createHmac("sha256", key).update(content).digest("base64url")}`;
}

/** Exact retries may verify again. The provider's persistent request store must
 * enforce booking idempotency; this signature alone is not replay storage. */
export function verifyBookingGrant(token: string, key: string, expected: { audience: string; requestId: string; quoteId: string; payloadHash: string; amountMinor: number }, now = Date.now()): BookingGrantClaims {
  signingKey(key);
  if (typeof token !== "string" || token.length > 8192) invalid("booking token");
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== prefix || !/^[a-zA-Z0-9_-]+$/.test(parts[1]) || !/^[a-zA-Z0-9_-]{43}$/.test(parts[2])) invalid("booking token format");
  const actual = Buffer.from(parts[2], "base64url");
  const signature = createHmac("sha256", key).update(`${prefix}.${parts[1]}`).digest();
  if (actual.length !== signature.length || actual.toString("base64url") !== parts[2] || !timingSafeEqual(actual, signature)) invalid("booking signature");
  const body = Buffer.from(parts[1], "base64url");
  if (body.toString("base64url") !== parts[1]) invalid("booking token encoding");
  let value: unknown;
  try { value = JSON.parse(body.toString("utf8")); } catch { invalid("booking claims encoding"); }
  const claims = parseClaims(value, now);
  if (!expected || claims.audience !== expected.audience || claims.requestId !== expected.requestId || claims.quoteId !== expected.quoteId || claims.payloadHash !== expected.payloadHash || claims.amountMinor !== expected.amountMinor) invalid("booking grant binding");
  return claims;
}
