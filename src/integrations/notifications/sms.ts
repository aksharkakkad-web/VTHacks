import type { Contact } from "../../lib/trip-state/model";

export function notificationSender(options: { demo: boolean; accountSid?: string; authToken?: string; from?: string }) {
  return async (contact: Contact, message: string, key: string) => {
    if (!contact.consent) throw new Error("Notification consent required");
    if (options.demo) return { id: `demo-${key}`, simulated: true };
    if (!options.accountSid || !/^AC[a-f0-9]{32}$/i.test(options.accountSid) || !options.authToken || !options.from) throw new Error("SMS is not configured");
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${options.accountSid}/Messages.json`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(6000),
      headers: { Authorization: `Basic ${Buffer.from(`${options.accountSid}:${options.authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: contact.phone, From: options.from, Body: message }),
    });
    if (!response.ok) throw new Error(`SMS service returned ${response.status}`);
    const result = await response.json() as { sid?: unknown; status?: unknown };
    if (typeof result.sid !== "string" || !["queued", "accepted", "sending", "sent", "delivered"].includes(String(result.status))) throw new Error("SMS acceptance not confirmed");
    return { id: result.sid, simulated: false };
  };
}
