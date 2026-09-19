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
identity checks are live. ANS accepts only one endpoint per protocol under an identity.
Register `/api/demo/providers` as the single HTTP-API endpoint; its public GET response
is also its metadata document. Service IDs are `<ANS registration id>:<mode>`. That is
one verified operator with multiple callable services, not three independently verified
businesses. Separate operators can advertise the same wire contract under their own identities.

The `beacon-mobility-v1` tag identifies Beacon's application profile, not an ANS protocol.
Each function is namespaced, for example `campus_ride.quote_trip`, and tagged with its
matching mode. Discovery maps recognized modes to fixed child paths below the registered
endpoint and keeps each service's capabilities separate. The generated catalog includes
only quotes for transit, and quotes/booking/status/cancellation/reconciliation for rides.
Other single-service HTTP-API agents can still advertise ordinary `quote_trip` functions.

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
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Shared trip and provider persistence; supplied by the Vercel Upstash integration |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional direct Upstash configuration; takes precedence as a complete pair |
| `BEACON_ANS_AGENT_ID` | Registration ID returned by GoDaddy after registration |
| `ANS_API_KEY=KEY:SECRET`, `ANS_BASE_URL=https://api.godaddy.com` | GoDaddy server-side credentials |
| `BEACON_ANS_MODE=live` | Explicitly select real ANS even in demo mode |
| `BEACON_ANS_QUERY` | Partial display-name filter for the SDK's `/v1/agents` search, e.g. `Beacon Demo Providers` |
| `BEACON_PROVIDER_CREDENTIALS` | JSON `{ "<registration>:campus_ride": {"baseUrl":"https://<domain>/api/demo/providers/campus_ride","token":"<provider token>"}, ... }` |
| `BEACON_MONITOR_TOKEN` | Authenticated `POST /api/trips/monitor` worker credential |

Keep `DEMO_MODE=true` while using demo controls and simulated SMS. The decision adapter
and ANS can use live services independently. Ranking now calls Akshar's server-only
`evaluateTrip` adapter; set `DATABRICKS_HOST`, `DATABRICKS_TOKEN`, and
`DATABRICKS_WAREHOUSE_ID` to enable SQL. Without them, `LOCAL_POLICY_FALLBACK` is explicit.
Validated SQL uses `DATABRICKS_EVALUATION`; fixture quotes remain `SIMULATED_TRANSPORT`
in either mode. `DATABRICKS_AUDIT_TABLE` optionally enables the teammate's sanitized audit.
This checkout currently has no Databricks access token or authenticated CLI profile;
the teammate's separate workspace evidence does not prove hosted credentials here.

The current Twilio trial allows only preset messages. It cannot send Beacon's custom
alert text or location link. Staying on Free keeps SMS simulated; enabling custom SMS
requires an upgraded account, an eligible owned sender and a verified end-to-end test.
Adding credentials or an ANS key alone never changes these modes.

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
   `serverCertificatePEM`, `serverCertificateChainPEM`, and the one HTTP-API endpoint
   descriptor returned by the catalog. This is the SDK's BYOC flow: Vercel serves its own managed certificate.
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

For the demo-mode trip smoke with real ANS, set `BEACON_SMOKE_URL` to the deployment
origin and `BEACON_SMOKE_LIVE_ANS=true`, then run `node src/agents/smoke.mjs`.
The script requires verified identities for both ride selections and rejects a local-demo
trust event. Ranking, transportation behavior, and SMS remain simulated in this test.

Vercel certificate rotation changes the served fingerprint. Update the registered server
certificate through the supported ANS certificate workflow when it rotates; do not disable
pin checking to get a demo through. The official Go SDK/CLI and BYOC example are the source
of the registration schema: https://github.com/agentnameservice/ans-sdk-go.

## Hosted monitoring

Vercel Hobby cron runs at most daily, which cannot meet a trip-monitoring deadline.
Beacon now uses the existing Upstash/Vercel integration's **Free QStash** resource
`beacon-monitor` in US East. Schedule `beacon-trip-monitor-v1` calls the production
`POST /api/trips/monitor` endpoint every two minutes with the existing bearer credential.
It does not depend on the mobile browser, this Mac, or an in-memory Vercel timer.

The schedule uses a 30-second request timeout and zero immediate retries; failed work
is retried on the next scheduled invocation using the backend's durable state. At this
frequency it schedules 720 deliveries per day, below the current Free plan's 1,000
daily messages. No paid plan, Prod Pack, or paid upgrade was enabled. Allow up to one
poll interval plus delivery/processing time after a deadline; this is not an exact-time
dispatch guarantee. Existing outbox claims prevent repeat notification attempts.

QStash receives an empty JSON body and the monitor credential, with the Authorization
header configured for redaction in QStash logs. It does not receive trip coordinates or contact data.
Its integration variables are server-side and scoped to production. The monitor route
continues to reject requests without its bearer credential. `DEMO_MODE=true` still
means notifications are simulated even though the scheduling and ANS calls are real.

Manage the resource in Vercel's Upstash integration or the linked Upstash dashboard.
To inspect delivery, use QStash's schedule details and logs filtered by
`beacon-trip-monitor-v1`. Pause or delete that schedule when this demo is retired.
Changing the monitor token also requires updating the forwarded Authorization header.
The local Node monitor shares the same database when configured with these Redis
credentials; stop local test servers before a hosted-monitor isolation test.

References: [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing),
[GoDaddy ANS registration](https://developer.godaddy.com/en/docs/references/rest/ans/registration),
[QStash scheduling](https://upstash.com/docs/qstash/api-reference/schedules/create-a-schedule),
[QStash plan limits](https://upstash.com/pricing/qstash).
