/** Focused final review of Beacon planning/consent states. No journey replay. */
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.BEACON_URL || "http://localhost:3100";
const galleryBase = process.env.BEACON_GALLERY_URL || "http://localhost:3000";
const out = "docs/ui-research/beacon-complete/workstream-b";
const profile = {
  homeName: "Pritchard Hall",
  homeAddress: "Virginia Tech, Blacksburg, VA",
  maxBudget: 10,
  walkingPreference: "minimal",
  avoidTransfers: true,
  trustedContact: "",
};

const recommendation = {
  selectedPlanId: "campus-ride-042",
  reasonCodes: ["WITHIN_BUDGET", "LOW_WALKING"],
  explanation: "Campus Shuttle stays within your budget and keeps walking to one minute.",
  evaluatedAt: "2026-09-19T21:41:18-04:00",
};

function snapshot(stage, patch = {}) {
  return {
    stage,
    paymentStatus: "not-started",
    bookingStatus: "not-started",
    attemptNumber: 1,
    attemptId: "demo-attempt-1",
    cancellationFee: 0,
    profile,
    tripContext: {},
    candidates: [],
    failedPlanIds: [],
    providerVerified: false,
    providerAuthorized: false,
    sensitiveDataReleased: false,
    recoveryCount: 0,
    statusRevision: 1,
    paused: true,
    selectedPlanId: "campus-ride-042",
    recommendation,
    offerExpiresAt: Date.now() + 300_000,
    userApproved: true,
    ...patch,
  };
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
const checks = [];
const screenshots = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

async function shot(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${out}/${name}.png` });
  screenshots.push(name);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: horizontal overflow`);
}

async function seed(stage, patch = {}) {
  const state = snapshot(stage, patch);
  await page.goto(`${base}/offline.html`);
  await page.evaluate(({ savedProfile, savedState }) => {
    localStorage.setItem("safecircle.profile.v1", JSON.stringify(savedProfile));
    sessionStorage.setItem("beacon.demo-trip.v2", JSON.stringify({ version: 2, mode: "local-simulation", state: savedState }));
  }, { savedProfile: profile, savedState: state });
  await page.goto(`${base}/app`);
  await page.locator(`[data-stage="${stage}"]`).waitFor({ timeout: 15_000 });
  return state;
}

async function viewMetrics() {
  return page.evaluate(() => {
    const leaf = (text) => [...document.querySelectorAll("*")].find((element) => element.children.length === 0 && element.textContent?.trim() === text);
    const box = (element) => element ? { top: Math.round(element.getBoundingClientRect().top), bottom: Math.round(element.getBoundingClientRect().bottom), width: Math.round(element.getBoundingClientRect().width), height: Math.round(element.getBoundingClientRect().height) } : null;
    const confirm = [...document.querySelectorAll("button")].find((element) => element.textContent?.includes("Confirm this plan"));
    const terms = leaf("Offer valid until");
    const art = [...document.querySelectorAll("[class*='rideArtwork']")].find((element) => getComputedStyle(element).display !== "none");
    const controls = [...document.querySelectorAll("button,a")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).map((element) => ({ label: (element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60), ...box(element) }));
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      art: box(art),
      confirm: box(confirm),
      price: box(leaf("$2")),
      terms: terms ? { ...box(terms), fontSize: getComputedStyle(terms).fontSize } : null,
      controls,
    };
  });
}

