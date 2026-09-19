import { test } from "node:test";
import { strict as assert } from "node:assert";
import { telegramSender, telegramChatId } from "../integrations/notifications/telegram";

const contact = { name: "Demo contact", telegramChatId: "123456789", consent: true, shareLocation: false };
const token = "123456789:unit-test-token-not-a-real-secret";

test("Telegram simulation requires consent and never contacts the API", async () => {
  let calls = 0;
  const send = telegramSender({ simulated: true, fetch: async () => { calls++; throw new Error("unexpected network"); } });
  assert.deepEqual(await send(contact, "Beacon test", "trip-1"), { id: "demo-trip-1", simulated: true });
  await assert.rejects(send({ ...contact, consent: false }, "Beacon test", "trip-2"));
  assert.equal(calls, 0);
});

test("Telegram sends only to an explicitly allowed private chat without paid broadcasts", async () => {
  let calls = 0;
  const send = telegramSender({ simulated: false, botToken: token, allowedChatIds: contact.telegramChatId, fetch: async (url, options) => {
    calls++;
    assert.equal(String(url), `https://api.telegram.org/bot${token}/sendMessage`);
    assert.equal(options?.redirect, "error");
    assert.equal(options?.method, "POST");
    assert.deepEqual(JSON.parse(String(options?.body)), { chat_id: contact.telegramChatId, text: "Beacon test", protect_content: true, link_preview_options: { is_disabled: true }, allow_paid_broadcast: false });
    return Response.json({ ok: true, result: { message_id: 42, chat: { id: Number(contact.telegramChatId), type: "private" } } });
  } });
  assert.deepEqual(await send(contact, "Beacon test", "trip-1"), { id: "42", simulated: false });
  await assert.rejects(send({ ...contact, telegramChatId: "987654321" }, "Beacon test", "trip-2"));
  await assert.rejects(send({ ...contact, telegramChatId: "-100123456" }, "Beacon test", "trip-3"));
  await assert.rejects(send({ ...contact, consent: false }, "Beacon test", "trip-4"));
  assert.equal(calls, 1);
});

test("missing Telegram configuration, legacy phone values, and malformed IDs fail before network", async () => {
  for (const id of ["", "@username", "+15555550100", "00123", "-123", "9007199254740992"]) assert.throws(() => telegramChatId(id));
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; throw new Error("unexpected network"); };
  for (const config of [{}, { botToken: token }, { botToken: token, allowedChatIds: "invalid" }]) {
    await assert.rejects(telegramSender({ simulated: false, fetch: fetcher, ...config })(contact, "Beacon test", "trip-1"));
  }
  assert.equal(calls, 0);
});

test("Telegram rejection, mismatched chat, and missing acceptance evidence never report success", async () => {
  const responses = [
    { ok: false, description: "upstream diagnostic must stay private" },
    { ok: true, result: { message_id: 42, chat: { id: 987654321, type: "private" } } },
    { ok: true, result: { message_id: 42, chat: { id: 123456789, type: "group" } } },
    { ok: true, result: {} },
  ];
  for (const response of responses) {
    const send = telegramSender({ simulated: false, botToken: token, allowedChatIds: contact.telegramChatId, fetch: async () => Response.json(response) });
    await assert.rejects(send(contact, "Beacon test", "trip-1"), error => error instanceof Error && !error.message.includes("upstream diagnostic"));
  }
});

test("Telegram network exceptions redact the token-bearing URL and are not retried", async () => {
  let calls = 0;
  const send = telegramSender({ simulated: false, botToken: token, allowedChatIds: contact.telegramChatId, fetch: async () => { calls++; throw new Error(`Failed request to https://api.telegram.org/bot${token}/sendMessage`); } });
  await assert.rejects(send(contact, "Beacon test", "trip-1"), error => error instanceof Error && !error.message.includes(token));
  assert.equal(calls, 1);
});
