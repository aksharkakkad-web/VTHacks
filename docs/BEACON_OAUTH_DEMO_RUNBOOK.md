# Beacon private OAuth demo: laptop and phone setup

This is an implementation/runbook handoff, not evidence that the bridge already runs. Build [the agent demo plan](superpowers/plans/2026-09-19-beacon-oauth-agents-demo.md) first. Commands referencing new scripts below become runnable when those scripts are implemented.

## 1. Authentication choice and limits

Use the demonstrator's **managed ChatGPT login through the official Codex app-server**, on that person's laptop. The documented app-server manages OAuth and token refresh. It supports local client conversations; this plan uses a private paired demonstration, not public access to Codex execution. [Official app-server documentation](https://learn.chatgpt.com/docs/app-server).

Subscription usage remains subject to the account's limits; no unlimited-use or zero-latency promise follows from login. General programmatic/API hosting is a separate deployment question; OpenAI's authentication guide recommends API authentication for programmatic CLI workflows and cautions against exposing execution publicly. Verify the actual supported client/account path before activation. [Official authentication guidance](https://learn.chatgpt.com/docs/auth).

Do not implement an OAuth client by copying another app's client ID, harvesting browser cookies, extracting refresh tokens, or forwarding personal bearer tokens to model endpoints. Do not buy credits, consume reset credits, switch to a paid API, or use Claude subscription login as an automatic workaround. A failed official-login smoke is a reported blocker for this particular demo path.

The user does not need a new model API key. The backend-to-worker connection still needs its own generated Beacon secret; existing Databricks/ANS/Redis credentials remain necessary for those services.

## 2. Install/check the local runtime

Run these on the laptop that will stay awake during the demo:

```sh
node --version
command -v codex
codex --version
codex login status
```

Use Node.js 22 for Beacon. On Mahin's inspected machine, `codex` resolved to `/Applications/ChatGPT.app/Contents/Resources/codex`; the reported version was `0.155.0-alpha.9.2`. This is an observed local version, not a version every teammate must install. Record the teammate's actual version and do not silently update it during judging. If their laptop has no CLI, install the official CLI following current OpenAI installation instructions, then rerun these checks. Do not assume the desktop UI and an independently installed CLI share a usable login without checking.

If status is signed out, run:

```sh
codex login
```

Complete the browser login personally. Do not send a password, MFA code, OAuth token, or authentication-file contents to the teammate's agent. If the ordinary callback is unavailable and the account supports device authentication, the inspected CLI also exposes:

```sh
codex login --device-auth
```

Use only the URL/code that the official flow returns. Do not hardcode callback ports. The worker must later verify `account/read` reports `chatgpt`, not just that a browser is logged in. Do not log out or change a working account to run the smoke. [Sign-in instructions](https://learn.chatgpt.com/docs/auth).

## 3. Implement the local app-server adapter

Launch Codex as a child process with piped stdio, never as an externally reachable WebSocket server. Generate the protocol schema from the actual binary so current fields/enums can be checked:

```sh
codex app-server generate-json-schema --out /tmp/beacon-codex-protocol
```

The Node adapter uses `spawn`, not a shell command string. Set a dedicated empty working directory and a deliberately minimal child environment. Preserve the normal OS login/home context needed by Codex's managed authentication; do not rewrite `HOME` or `CODEX_HOME`. Do not pass the worker secret, provider secrets or the whole `.env.local` into the model subprocess.

A launch skeleton to implement in `tools/beacon-laptop-worker/client.mjs`:

```js
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export function launchCodex({ binary, cwd, env }) {
  const child = spawn(binary, [
    "app-server", "--listen", "stdio://",
    "-c", "features.shell_tool=false",
    "-c", "features.unified_exec=false",
    "-c", 'web_search="disabled"',
    "-c", "apps._default.enabled=false"
  ], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  const lines = createInterface({ input: child.stdout });
  return { child, lines, send(message) {
    child.stdin.write(JSON.stringify(message) + "\n");
  } };
}
```

This is only process setup, not a complete RPC client or a sufficient sandbox. Implement request correlation, bounded parsing, shutdown and timeouts from the plan. Inspect effective configuration without printing secrets; disable inherited MCP servers, plugins, hooks, memory/skills and other tools for this dedicated process using supported installed-version settings. Confirm no user/project instruction files cause side effects. Use restricted filesystem access on each thread/turn; read-only with full home access is insufficient. If the installed version cannot provide the intended isolation, do not accept queued model work until that is resolved. [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

Managed local protocol sequence (validate against generated schema):

```json
{"id":1,"method":"initialize","params":{"clientInfo":{"name":"beacon_private_demo","version":"0.1.0"}}}
```

Wait for successful response to ID 1, then send:

```json
{"method":"initialized","params":{}}
{"id":2,"method":"account/read","params":{"refreshToken":false}}
{"id":3,"method":"model/list","params":{}}
```

Require managed ChatGPT auth; choose a returned available model ID and save it as `BEACON_PLANNER_MODEL` in the laptop-only config. Do not print returned email/account IDs. `model/list` is availability evidence, not a guarantee that inference succeeds under current quota. Start an isolated thread and submit a `turn/start` with the role's strict `outputSchema`; the chosen model must pass a real structured-output test. No model selection or inference was performed while writing this handoff.

To integrate login into a future local operator UI, `account/login/start` with `{type:"chatgpt"}` is the managed flow. The first demo can simply use `codex login`; no custom login screen is needed. Do not use the experimental externally managed token flow. [Managed authentication and turn protocol](https://learn.chatgpt.com/docs/app-server).

`planner-auth-smoke.mjs` must verify the account, available model, bounded JSON output, and zero tool execution using synthetic input. Expected output is a sanitized report such as `{authMode:"chatgpt", model:"actual-returned-id", structuredOutput:true, toolsExecuted:0}`. A login-only success is not an inference test. Keep the first smoke entirely local; do not expose it through the PWA.

## 4. Generate Beacon's worker credential

The implementation must provide `scripts/planner-generate-secret.mjs`. It should create a laptop-only config file without overwriting an existing one or printing its contents:

```js
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const folder = join(homedir(), ".config", "beacon-demo");
mkdirSync(folder, { recursive: true, mode: 0o700 });
const file = join(folder, "worker.env");
writeFileSync(file, `BEACON_PLANNER_WORKER_TOKEN=${randomBytes(32).toString("hex")}\n`,
  { mode: 0o600, flag: "wx" });
console.log(`Created private worker configuration at ${file}`);
```

Keep this file outside the repository. Add `BEACON_BACKEND_URL` with the actual deployed Beacon HTTPS origin and `BEACON_PLANNER_MODEL` with the model ID from preflight. The code should accept `BEACON_CODEX_BIN` only as a validated local executable path, never from phone/job input. Copy only the worker secret to the corresponding Vercel server environment variable through the team's normal secret workflow. Do not paste it into chat or place it in a `NEXT_PUBLIC_*` variable.

## 5. Backend deployment configuration

The executing agent must document and implement these **new proposed** variables before asking the user to set them:

| Name | Where | Meaning |
| --- | --- | --- |
| `BEACON_PLANNER_MODE=codex_laptop` | Vercel server | Enable private laptop planning only after backend/worker readiness |
| `BEACON_PLANNER_WORKER_TOKEN` | Vercel server and laptop config | Random Beacon queue credential; not the model login |
| `BEACON_PLANNER_MODEL` | Laptop config | Actual model ID tested under the account |
| `BEACON_BACKEND_URL` | Laptop config | Deployed Beacon HTTPS origin |
| `BEACON_CODEX_BIN` | Laptop config, optional | Validated executable path; otherwise resolve installed `codex` |
| `BEACON_CONTEXT_AGENT_URL` | Vercel server | Reachable configured context service endpoint |
| `BEACON_CONTEXT_AGENT_TOKEN` | Vercel and context service | Scoped context-service credential, independently generated |

Retain the existing configured Redis, ANS, provider and Databricks variables; inspect names in the integrated checkout rather than replacing credentials. Configure hosted provider URLs; a deployed backend cannot call laptop loopback providers. `DEMO_MODE=true` permits explicit simulation controls, but must not grant public access to planner work. Pairing remains required.

Leave the project's current domains alone. Neither ordinary phone UI nor its activity panel should display `geta36.app`. Service display labels are sufficient; this does not make the underlying deployment hostname invisible to network inspection.

Deploy the agreed integrated branch using the project's existing Vercel workflow and permission scope. Verify Redis readiness using isolated test keys and two competing claim clients; delete only test-owned keys. Verify live ANS and Databricks separately. Do not provision additional paid compute or promise no existing service consumption.

## 6. Start the demo

After implementing the referenced files:

```sh
node scripts/planner-generate-secret.mjs
node --env-file="$HOME/.config/beacon-demo/worker.env" scripts/planner-auth-smoke.mjs
node --env-file="$HOME/.config/beacon-demo/worker.env" tools/beacon-laptop-worker/worker.mjs
```

Secret generation is first-run only; an existing file must not be overwritten. Fill the model and backend URL as described above before starting the worker. The smoke script must also support loading this private configuration itself when invoked without `--env-file`, as in the implementation plan. Do not source arbitrary downloaded shell snippets.

The worker should print only connection status and a newly minted temporary pairing code on the local operator terminal. Open the deployed PWA on the phone, install it, and enter the code **inside the installed PWA**. Codes expire after ten minutes and are one-time. Show a two-hour pairing expiry; allow explicit local renewal. Never display the worker credential as a pairing code.

On macOS, an optional way to keep the worker's laptop awake for the demonstration is:

```sh
caffeinate -i node --env-file="$HOME/.config/beacon-demo/worker.env" tools/beacon-laptop-worker/worker.mjs
```

Keep the laptop powered and lid open. This does not guarantee connectivity during forced sleep, lid closure, battery depletion, or network loss. Stop the process with Ctrl-C when done; expire the demo pairing and disable planner mode after the demo if it is no longer needed.

## 7. Physical phone acceptance and failure behavior

1. Confirm current worker heartbeat, successful managed authentication and actual inference; show only safe status/model information on the phone.
2. Use synthetic public demo endpoints and simulated notifications. Complete plan, confirmation, simulated booking, cancellation, replacement confirmation and arrival.
3. Put the phone on cellular while the laptop remains on Wi-Fi. The phone talks to Vercel, not `localhost`.
4. Reload/reopen the installed PWA; restore trip state from the server and continue activity from the last sequence. Ensure duplicate rows/requests do not duplicate a booking.
5. Stop the worker during a new planning run. After the configured heartbeat threshold, show planner offline. Start it again; resume only valid jobs. A late response for an old selection must be rejected.
6. Stop the worker after a simulated booking. Existing monitoring/reconciliation and manual arrival must continue through the backend's authenticated monitor mechanism. Do not falsely claim mobile background geolocation or serverless in-process timers provide continuous tracking.
7. Test an unpaired second browser: no planner job access or access to the first session's trip/activity. Inspect browser payloads/caches and source labels; no OAuth token, authorization grant, private coordinates in traces, or unwanted provider domain.

Record actual test outcomes and revision. A working animation is not proof of an agent call; a successful model response is not proof of live transport, ANS verification, data freshness, or a delivered alert.
