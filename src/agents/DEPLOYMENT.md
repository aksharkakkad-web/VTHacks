# Mahin's hosted provider and ANS runbook

The app stays Beacon-branded. The infrastructure domain is server configuration;
normal mobile screens use provider names and never need to display it.

## What is implemented

With `BEACON_HOSTED_PROVIDERS=true`, these base paths expose the existing provider
contract (`/agent/quote`, `/agent/request-trip`, `/agent/trip-status/:id`,
`/agent/cancel-trip`, and `/.well-known/agent-card.json`). Ride providers also advertise
the optional `reconcile_trip` capability with `/agent/request-status/:requestId` and
`/agent/cancel-request`:

- `/api/demo/providers/transit`
- `/api/demo/providers/campus_ride`
- `/api/demo/providers/independent_ride`

Transit supports public quote/metadata only. The two ride providers accept authenticated
bookings. These are **simulated transportation services** even when their HTTPS and ANS
identity checks are live. All three may be advertised as endpoints of one registered
operator on one custom domain; service IDs are `<ANS registration id>:<mode>`. That is
one verified operator with multiple callable services, not three independently verified
businesses. Separate operators can advertise the same wire contract under their own identities.

Booking state uses shared Redis. Requests with the same provider and trip request ID
produce one booking across instances. Cancellation erases precise coordinates and leaves
a cancelled tombstone; replaying the request does not restore the private data. Records
expire after 24 hours. Status responses never contain pickup, destination, or contact data.

`GET /agent/request-status/:requestId` returns `{trip: null}` when unknown, or
`{trip: {id, status}}` when a booking exists. `POST /agent/cancel-request` takes
`{request_id: "..."}` and returns a cancelled trip. Both require the booking credential.
Cancellation installs a tombstone even if the original request has not arrived yet, so
a delayed request cannot create a second active booking during the retention period.
The Student Agent uses these operations to recover lost booking responses without
resending coordinates. A missing lookup alone never authorizes a replacement.

## Environment configuration

Set server-side values in the Vercel project. Never use `NEXT_PUBLIC_` for any credential.
Do not upload `.env.local`, identity private keys, or the local state directory as source.

| Variable | Purpose |
| --- | --- |
| `BEACON_HOSTED_PROVIDERS=true` | Enable the simulated public provider routes |
| `BEACON_PROVIDER_ORIGIN=https://<domain>` | Canonical provider origin, with no trailing slash |
| `BEACON_HOSTED_PROVIDER_TOKEN` | Random booking/status/cancellation credential |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Shared trip and provider persistence |
| `BEACON_ANS_AGENT_ID` | Registration ID returned by GoDaddy after registration |
| `ANS_API_KEY=KEY:SECRET`, `ANS_BASE_URL=https://api.godaddy.com` | GoDaddy server-side credentials |
| `BEACON_ANS_MODE=live` | Explicitly select real ANS even in demo mode |
| `BEACON_ANS_QUERY` | Registry search query for the deployed provider registration |
| `BEACON_PROVIDER_CREDENTIALS` | JSON `{ "<registration>:campus_ride": {"baseUrl":"https://<domain>/api/demo/providers/campus_ride","token":"<provider token>"}, ... }` |
| `BEACON_MONITOR_TOKEN` | Authenticated `POST /api/trips/monitor` worker credential |

Keep `DEMO_MODE=true` until the real decision adapter and approved-recipient SMS setup
are connected. ANS can be live independently, but recommendation and notification
events remain explicitly labeled as demo. Adding an ANS key alone does not enable live mode.

## Deployment and registration sequence

1. Create/link the Beacon Vercel project and provision shared Redis. Set the provider
   variables above and deploy the reviewed branch. Confirm the provider quote and public
   metadata URLs work. Booking routes must reject unauthenticated requests.
2. Attach the existing custom domain to that deployment. Keep the public mobile app's
   chosen Beacon address separate. No additional paid domain is required for one operator.
3. Generate an RSA 2048/SHA-256 identity CSR with CN and DNS SAN equal to the domain,
   and URI SAN `ans://v1.0.0.<domain>`. Keep its private key local, mode 0600, ignored by Git.
   Fetch the actual served TLS leaf certificate plus intermediates after domain attachment.
4. Submit `POST /v1/agents/register` with display name, host, version, identity CSR,
   `serverCertificatePEM`, `serverCertificateChainPEM`, and the three HTTP-API endpoint
   descriptors. This is the SDK's BYOC flow: Vercel serves its own managed certificate.
   Declare that the transportation behavior is simulated. Never submit the private key.
5. Publish only the returned ownership/discovery DNS records in Vercel DNS. Trigger
   the returned ACME verification step and then `verify-dns`; inspect registration status
   until it is ACTIVE. Do not guess TXT values, records, or registration IDs.
6. Save the returned registration ID, redeploy, and check that provider `provider_id`
   values match discovery service IDs. Configure exact scoped credentials in the Student
   Agent. Verify real resolution, DNS badge, trusted transparency evidence, and the actual
   endpoint certificate before allowing precise synthetic demo coordinates.
7. Run the accepted booking, cancellation/replacement, arrival, and negative-identity
   flows. Do not mark the live checkpoint complete until these deployed calls pass.

Vercel certificate rotation changes the served fingerprint. Update the registered server
certificate through the supported ANS certificate workflow when it rotates; do not disable
pin checking to get a demo through. The official Go SDK/CLI and BYOC example are the source
of the registration schema: https://github.com/agentnameservice/ans-sdk-go.

## Hosted monitoring

Vercel Hobby cron runs at most daily, which cannot meet a trip-monitoring deadline.
Use an external authenticated worker/scheduler, or an approved plan supporting minute
schedules. Nothing in this branch provisions a paid plan or silently starts a trial.
The existing monitor route accepts POST plus its bearer token. Verify invocations while
the mobile tab is closed before claiming hosted monitoring works.

References: [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing),
[GoDaddy ANS registration](https://developer.godaddy.com/en/docs/references/rest/ans/registration).
