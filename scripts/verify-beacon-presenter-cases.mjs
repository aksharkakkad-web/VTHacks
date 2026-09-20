/** End-to-end presenter walkthrough: backend ride progress, history review, and missed-arrival notification. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { Backend } from '../tools/beacon-laptop-worker/worker.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/rishits/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
if (!process.env.BEACON_OPERATOR_FILE) throw new Error('Set BEACON_OPERATOR_FILE to the private demo operator.json');
const operator = JSON.parse(await readFile(process.env.BEACON_OPERATOR_FILE, 'utf8'));
const base = process.env.BEACON_URL || 'http://127.0.0.1:3123';
const liveTelegram = process.env.BEACON_EXPECT_LIVE_TELEGRAM === '1';
const telegramChatId = liveTelegram ? process.env.BEACON_TEST_TELEGRAM_CHAT_ID : '123456789';
if (!telegramChatId) throw new Error('Set BEACON_TEST_TELEGRAM_CHAT_ID for the authorized live Telegram recipient');
const backend = new Backend(operator.base, operator.workerToken);
const output = process.env.BEACON_PRESENTER_OUTPUT || 'docs/ui-research/backend-integration/screenshots';
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const profile = {
  homeName: 'Pritchard Hall', homeAddress: 'Virginia Tech, Blacksburg, VA', maxBudget: 10,
  walkingPreference: 'minimal', avoidTransfers: true,
  telegramContact: { name: 'Demo contact', chatId: telegramChatId, consent: true, shareLocation: false },
};
await page.addInitScript(value => localStorage.setItem('safecircle.profile.v1', JSON.stringify(value)), profile);

async function api(path, body) {
  const response = await page.request.fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { data: body }) });
  assert.ok(response.ok(), `${path}: ${response.status()} ${await response.text()}`);
  return response.json();
}
async function waitFor(work, label, timeout = 90000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await work(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 250)); }
  throw new Error(`Timeout: ${label}`);
}

try {
  await page.goto(`${base}/demo?walkthrough=1&presenter=1`);
  const pairing = await backend.post('pairing', {});
  await api('/api/demo/planner/pair', { code: pairing.code });
  const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/trips' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Get me home', exact: true }).click();
  const tripResponse = await created;
  assert.equal(tripResponse.status(), 201, await tripResponse.text());
  const tripId = (await tripResponse.json()).id;
  const view = () => api(`/api/trips/${tripId}/journey`);
  await waitFor(async () => (await view()).planning?.phase === 'ready', 'initial planning');
  await page.locator('[data-stage="recommendation"]').waitFor({ timeout: 30000 });
  let journey = await view();
  if (journey.journey.complete?.selected?.kind !== 'ride') {
    await api(`/api/demo/trips/${tripId}/scenario`, { variant: 'lighting_outage', journeyRevision: journey.journey.revision });
    await api(`/api/trips/${tripId}/planning`, {});
    await waitFor(async () => { journey = await view(); return journey.planning?.phase === 'ready' && journey.journey.complete?.selected?.kind === 'ride'; }, 'ride planning');
    await page.locator('[data-stage="replacement-selected"]').waitFor({ timeout: 30000 });
  }
  await page.getByRole('button', { name: /^Confirm/ }).last().click();
  await waitFor(async () => (await view()).trip.state === 'WAITING_FOR_PICKUP', 'ride booking');
  await page.getByRole('navigation', { name: 'Presenter timeline' }).waitFor({ timeout: 30000 });

  for (const expected of ['approaching', 'arrived', 'in_trip', 'completed']) {
    await page.getByRole('button', { name: /^Next:/ }).click();
    await waitFor(async () => (await view()).ride?.stage === expected, `ride ${expected}`);
  }
  await page.getByRole('heading', { name: 'Choose the arrival outcome', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/presenter-case-choice.png`, fullPage: true });
  assert.equal(await page.getByText('Demo ride status · no real vehicle dispatched.', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Demo transport only · no real vehicle is dispatched.', { exact: true }).count(), 1);

  await page.getByRole('button', { name: /Destination not reached/ }).click();
  await page.locator('[data-stage="overdue"]').waitFor({ timeout: 30000 });
  const overdue = await view();
  assert.equal(overdue.trip.state, 'OVERDUE');
  assert.equal(overdue.notification?.state, liveTelegram ? 'sent' : 'simulated');
  await page.getByText(liveTelegram ? 'Contact alerted' : 'Contact alert prepared', { exact: true }).waitFor();
  await page.getByText('Beacon could not confirm arrival at Pritchard Hall.', { exact: true }).waitFor();
  await page.screenshot({ path: `${output}/presenter-case-2-overdue.png`, fullPage: true });

  await page.getByRole('button', { name: /Back to Arrival check/ }).click();
  await page.getByText('Arrival check', { exact: true }).first().waitFor();
  assert.equal((await view()).trip.state, 'OVERDUE', 'Back must not rewrite the backend trip');
  await page.getByRole('button', { name: /Next: Missed arrival check/ }).click();
  await page.getByRole('heading', { name: 'Are you home?', exact: true }).waitFor();

  await page.getByRole('button', { name: 'I’m home', exact: true }).click();
  await page.locator('[data-stage="arrival"]').waitFor({ timeout: 30000 });
  assert.equal((await view()).trip.state, 'ARRIVED');
  await page.getByRole('heading', { name: 'You’re home.', exact: true }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${output}/presenter-case-1-arrival.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS presenter backend progress, review history, arrival choice, overdue notification, and arrival recovery');
} finally {
  await context.close();
  await browser.close();
}
