export type SimulatedPayment = {
  mode: "simulated"; currency: "USD"; amountMinor: number; retainedMinor: number;
  state: "authorized" | "voided" | "captured" | "refunded" | "unknown";
};
function amount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000) throw new Error("Invalid simulated payment amount");
  return value;
}
function validate(payment: SimulatedPayment): void {
  if (!payment || payment.mode !== "simulated" || payment.currency !== "USD" || !["authorized", "voided", "captured", "refunded", "unknown"].includes(payment.state)) throw new Error("Invalid simulated payment");
  amount(payment.amountMinor); amount(payment.retainedMinor);
  if (payment.retainedMinor > payment.amountMinor || (["authorized", "voided", "refunded"].includes(payment.state) && payment.retainedMinor !== 0)) throw new Error("Invalid simulated payment retention");
}
function copy(payment: SimulatedPayment): SimulatedPayment {
  return { mode: "simulated", currency: "USD", amountMinor: payment.amountMinor, retainedMinor: payment.retainedMinor, state: payment.state };
}

/** State-only simulation: no card, account, processor, or real authorization. */
export function simulatedAuthorization(amountMinor: number): SimulatedPayment {
  return { mode: "simulated", currency: "USD", amountMinor: amount(amountMinor), retainedMinor: 0, state: "authorized" };
}

export function simulatedCancellation(payment: SimulatedPayment, cancellationFeeMinor: number): SimulatedPayment {
  validate(payment);
  const fee = amount(cancellationFeeMinor);
  if (fee > payment.amountMinor) throw new Error("Invalid simulated cancellation fee");
  const result = copy(payment);
  // Uncertainty cannot be turned into a refund just because cancellation was tried.
  if (payment.state === "unknown") return result;
  if (payment.state === "voided" || payment.state === "refunded") {
    if (fee !== 0) throw new Error("Invalid charge against released simulated payment");
    return result;
  }
  if (payment.state === "authorized") {
    return fee === 0 ? { ...result, state: "voided" } : { ...result, amountMinor: fee, retainedMinor: fee, state: "captured" };
  }
  // This is an immediate simulated refund, never credit for a pending real refund.
  if (fee > payment.retainedMinor) throw new Error("Invalid increase to captured simulated payment");
  return { ...result, retainedMinor: fee, state: fee === 0 ? "refunded" : "captured" };
}

export function paymentLiability(payment: SimulatedPayment): number {
  validate(payment);
  switch (payment.state) {
    case "authorized": case "unknown": return payment.amountMinor;
    case "captured": return payment.retainedMinor;
    case "voided": case "refunded": return 0;
  }
}
