import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const base = process.env.BEACON_URL || "http://localhost:3100";
const output = "docs/ui-research/beacon-complete/workstream-a";
const viewports = [
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "393x852", width: 393, height: 852 },
  { name: "430x932", width: 430, height: 932 },
];

await mkdir(`${output}/screenshots`, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = {
  base,
  checks: [],
  screenshots: [],
  pageErrors: [],
  consoleErrors: [],
  targetIssues: [],
  inputFontIssues: [],
  notes: [],
};

function record(name, passed, detail = "") {
  results.checks.push({ name, passed, detail });
}

async function shot(page, viewport, name) {
  await page.evaluate(() => document.fonts.ready);
  const path = `${output}/screenshots/${viewport.name}-${name}.png`;
  await page.screenshot({ path });
  results.screenshots.push(path);
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  record(`${viewport.name} ${name} no horizontal overflow`, noOverflow);
}

async function inspectControls(page, viewport, screen) {
  const issues = await page.locator("button,a,input").evaluateAll((elements) => elements.flatMap((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (style.visibility === "hidden" || style.display === "none" || rect.width === 0 || rect.height === 0) return [];
    const type = element instanceof HTMLInputElement ? element.type : "";
    const target = (type === "checkbox" || type === "radio") && element.closest("label") ? element.closest("label") : element;
    const targetRect = target.getBoundingClientRect();
    if (targetRect.width >= 44 && targetRect.height >= 44) return [];
    return [{
      label: element.getAttribute("aria-label") || element.textContent?.trim() || element.getAttribute("name") || type,
      width: Math.round(targetRect.width * 10) / 10,
      height: Math.round(targetRect.height * 10) / 10,
      tag: element.tagName.toLowerCase(),
      type,
    }];
  }));
  for (const issue of issues) results.targetIssues.push({ viewport: viewport.name, screen, ...issue });
  record(`${viewport.name} ${screen} targets at least 44px`, issues.length === 0, issues.length ? JSON.stringify(issues) : "");

  const fontIssues = await page.locator('input:not([type="checkbox"]):not([type="radio"]):not([type="range"])').evaluateAll((inputs) => inputs.flatMap((input) => {
    const rect = input.getBoundingClientRect();
    if (!rect.width || !rect.height) return [];
    const size = Number.parseFloat(getComputedStyle(input).fontSize);
    return size < 16 ? [{ label: input.getAttribute("aria-label") || input.closest("label")?.textContent?.trim() || input.id, fontSize: size }] : [];
  }));
  for (const issue of fontIssues) results.inputFontIssues.push({ viewport: viewport.name, screen, ...issue });
  record(`${viewport.name} ${screen} input font at least 16px`, fontIssues.length === 0, fontIssues.length ? JSON.stringify(fontIssues) : "");
}

async function clearStorage(page) {
  await page.goto(`${base}/onboarding/welcome`);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
}

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => results.pageErrors.push({ viewport: viewport.name, message: error.message }));
  page.on("console", (message) => { if (message.type() === "error") results.consoleErrors.push({ viewport: viewport.name, message: message.text() }); });

  await clearStorage(page);
  await page.goto(`${base}/onboarding/splash?gallery=1`);
  await page.getByText("Checking Beacon…", { exact: true }).waitFor();
  const splashAnimation = await page.locator("img").evaluate((element) => getComputedStyle(element).animationName);
  record(`${viewport.name} splash honors reduced motion`, splashAnimation === "none", splashAnimation);
  await shot(page, viewport, "01-splash");

  await page.goto(`${base}/`);
  await page.waitForURL(/\/onboarding\/welcome$/, { timeout: 10000 });
  record(`${viewport.name} new user routes to welcome`, true);
  const signInCount = await page.getByRole("link", { name: /sign in/i }).count();
  record(`${viewport.name} welcome has one setup path`, signInCount === 0 && await page.getByRole("link", { name: "Get started" }).count() === 1);
  await inspectControls(page, viewport, "02-welcome");
  await shot(page, viewport, "02-welcome");

  await page.getByRole("link", { name: "Get started" }).click();
  await page.getByRole("heading", { name: "Where is home?" }).waitFor();
  await inspectControls(page, viewport, "03-home");
  await shot(page, viewport, "03-home");

  if (viewport.name === "390x844") {
    await page.getByRole("button", { name: "Change location" }).click();
    const dialog = page.getByRole("dialog", { name: "Choose home" });
    await dialog.waitFor();
    await page.getByRole("button", { name: "Use this typed home" }).click();
    const alert = page.getByText("Enter a home label from 2–60 characters and an address from 5–160 characters.", { exact: true });
    await alert.waitFor();
    record("Manual home rejects blank values and keeps dialog open", await dialog.isVisible() && /2–60/.test(await alert.textContent()));
    await inspectControls(page, viewport, "03-manual-home");
    await shot(page, viewport, "03-manual-invalid");
    await page.getByLabel("Home label").fill("Hahn Hall South");
    await page.getByLabel("Address", { exact: true }).fill("800 Washington Street SW, Blacksburg, VA");
    await page.getByRole("button", { name: "Use this typed home" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: /Hahn Hall South/ }).waitFor();
    record("Manual home accepts valid label and address", true);
    await shot(page, viewport, "03-manual-selected");
  }

  await page.getByRole("button", { name: /Set as home/ }).click();
  await page.getByRole("heading", { name: "Your way home." }).waitFor();
  const expectedHome = viewport.name === "390x844" ? "Hahn Hall South" : "Pritchard Hall";
  const storedDraft = await page.evaluate(() => JSON.parse(sessionStorage.getItem("beacon.onboarding.home.v1") || "null"));
  record(`${viewport.name} home draft saved`, storedDraft?.homeName === expectedHome, JSON.stringify(storedDraft));
  await inspectControls(page, viewport, "04-preferences");
  await shot(page, viewport, "04-preferences");

  const budget = page.locator("#beacon-budget-input");
  if (viewport.name === "390x844") {
    await budget.fill("");
    await page.locator("#beacon-budget-error").waitFor();
    record("Preferences reject blank budget", await page.getByRole("button", { name: "Save and continue" }).isDisabled());
    await budget.fill("18");
    await page.getByRole("switch", { name: "Less walking" }).click();
    await page.getByRole("switch", { name: "Fewer transfers" }).click();
    await budget.focus();
    await page.keyboard.press("Tab");
    const activeId = await page.evaluate(() => document.activeElement?.id || document.activeElement?.getAttribute("aria-label") || "");
    record("Preferences support keyboard movement", Boolean(activeId), activeId);
  }
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.waitForURL(/\/app$/, { timeout: 10000 });
  await page.locator('[data-stage="home"]').waitFor({ timeout: 10000 });
  await inspectControls(page, viewport, "05-home");
  await shot(page, viewport, "05-home");

  if (viewport.name === "390x844") {
    await page.getByRole("button", { name: "Open preferences" }).click();
    const preferencesDialog = page.getByRole("dialog", { name: "Trip preferences" });
    await preferencesDialog.waitFor();
    const editBudget = preferencesDialog.getByLabel("Maximum budget");
    await editBudget.fill("");
    await preferencesDialog.getByRole("button", { name: "Save changes" }).click();
    record("Profile preferences reject blank budget without closing", await preferencesDialog.isVisible() && !await editBudget.evaluate((element) => element.checkValidity()));
    await editBudget.fill("16");
    await preferencesDialog.getByRole("button", { name: "Save changes" }).click();
    await preferencesDialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Open preferences" }).click();
    await preferencesDialog.waitFor();
    record("Profile budget edit persists", await preferencesDialog.getByLabel("Maximum budget").inputValue() === "16");
    await page.keyboard.press("Escape");
    await preferencesDialog.waitFor({ state: "hidden" });

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const homeDialog = page.getByRole("dialog", { name: "Edit home" });
    await homeDialog.waitFor();
    await homeDialog.getByLabel("Home name").fill("H");
    await homeDialog.getByLabel("Home address").fill("");
    await homeDialog.getByRole("button", { name: "Save changes" }).click();
    record("Profile home edit rejects invalid values without closing", await homeDialog.isVisible() && !await homeDialog.getByLabel("Home address").evaluate((element) => element.checkValidity()));
    await homeDialog.getByLabel("Home name").fill("Cochrane Hall");
    await homeDialog.getByLabel("Home address").fill("850 Washington Street SW, Blacksburg, VA");
    await homeDialog.getByRole("button", { name: "Save changes" }).click();
    await homeDialog.waitFor({ state: "hidden" });
    await page.reload();
    await page.locator('[data-stage="home"]').waitFor();
    record("Profile home edit survives refresh", await page.getByText("Cochrane Hall", { exact: true }).count() > 0);
    await shot(page, viewport, "05-returning-edited");

    await page.goto(`${base}/onboarding/home`);
    await page.getByText("Cochrane Hall", { exact: true }).waitFor();
    await page.reload();
    await page.getByText("Cochrane Hall", { exact: true }).waitFor();
    record("Saved home draft survives setup refresh", true);

    await page.goto(`${base}/`);
    await page.waitForURL(/\/app$/, { timeout: 10000 });
    await page.locator('[data-stage="home"]').waitFor();
    record("Returning user skips onboarding", true);
  }

  await context.close();
}

await browser.close();
record("No page errors", results.pageErrors.length === 0, JSON.stringify(results.pageErrors));
record("No console errors", results.consoleErrors.length === 0, JSON.stringify(results.consoleErrors));
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));

const failed = results.checks.filter((check) => !check.passed);
console.log(JSON.stringify({ checks: results.checks.length, failed: failed.length, targetIssues: results.targetIssues.length, inputFontIssues: results.inputFontIssues.length, pageErrors: results.pageErrors.length, consoleErrors: results.consoleErrors.length }));
assert.equal(results.pageErrors.length, 0, "page errors found");
assert.equal(results.consoleErrors.length, 0, "console errors found");
assert.equal(failed.length, 0, "setup checks failed");
