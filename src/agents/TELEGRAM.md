# Telegram trusted-contact alerts

Telegram replaces Twilio completely in the active backend. No SMS fallback, paid
sender, or paid broadcast is configured. Recipients need Telegram and must start the
bot before it can message them. This is a contact notification, not emergency dispatch.

## Operator setup

1. Create a bot with `/newbot` in the official [@BotFather](https://t.me/BotFather).
2. Put its token in ignored `.env.telegram.local` as `TELEGRAM_BOT_TOKEN=...`.
   Keep the file mode 0600. Never paste the token into a browser URL or commit it.
3. The intended test recipient opens the new bot and presses Start in a private chat.
4. Run `node src/agents/telegram-setup.mjs`. It verifies the bot and reads its updates
   without sending messages or acknowledging/deleting updates. Exactly one started
   private chat is required for automatic setup; multiple contacts are never guessed.
   It writes `TELEGRAM_ALLOWED_CHAT_IDS` and the public bot username into the same file.
5. Copy the token and allowed chat IDs to server-only local/deployment environment
   settings. `TELEGRAM_ALLOWED_CHAT_IDS` is a comma-separated operator allowlist.
6. Set `BEACON_NOTIFICATION_MODE=telegram` only when ready for authorized real alerts.
   Set it to `simulated` for routine smoke tests. Live Telegram is independent of
   `DEMO_MODE`, which controls transportation fixtures; demo texts have a visible label.
7. For the complete local judge runtime, start with `npm run demo -- --telegram`.
   Without that explicit flag, `npm run demo` strips Telegram credentials and records a
   simulated notification. The app contact sheet must use an allowlisted private chat ID.

The trip request's `preferences.trustedContact` is now
`{name, telegramChatId, consent, shareLocation}`. `telegramChatId` is a positive decimal
string for an approved private chat. A phone number, username, group or channel is
not accepted. The contact data stays in private trip storage and is never sent to
transportation providers or Databricks. Recreate older trips containing phone contacts.
Rishit's contact UI must use this new input contract; no shared `Trip` fields changed.

## Delivery behavior

The persisted outbox claims the alert before `sendMessage`. Concurrent monitor ticks
and repeated deadline actions do not resend it. The adapter validates Telegram's
success envelope, message ID and matching private chat before setting `alertSent=true`.
That means API acceptance, not proof the person read the message. A timeout or ambiguous
result records `ALERT_UNCERTAIN`; it is never blindly retried.

Location is included only when the trip contact separately consented to location
sharing and a last-known location exists. Link previews and paid broadcasts are
disabled. Upstream exceptions are sanitized because Telegram's URL contains the bot
token. No message bodies, tokens or private chat IDs belong in logs or PR evidence.

Use the normal HTTP smoke only with `BEACON_NOTIFICATION_MODE=simulated`. A real
acceptance test needs a named, consenting recipient and explicit permission to send.

Sources: [Telegram bot tutorial](https://core.telegram.org/bots/tutorial),
[sendMessage API](https://core.telegram.org/bots/api#sendmessage),
[free bot limits](https://core.telegram.org/bots/faq#how-can-i-message-all-of-my-bot-39s-subscribers-at-once).
