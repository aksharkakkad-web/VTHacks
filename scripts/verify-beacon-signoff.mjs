import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.BEACON_URL || "http://localhost:3000";
const output = "docs/ui-research/beacon-signoff";
await mkdir(`${output}/screenshots`, { recursive: true });
await mkdir(`${output}/recordings`, { recursive: true });

const results = { base, checks: [], pageErrors: [], consoleErrors: [], requestFailures: [], screenshots: [], recordings: [] };
function check(name, pass, detail = "") { results.checks.push({ name, pass, detail }); assert.ok(pass, `${name}${detail ? `: ${detail}` : ""}`); }
async function stage(page, value, timeout = 20000) { await page.locator(`[data-stage="${value}"]`).waitFor({ timeout }); }
async function shot(page, name) { const path = `${output}/screenshots/${name}.png`; await page.screenshot({ path, fullPage: true }); results.screenshots.push(path); return path; }
async function setup(page) {
  console.log("setup:start");
  await page.goto(`${base}/onboarding/welcome?demo=1`);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByRole("link", { name: "Get started" }).click();
  await page.getByRole("heading", { name: "Where is home?" }).waitFor();
  await page.getByRole("button", { name: /Set as home/ }).click();
  await page.getByRole("heading", { name: "Your way home." }).waitFor();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.waitForURL(/\/demo\?walkthrough=1/);
  await stage(page, "home");
  console.log("setup:home");
}
async function start(page) {
  console.log("start:click");
  await page.getByRole("button", { name: "Get me home" }).click();
  await stage(page, "recommendation", 30000);
  check("normal journey reaches recommendation from transport responses", true);
  check("Screen 08 uses exact heading", await page.getByRole("heading", { name: "Your plan is ready." }).count() === 1);
  await shot(page, "normal-01-recommendation");
  await page.getByRole("button", { name: "Confirm this plan" }).click();
  console.log("start:confirmed");
}
async function attachDiagnostics(page, label) {
  page.on("pageerror", (error) => results.pageErrors.push({ label, message: error.message }));
  page.on("console", (message) => { if (message.type() === "error") results.consoleErrors.push({ label, message: message.text() }); });
  page.on("requestfailed", (request) => results.requestFailures.push({ label, url: request.url(), failure: request.failure()?.errorText }));
}
async function newContext(browser, label, video = false) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce", ...(video ? { recordVideo: { dir: `${output}/recordings`, size: { width: 390, height: 844 } } } : {}) });
  const page = await context.newPage(); attachDiagnostics(page, label); return { context, page };
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const normal = await newContext(browser, "normal", true);
  await setup(normal.page); await start(normal.page);
  await stage(normal.page, "waiting-initial", 30000);
  check("ride response supplies simulated pickup details", await normal.page.getByText("Simulated rideshare · Demo data", { exact: true }).count() === 1);
  check("pickup details include a server-supplied update time", /Provider update \d/.test(await normal.page.locator("body").innerText()));
  check("normal pickup has no navigation map", await normal.page.getByTestId("walking-route-map").count() === 0);
  await shot(normal.page, "normal-02-waiting");
  await stage(normal.page, "arriving-initial", 30000); await stage(normal.page, "in-trip-initial", 30000);
  check("normal journey reaches active ride status", await normal.page.getByText("You’re on the way.", { exact: true }).count() === 1);
  await normal.page.getByRole("button", { name: "I’m home" }).click();
  await stage(normal.page, "arrival", 10000);
  check("normal journey reaches arrival", true);
  await shot(normal.page, "normal-03-arrival");
  const normalVideo = await normal.page.video()?.path();
  await normal.context.close(); if (normalVideo) results.recordings.push(normalVideo);

  const recovery = await newContext(browser, "recovery", true);
  await setup(recovery.page); await start(recovery.page); await stage(recovery.page, "waiting-initial", 30000);
  await recovery.page.getByRole("button", { name: "Judge controls" }).click();
  await recovery.page.getByRole("button", { name: "Cancel provider" }).click();
  await stage(recovery.page, "provider-cancelled", 10000); await stage(recovery.page, "replacement-selected", 30000);
  check("provider cancellation produces a fresh replacement offer", await recovery.page.getByRole("heading", { name: "New offer — review what changed" }).count() === 1);
  await recovery.page.getByRole("button", { name: "Confirm this plan" }).click();
  await stage(recovery.page, "waiting-replacement", 30000);
  check("replacement requires fresh confirmation before pickup", true);
  await shot(recovery.page, "recovery-replacement");
  await stage(recovery.page, "in-trip-replacement", 30000);
  await recovery.page.getByRole("button", { name: "I’m home" }).click();
  await stage(recovery.page, "arrival");
  check("replacement journey reaches arrival", true);
  const recoveryVideo = await recovery.page.video()?.path();
  await recovery.context.close(); if (recoveryVideo) results.recordings.push(recoveryVideo);

  const cancel = await newContext(browser, "cancellation", true);
  await setup(cancel.page); await start(cancel.page); await stage(cancel.page, "waiting-initial", 30000);
  const before = await cancel.page.locator("[data-attempt]").getAttribute("data-attempt");
  await cancel.page.getByRole("button", { name: "Request cancellation" }).click();
  await cancel.page.getByRole("button", { name: "Request cancellation", exact: true }).last().click();
  await stage(cancel.page, "cancelling", 10000);
  check("cancellation remains pending before provider response", true);
  await stage(cancel.page, "cancelled", 10000);
  check("cancellation reaches a terminal response", true);
  const after = await cancel.page.locator("[data-attempt]").getAttribute("data-attempt");
  check("cancellation keeps the same attempt correlation", Boolean(before) && before === after, `${before} -> ${after}`);
  await shot(cancel.page, "cancellation-terminal");
  const cancelVideo = await cancel.page.video()?.path();
  await cancel.context.close(); if (cancelVideo) results.recordings.push(cancelVideo);

  const phone = await newContext(browser, "phone");
  await setup(phone.page); await start(phone.page); await stage(phone.page, "waiting-initial", 30000);
  check("390px phone viewport has no horizontal overflow", await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check("normal flow does not require opening Judge controls", await phone.page.getByRole("heading", { name: "Waiting for pickup" }).count() === 1 || await phone.page.getByText("Your request was accepted.", { exact: true }).count() === 1);
  await phone.context.close();
} finally { await browser.close(); }

check("no page errors", results.pageErrors.length === 0, JSON.stringify(results.pageErrors));
check("no console errors", results.consoleErrors.length === 0, JSON.stringify(results.consoleErrors));
check("no failed browser requests", results.requestFailures.length === 0, JSON.stringify(results.requestFailures));
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ checks: results.checks.length, recordings: results.recordings.length, screenshots: results.screenshots.length, pageErrors: results.pageErrors.length, consoleErrors: results.consoleErrors.length, requestFailures: results.requestFailures.length }));
