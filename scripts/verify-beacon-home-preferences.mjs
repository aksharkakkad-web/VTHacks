import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseUrl = process.env.BEACON_URL || "http://127.0.0.1:3000";

const browser = await chromium.launch({ channel: "chrome", headless: true });

try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.addInitScript(() => {
    localStorage.setItem("safecircle.profile.v1", JSON.stringify({
      homeName: "Pritchard Hall",
      homeAddress: "Virginia Tech, Blacksburg, VA",
      maxBudget: 10,
      walkingPreference: "minimal",
      avoidTransfers: false,
      trustedContact: "",
    }));
    sessionStorage.removeItem("beacon.demo-trip.v2");
  });

  await page.goto(`${baseUrl}/demo?walkthrough=1&transport=fixture`, { waitUntil: "networkidle" });
  await page.locator('[data-stage="home"]').waitFor();
  if (process.env.BEACON_SCREENSHOT) {
    await page.screenshot({ path: process.env.BEACON_SCREENSHOT, fullPage: true });
  }

  await assert.doesNotReject(async () => {
    await page.getByRole("button", { name: /Trip needs: \$\d+ maximum/ }).click();
    await page.getByRole("dialog", { name: "Trip preferences" }).waitFor();
  }, "The trip-needs summary must open the budget and walking preferences sheet");

  await page.getByLabel("Maximum budget", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "I’ve been drinking", exact: true }).count(), 0);
  await page.getByLabel("Maximum budget", { exact: true }).fill("25");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("dialog", { name: "Trip preferences" }).waitFor({ state: "hidden" });
  await page.getByRole("button", { name: /Trip needs: \$25 maximum/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: "How location works", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Trusted contact", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Get help", exact: true }).count(), 0);
  assert.deepEqual(pageErrors, []);

  console.log("PASS: trip-needs summary opens editable preferences, saves a new budget, and the support shortcut row is absent.");
} finally {
  await browser.close();
}
