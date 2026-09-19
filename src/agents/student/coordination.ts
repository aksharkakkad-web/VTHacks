import { createHash, randomUUID } from "node:crypto";
import { object, type ProviderTrip } from "../contract";
import type { NetworkOffer } from "../provider-manifest";
import { validateProviderOutcome } from "../../lib/decision-client/provider-outcomes";
import { paymentLiability, simulatedAuthorization } from "../../lib/payments/simulated";
import { TripError, type NetworkAttempt, type TripRecord } from "../../lib/trip-state/model";

export function selectedOffer(record: TripRecord) { return record.networkOffers?.[record.trip.selectedPlan?.planId ?? ""]; }
function termsHash(network: NetworkOffer) {
  return createHash("sha256").update(JSON.stringify(network)).digest("hex");
}
export function remainingBudgetMinor(record: TripRecord) {
  const limit = Math.floor(record.context.maxBudget * 100 + 1e-8);
  return Math.max(0, limit - (record.networkAttempts ?? []).reduce((sum, attempt) => sum + paymentLiability(attempt.payment), 0));
}
export function confirmNetwork(record: TripRecord, input: unknown) {
  const network = selectedOffer(record); if (!network) return;
  const displayed = object(input);
  if (displayed.planId !== record.trip.selectedPlan?.planId || displayed.quoteId !== network.offer.quoteId) throw new TripError("SELECTION_CHANGED", "Review the current offer and its price before confirming");
  if (network.offer.price.totalMinor > remainingBudgetMinor(record)) throw new TripError("BUDGET_EXCEEDED", "Outstanding payments leave insufficient budget");
  record.networkConsent = { id: randomUUID(), planId: displayed.planId as string, quoteId: network.offer.quoteId, termsHash: termsHash(network) };
  delete record.networkAction;
}
export function requireNetworkConsent(record: TripRecord) {
  const network = selectedOffer(record); if (!network) return;
  const consent = record.networkConsent;
  if (!record.confirmed || !consent || consent.planId !== record.trip.selectedPlan?.planId || consent.quoteId !== network.offer.quoteId || consent.termsHash !== termsHash(network)) throw new TripError("CONFIRMATION_REQUIRED", "Confirm this provider's current offer before booking");
  if (network.offer.price.totalMinor > remainingBudgetMinor(record)) throw new TripError("BUDGET_EXCEEDED", "Outstanding payments leave insufficient budget");
}
export function beginNetworkAttempt(record: TripRecord, requestId: string, now: number) {
  const network = selectedOffer(record); if (!network) return;
  const attempt: NetworkAttempt = {
    requestId, providerId: network.offer.providerId, quoteId: network.offer.quoteId, observationId: randomUUID(),
    amountMinor: network.offer.price.totalMinor, cancellationFeeMinor: network.offer.cancellation.feeMinor,
    payment: { ...simulatedAuthorization(network.offer.price.totalMinor), state: "unknown" }, requestedAt: new Date(now).toISOString(),
  };
  (record.networkAttempts ??= []).push(attempt);
  record.networkAction = "check_booking";
}
export function networkAttempt(record: TripRecord, requestId = record.pendingBooking?.requestId ?? record.booking?.requestId) {
  return record.networkAttempts?.find(attempt => attempt.requestId === requestId);
}
export function uncertainPayment(record: TripRecord, requestId?: string) {
  const attempt = networkAttempt(record, requestId); if (!attempt) return;
  attempt.payment = { ...simulatedAuthorization(attempt.amountMinor), state: "unknown" };
  record.networkAction = "check_booking";
}

/** A cancellation status is not a refund. Require a consistent payment result
 * from the authenticated provider before releasing any simulated budget. */