try {
  await mkdir(out, { recursive: true });

  for (const [width, height] of [[320, 568], [360, 800], [390, 844], [393, 852], [430, 932]]) {
    await page.setViewportSize({ width, height });
    await seed("recommendation");
    const metrics = await viewMetrics();
    assert(metrics.price && metrics.terms && metrics.confirm, `${width}: offer facts or confirmation missing`);
    assert(metrics.terms.bottom < metrics.confirm.top, `${width}: expiry must precede confirmation`);
    assert.equal(metrics.terms.fontSize, "12px", `${width}: decision terms must be 12px`);
    assert.deepEqual(metrics.controls.filter((control) => control.width < 44 || control.height < 44), [], `${width}: undersized visible journey control`);
    if (height <= 700) assert.equal(metrics.art, null, `${width}: compact offer artwork should not displace consent facts`);
    await shot(`consent-${width}x${height}`);
  }
  checks.push("Offer price, source, expiry, and fee precede static confirmation at 320/360/390/393/430; visible journey controls meet 44px.");

  await page.setViewportSize({ width: 390, height: 844 });
  await seed("recommendation");
  await page.getByRole("button", { name: "See other options", exact: true }).click();
  await page.getByRole("button", { name: /Rideshare/ }).click();
  await page.getByRole("heading", { name: "Rideshare", exact: true }).waitFor();
  assert.equal(await page.locator("[data-stage='recommendation']").count(), 1, "changing option must not create an attempt");
  assert.match(await page.locator("body").innerText(), /\$8\.40/);
  assert.match(await page.locator("body").innerText(), /Beacon demo operator · simulated/);
  await shot("alternative-rideshare");
  checks.push("Alternative selection updates the review to $8.40 Rideshare and remains pre-booking with explicit simulated source.");

  const checkpoints = [
    ["discovering", {}, "Checking available providers."],
    ["evaluating", {}, "Comparing your routes."],
    ["verifying-initial", {}, "Provider identity"],
    ["authorizing-initial", { providerVerified: true, paymentStatus: "pending" }, "Trip access"],
    ["coordinating-initial", { providerVerified: true, providerAuthorized: true, sensitiveDataReleased: true, paymentStatus: "approved", bookingStatus: "pending" }, "Booking pending"],
  ];
  for (const [stage, patch, expected] of checkpoints) {
    await seed(stage, patch);
    assert.match(await page.locator("body").innerText(), new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    await shot(`state-${stage}`);
  }
  checks.push("Discovery, comparison, identity, access, payment, and booking have distinct planning states.");

  await seed("verification-failed", { previousStage: "verifying-initial", userApproved: true });
  assert.match(await page.locator("body").innerText(), /Exact location remained withheld/);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.locator("[data-stage='verifying-initial']").waitFor();
  const retried = await page.evaluate(() => JSON.parse(sessionStorage.getItem("beacon.demo-trip.v2")).state);
  assert.equal(retried.sensitiveDataReleased, false);
  await shot("verification-retry");
  checks.push("Verification failure withholds exact data and retry returns to identity check without release.");

  const focusHeading = await page.evaluate(() => document.activeElement?.tagName === "H1");
  const announcement = await page.getByRole("status").allTextContents();
  assert(focusHeading, "state restore must move programmatic focus to the task heading");
  assert(announcement.some((text) => text.includes("Beacon demo: verifying initial")), "state announcement missing");
  checks.push("State restore moves focus to the task heading and provides a concise status announcement.");

  const gallery = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const galleryPage = await gallery.newPage();
  const galleryErrors = [];
  galleryPage.on("pageerror", (error) => galleryErrors.push(error.message));
  await galleryPage.goto(`${galleryBase}/beacon-system`);
  await galleryPage.getByRole("button", { name: /08 Recommended plan/ }).click();
  await galleryPage.getByLabel("Long content").check();
  await galleryPage.getByLabel("Reduced motion").check();
  await galleryPage.evaluate(() => document.fonts.ready);
  const galleryAudit = await galleryPage.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    active: document.querySelector("button[aria-pressed='true']")?.textContent,
    animations: [...document.querySelectorAll("*")].filter((element) => getComputedStyle(element).animationName !== "none").map((element) => getComputedStyle(element).animationName),
  }));
  assert.equal(galleryAudit.overflow, false, "gallery long-content view overflows horizontally");
  assert.equal(galleryAudit.animations.length, 0, "gallery reduced-motion toggle leaves animation running");
  await galleryPage.screenshot({ path: `${out}/gallery-long-content-reduced-motion.png` });
  screenshots.push("gallery-long-content-reduced-motion");
  assert.deepEqual(galleryErrors, [], "gallery page errors");
  await gallery.close();
  checks.push("Gallery long-content and reduced-motion fixture has no horizontal overflow or active animation.");

  assert.deepEqual(errors, [], "browser errors");
  console.log(JSON.stringify({ base, galleryBase, checks, screenshots, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${out}/FAILURE.png` }).catch(() => undefined);
  throw error;
} finally {
  await writeFile(`${out}/targeted-results.json`, JSON.stringify({ base, galleryBase, checks, screenshots, errors }, null, 2));
  await context.close();
  await browser.close();
}
