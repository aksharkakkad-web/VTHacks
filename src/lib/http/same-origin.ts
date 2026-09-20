/**
 * Next can internally resolve a local request as `localhost` even when the
 * browser loaded the app through `127.0.0.1`. Accept that exact Host alias,
 * while continuing to reject every unrelated browser Origin.
 */
export function hasSameBrowserOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const url = new URL(request.url);
  if (origin === url.origin) return true;
  const host = request.headers.get("host");
  return Boolean(host && origin === `${url.protocol}//${host}`);
}
