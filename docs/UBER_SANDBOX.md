# Uber Guest Rides sandbox boundary

This is a sandbox transport implementation with offline fixture coverage. Uber access, regional availability, guest setup, and an end-to-end Uber run are **not verified**. It does not book production rides, implement payment processing, or imply production Guest Rides permissions. The separate local operator utility below can request an application token only after explicit opt-in. All displayed transportation must remain labeled simulated/sandbox.

The approved API family is Guest Rides. `GuestRidesSandboxClient` accepts an existing application access token with the `guests.trips` scope. A client ID or a Riders token is insufficient. See [Uber authentication](https://developer.uber.com/docs/guest-rides/guides/authentication). Credentials are injected by server composition, never sent in browser responses or public evidence. The module uses Node crypto and a browser execution guard; import it only from backend code.

## Configuration and disclosure

The client defaults to disabled. Enabling requires `enabled: true`, `apiFamily: 'guest-rides'`, and `accessToken`. `organizationId` supplies `x-uber-organizationuuid` when applicable to the approved organization. `timeoutMs` defaults to 8 seconds and must be between 1 and 30,000 milliseconds. All transport calls use the literal `https://sandbox-api.uber.com` host, reject redirects, and have no configurable origin or production fallback. Runtime environment variable names belong to the manager-owned `.env.example` and provider composition.

`estimates` and `createRun` send exact coordinates. For student coordinates their server caller must establish verified identity, precise-location authorization and user confirmation before calling. The authorization object is an internal assertion by trusted backend code, **not** an authentication mechanism or a body to accept from a browser. The caller must bind that authorization to the correct trip/provider/locations and current consent.

The only pre-confirmation estimate exception is `{kind: 'synthetic_demo', demoMode: true}` for this exact public fixture:

```text
pickup:  37.229, -80.414
dropoff: 37.221, -80.420
```

The caller must derive `demoMode` from trusted runtime configuration. The fixture is not a student's GPS. It cannot be replaced with arbitrary coordinates under synthetic authorization. Runtime booking must still pass the existing StudentAgent confirmation/verification gates and match the selected fixture offer. Unsupported campus products return no usable quote; no fallback region or fabricated fare is substituted.

## Local application token setup

`scripts/uber-sandbox-auth.mjs` is an optional operator command, separate from the running app. Both the **client ID and client secret** are required. It makes a single form-encoded client-credentials request to the fixed `https://auth.uber.com/oauth/v2/token` endpoint for exactly `guests.trips`; redirects and automatic retries are disabled. The issued application token is not proof of sandbox allowlisting or permission for production rides. Runtime ride calls remain pinned to the sandbox host.

After Akshar approves token setup, an operator may supply `UBER_CLIENT_ID` and `UBER_CLIENT_SECRET` through an existing secure environment, or a private environment file loaded by Node 22. Put the values into that file using a trusted local editor or secret-management tool; do not put them in command arguments, shell history, chat, logs, or a committed file. Before using `--env-file`, the operator must confirm that the input file is owned by them, has `0600` permissions, and is outside Git or verified untracked and ignored. The script reads environment values only; it does not inspect Node's environment-file source.

Create/select an existing private `0700` directory owned by the current user, then use a **new** absolute output filename. Example paths below are placeholders, not files created by this task:

```sh
node --env-file=/absolute/private/uber-client.env scripts/uber-sandbox-auth.mjs --request-token --output /absolute/private/uber-token.json
```

Without `--request-token`, no network request is made. `--help` is local-only. Output is JSON with `access_token`, `token_type`, `scope` and `expires_at`; the script validates the response and writes it with exclusive creation and `0600` permissions. It never prints the token, secret, raw response, or upstream error details. Existing files and symlinks are refused. Inside Git, the output must be untracked and ignored; outside Git it still needs a private parent directory. The output is a local plaintext secret protected by filesystem permissions, not an encrypted vault. Do not share or commit it.

`invalid_scope` means the application owner/Uber must enable Guest Rides scope; generating another secret does not grant access. `invalid_client` means the ID/secret pair needs secure verification. Timeout/network failure is not proof that Uber issued no token, so the utility does not retry. A write failure can leave a private partial file; inspect it securely and select another path as appropriate. Loading the resulting token into runtime configuration is a separate secure operator step; the command does not change `.env`, runtime enablement, secrets or deployment settings.

Run `node --test scripts/uber-sandbox-auth.test.mjs` for offline tests with injected fetch. No credentials were read and no OAuth request was made while implementing this utility.

## Operator run workflow

After Akshar approves a credentialed sandbox check:

1. Obtain the scoped application token and approved organization context from Mahin. Provide a **verified sandbox guest ID**; this implementation deliberately does not create a guest from a student name or phone number.
2. Call `createRun` with the public demo route and an explicitly chosen `parentProductTypeId`. It creates one mock driver and returns `runId`.
3. Wait for setup before `getRun(runId)`. `checkAccess(runId)` performs that read and returns only sanitized capability information. It verifies the run read, not every API permission.
4. Call `estimates(runId, route, authorization)`. Both estimates and trip creation include `x-uber-sandbox-runuuid`. Only available USD upfront fares with valid expiry and ETA/duration become quotes.
5. Persist a booking intent through the journal described below; call `createTrip` only with the selected, approved quote.
6. An operator may call `advanceDriver` through `GO_ONLINE → ACCEPT → ARRIVED → BEGIN_TRIP → DROPOFF`. Cancellation is supported from ACCEPT or ARRIVED. Skipped/terminal transitions fail locally. The `from` value is operator-maintained state, not an authoritative trip observation; always poll `getTrip` afterward.
7. `cancelTrip` sends DELETE and reads the trip back. A failed readback does not prove cancellation. Driver CANCEL can cause Uber to redispatch, so only observed terminal status may trigger replacement logic.

Uber's [sandbox guide](https://developer.uber.com/docs/guest-rides/guides/sandbox) explains temporary runs, the initialization delay, driver inactivity and timing constraints. The [run API](https://developer.uber.com/docs/guest-rides/references/api/v1/guest-sandbox-run-post) recommends San Francisco coordinates for reliability; the campus corridor is not verified. Changing the demo region requires a coordinated decision, not an automatic fallback.

The guide describes ephemeral test riders/drivers but does not explicitly guarantee suppression of every rider SMS. Consequently this implementation requires a supplied sandbox guest ID and contains no phone-based bootstrap or notification endpoint. Mahin must verify that the guest is test-only before any credentialed booking check. No API calls to Uber were made during implementation.

## Booking journal and recovery contract

`prepareBooking({bookingKey, quote, guestId, approvedAmountMinor})` creates a record bound to the quote, run, exact route, guest and fare. `bookingKey` is a newly generated opaque UUIDv4, never a student/session identifier. The opaque `expenseMemo` is sent for reconciliation; do not replace it with personal context. Its hash detects accidental edits, not hostile callers. Records and quotes stay in the existing server-owned private store, under its access and retention policy.

The injected `BookingJournal` must implement:

```ts
claim(record: BookingRecord): Promise<boolean> // durable atomic insert-if-absent
read(bookingKey: string): Promise<BookingRecord | undefined>
save(record: BookingRecord): Promise<void>    // preserve immutable binding
```

`claim` completes before the only booking POST. A rejected duplicate claim never retries the POST. Timeouts, network failures, ambiguous conflicts, malformed successes, or failed persistence after dispatch return `uncertain`. The caller must retain the pending attempt and prevent replacements while it is unresolved. There is no default in-memory production journal and no claim of provider-side idempotency.

`reconcile` uses the recorded provider request ID when known. Otherwise it scans at most three pages each of ACTIVE and PAST sandbox trips. A match must have the exact opaque memo, guest ID, product and coordinates. Multiple matches, mismatches, unreadable data or incomplete pagination remain uncertain. Missing matches are **not proof of no booking**. Pickup refinement can prevent a strict coordinate match; that remains an operator follow-up, not permission to retry. See [list trips](https://developer.uber.com/docs/guest-rides/references/api/v1/guest-trips-get).

The client exposes normalized driver name, vehicle make/model/color/plate, pickup/destination ETA and pickup instructions, preserving absent values as null. It omits guest/contact/location payloads from normalized status. Provider completion does not establish home arrival. Unexpected follow-up/linked bookings fail closed. Financial settlement is not inferred from trip status; Uber's documented minimum cancellation fee is not a maximum liability, so `cancellationFeeMaximumMinor` is null.

## Provider bridge simulated settlement policy

`src/agents/uber-guest-provider.ts` uses an explicit Beacon demo ledger policy,
separate from actual Uber settlement. An authoritative terminal `cancelled` status
settles the simulated authorization as `captured`, retaining the full quoted demo
fare. `completed` also captures the full demo fare. An authoritative terminal
`declined` status (`failed` or `no_drivers_available`) voids the simulated
authorization with zero retained amount, as does a definitive rejected booking
request. No money moves. These outcomes make no claim about actual Uber charges,
refunds or cancellation fees; the transport's cancellation maximum stays unknown.

The offer displays the full fare as the demo cancellation policy before consent.
After a confirmed cancellation, the StudentAgent can replan while subtracting the
retained demo amount exactly once: cancelling a $7 demo ride under a $10 budget
leaves $3 for recovery. Terminal results persist across handler restarts and do
not change when later status responses regress. Replacement booking still requires
the existing budget, confirmation, identity and location gates.

Timeouts, ambiguous booking responses, unsuccessful cancellation readback and
unresolved reconciliation do not establish a terminal outcome. They remain
unresolved and block replacement; absence from a trip listing never produces a
fabricated void or refund. The bridge tests include the real StudentAgent
cancellation-to-replanning path with injected HTTP and no Uber requests.

## Verification

Run `bash src/agents/test.sh --test-name-pattern='Uber sandbox'` for the transport fixtures. Tests inject HTTP responses; they do not call Uber, send messages or create rides. Coverage includes disabled/missing access, fixed-host and run headers, disclosure gates, quote validity, atomic booking claims, uncertainty and reconciliation, malformed responses, status/driver/vehicle normalization, cancellation readback, driver transitions and bounded request/body timeouts.

Live acceptance remains blocked on credentials, approved sandbox organization/guest context, sandbox allowlisting if needed, regional product availability, and explicit approval for the credentialed run. Runtime composition and ProviderAgent integration are implemented in `src/lib/trip-state/runtime.ts` and `src/agents/uber-guest-provider.ts`.

Runtime configuration requires `DEMO_MODE=true`, `UBER_GUEST_SANDBOX_ENABLED=true`, `UBER_GUEST_ACCESS_TOKEN`, `UBER_GUEST_RUN_ID` and `UBER_GUEST_ID`; optional organization/product values are listed in `.env.example`. Enabling incomplete configuration fails explicitly. Discovery uses a self-operated local-demo identity, not live ANS. The provider is called in-process, while its transport calls only Uber's sandbox. A durable local journal supports one Node process; hosted multi-instance execution requires the existing shared Redis store. Exact cached quotes supply the planner's pickup/dropoff binding; no arbitrary GPS is sent during discovery.
