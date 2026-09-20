import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { normalizeNetworkQuote } from "./provider-manifest";
import { demoDescriptors } from "./demo-provider";
import { paymentLiability } from "../lib/payments/simulated";

test("shared frozen fixtures preserve quote identity, dollars/minor units and explicit simulation", () => {
  const f = JSON.parse(readFileSync("src/agents/fixtures/provider-network-v2.json", "utf8"));
  const descriptor = demoDescriptors.find(p => p.id === "independent_ride")!;
  const request = { originZone: "Downtown Blacksburg", destinationZone: "VT residential campus", maxBudget: 10, minimizeWalking: true, minimizeTransfers: true };
  const normalized = normalizeNetworkQuote(f.quote, descriptor, request, Date.parse(f.evaluatedAt));
  assert.equal(normalized.candidate.cost, 7);
  assert.equal(normalized.candidate.planId, f.confirmation.planId);
  assert.equal(normalized.network.offer.quoteId, f.confirmation.quoteId);
  assert.equal(normalized.quoteSource, "simulated");
  assert.equal(normalizeNetworkQuote(f.noOffer, descriptor, request, Date.parse(f.evaluatedAt)).candidate.available, false);
  assert.equal(paymentLiability(f.bookingAccepted.payment), 700);
  assert.equal(paymentLiability(f.cancelled.payment), 0);
  assert.equal(f.checkingBooking.remainingBudgetMinor, 1000 - paymentLiability(f.checkingBooking.payments[0]));
  assert.equal(f.beforeConfirmation.operator.verification, "not_verified");
});