export function acceptNetworkResult(record: TripRecord, result: ProviderTrip | void, now: number, requestId?: string) {
  const attempt = networkAttempt(record, requestId); if (!attempt) return;
  try {
    if (!result?.payment) throw new Error("Missing payment result");
    const payment = result.payment;
    paymentLiability(payment);
    if (payment.amountMinor > attempt.amountMinor || payment.retainedMinor > attempt.amountMinor || payment.state === "unknown") throw new Error("Uncertain payment");
    if (["accepted", "waiting", "in_trip"].includes(result.status) && (payment.state !== "authorized" || payment.amountMinor !== attempt.amountMinor)) throw new Error("Invalid authorization result");
    if (result.status === "cancelled" && (!["voided", "refunded", "captured"].includes(payment.state) || payment.retainedMinor > attempt.cancellationFeeMinor)) throw new Error("Cancellation not settled");
    if (result.status === "declined" && paymentLiability(payment) !== 0) throw new Error("Declined payment still held");
    if (result.status === "completed" && (payment.state !== "captured" || payment.retainedMinor !== attempt.amountMinor)) throw new Error("Completion not settled");
    attempt.payment = { mode: "simulated", currency: "USD", amountMinor: payment.amountMinor, retainedMinor: payment.retainedMinor, state: payment.state };
    if (["accepted", "waiting", "in_trip", "completed"].includes(result.status)) attempt.acceptedAt ??= new Date(now).toISOString();
    if (["completed", "cancelled", "declined"].includes(result.status)) {
      attempt.finalizedAt ??= new Date(now).toISOString();
      attempt.outcome ??= result.status === "cancelled" ? "canceled" : result.status as "completed" | "declined";
    }
    if (attempt.finalizedAt && (attempt.outcome === "completed" || attempt.outcome === "canceled") && !record.outcomeOutbox?.some(job => job.payload.observationId === attempt.observationId)) {
      const payload = validateProviderOutcome({ providerId: attempt.providerId, observationId: attempt.observationId,
        requestedAt: attempt.requestedAt, acceptedAt: attempt.acceptedAt ?? null, promisedPickupAt: null, actualPickupAt: null,
        completedAt: attempt.outcome === "completed" ? attempt.finalizedAt : null,
        canceledAt: attempt.outcome === "canceled" ? attempt.finalizedAt : null,
        cancellationParty: attempt.outcome === "canceled" ? "unknown" : null,
        finalOutcome: attempt.outcome, source: "simulated", observedAt: attempt.finalizedAt, dataVersion: "beacon-mobility-v2" });
      (record.outcomeOutbox ??= []).push({ payload, sent: false, attempts: 0, retryAt: now });
    }
    delete record.networkAction;
  } catch {
    uncertainPayment(record, attempt.requestId);
    throw new TripError("SETTLEMENT_UNCERTAIN", "Checking the previous booking and demo payment before another request", 502);
  }
}

/** Cleanup/fencing succeeds only when the booking itself is terminal. */
export function acceptCancellationResult(record: TripRecord, result: ProviderTrip | void, now: number, requestId?: string) {
  if (networkAttempt(record, requestId) && (!result || !["cancelled", "completed", "declined"].includes(result.status))) {
    uncertainPayment(record, requestId);
    throw new TripError("SETTLEMENT_UNCERTAIN", "Previous booking is still active or its cancellation is unknown", 502);
  }
  acceptNetworkResult(record, result, now, requestId);
}

export function coordinationView(record: TripRecord, now: number) {
  const network = selectedOffer(record);
  const terminal = ["ARRIVED", "FAILED"].includes(record.trip.state) && !record.pendingBooking;
  const expired = network ? Date.parse(network.offer.expiresAt) <= now : record.quoteDeadline <= now;
  const needsConfirmation = !!record.trip.selectedPlan && !record.confirmed && !record.booking && !record.pendingBooking && ["SELECTED", "OVERDUE"].includes(record.trip.state);
  const requiredAction = record.pendingBooking || record.networkAction === "check_booking" ? "check_booking"
    : record.networkAction === "payment_declined" ? "payment_declined"
    : terminal ? "none" : needsConfirmation ? expired ? "refresh_quotes" : "confirm" : record.trip.state === "COLLECTING_QUOTES" && expired ? "refresh_quotes" : "none";
  return {
    version: "beacon-coordination-v1", requiredAction,
    remainingBudgetMinor: remainingBudgetMinor(record), currency: "USD",
    paymentMode: "simulated", paymentNotice: "Demo payment — no charge",
    ...(network ? {
      operator: { name: network.manifest.operatorName, ansId: network.manifest.operatorAnsId,
        verification: record.identity?.source === "ans" && record.identity.validUntil > now ? "ans_verified" : record.identity?.source === "local-demo" && record.identity.validUntil > now ? "local_demo" : "not_verified" },
      selectedOffer: { planId: record.trip.selectedPlan!.planId, quoteId: network.offer.quoteId, serviceId: network.offer.serviceId,
        totalMinor: network.offer.price.totalMinor, currency: network.offer.price.currency, expiresAt: network.offer.expiresAt,
        cancellationFeeMinor: network.offer.cancellation.feeMinor, pickupInstructions: network.offer.pickup.instructions,
        pickupAccessVerified: network.offer.pickup.accessVerified, simulated: true },
    } : {}),
    payments: (record.networkAttempts ?? []).map(attempt => ({ providerId: attempt.providerId, ...attempt.payment })),
  };
}
