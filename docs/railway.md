# Railway backend deployment

Deploy from the repository root using the included `Dockerfile` and `uv.lock`.
The image installs Python 3.12, the locked runtime dependencies, and Factory Droid
CLI 0.174.0 (release checksum checked; automatic CLI updates disabled). The pinned
`droid-sdk` 0.5.0 matches the job runner's permission handlers.

## Railway service settings

1. Connect the GitHub repository and select the branch with these deployment files.
2. Leave Root Directory at the repository root. Railway detects `Dockerfile`.
3. Apply the infrastructure configuration below to provision the `/data` volume,
   set the startup command and `/health` check, disable sleeping, and enforce one
   replica. The launcher explicitly starts one Uvicorn worker. Jobs run in that
   process and are interrupted by restarts; more replicas require a durable queue.
4. Generate a public domain under Settings → Networking after configuring access
   controls appropriate for your users. Connect the extension to that HTTPS URL
   and add its origin to the extension's host permissions in both definitions in
   `extension/wxt.config.ts`.

## Apply storage and runtime settings from code (steps 4 and 5)

`.railway/railway.ts` defines the backend and a **1 GiB persistent volume** mounted
at `/data`, both in `us-west2`. It also sets the Dockerfile builder, startup on
`0.0.0.0:$PORT`, one replica, `/health` with a 120-second startup timeout, sleeping
disabled, and up to three restart attempts on failure. `requiredMountPath=/data`
requires the volume mount for the Railway deployment.

Install Node.js **22 or later** and the current Railway CLI. Then, from the repo
root after disk space is available:

```sh
npm ci --prefix .railway
npm run typecheck --prefix .railway
railway login
railway link
```

Link to the project/environment you created, then edit the `deployment` names in
`.railway/railway.ts` to match the existing backend service. Otherwise a service
named `backend` would be created. If a volume already exists, use its name and
current region/size rather than creating another or moving it. The configured
region must match both the service placement and volume placement.

```sh
railway config plan
railway config apply
```

Review the plan: it should add or attach the intended volume and update only the
backend settings. Stop if it proposes deleting resources/variables, replacing an
existing volume, moving data, or creating an unintended duplicate service. A
named `touchgrass-backend` partial scopes resource ownership; if another IaC
partial already owns this service, update that existing configuration instead.

This file omits source, domains and environment variables; continue configuring
the GitHub branch, API keys and other application variables in Railway. Check
that existing variables remain intact in the plan. Keep the explicit
`DATABASE_URL` unset or pointed at `/data/coaching.db` as described below.

Railway evaluates this file through `config plan/apply`; merely pushing it does
**not** provision the volume. The configuration has not been applied to your
account. It uses Railway's current Infrastructure as Code format rather than
the deprecated `railway.json`/`railway.toml` format. If your service already uses
the legacy format, follow Railway's migration instructions before applying.

## Variables

Copy your **working backend settings** to Railway Variables, not into source or
build arguments. `.env` files are excluded from the image.

| Variable | Value |
| --- | --- |
| `PROMPTPRINT_DATA_DIR` | `/data` (already the image default) |
| `DATABASE_URL` | Omit, or `sqlite:////data/coaching.db` |
| `PROMPTPRINT_MODE` | `live` |
| `COACHING_MODE` | Your existing working setting (`suggest` for recommendations) |
| `CHALK_ROUTER_BASE_URL` | `https://api.chalk.ai/v1/router` |
| `CHALK_ENV_ID` | Existing environment ID |
| `CHALK_ROUTER_API_KEY` | Existing working gateway key |
| `JEV_MODEL_ID` | Existing working Jev ID |
| `SMALL_MODEL_ID`, `LARGE_MODEL_ID`, `JUDGE_MODEL_ID` | Existing values consistent with your profile |
| `COACHING_PROFILE_PATH` | `config/coaching/profile.json` |
| `COACHING_POLICY_PATH` | `config/coaching/policy.json` |
| `COACHING_GENERAL_CONFIG_PATH` | `config/coaching/general-coach.json` for the general coach |
| `FACTORY_API_KEY` | Factory API key |
| `DAYTONA_API_KEY` | Daytona API key |
| `EXECUTOR` | `daytona` |
| `APP_SESSION_SECRET` | Stable randomly generated secret; preserve across redeploys |
| `ALLOWED_ORIGINS` | Comma-separated exact allowed origins, including the extension origin as applicable |

Let Railway supply `PORT`. Leave `DEMO_REPLAY` unset for real jobs. Do not copy
the local `DATABASE_URL=sqlite:///artifacts/coaching.db` into Railway: that explicit
value overrides the volume-backed default. The database implementation supports
SQLite only; adding a Postgres URL will not migrate it.

Generate a session secret locally with `python -c 'import secrets; print(secrets.token_urlsafe(48))'`
and save it in Railway Variables. Never put it in the extension.

## Persistent paths

With `PROMPTPRINT_DATA_DIR=/data`, the backend uses:

| Data | Path | Optional explicit override |
| --- | --- | --- |
| Coaching database | `/data/coaching.db` | `DATABASE_URL` |
| Job database | `/data/jobs.sqlite` | `JOB_DATABASE_PATH` |
| Job outputs and logs | `/data/work/jobs` | `JOB_ROOT` |
| Redacted Droid workspaces | `/data/droid_view/jobs` | `DROID_VIEW_ROOT` |
| Parser cache | `/data/parser_cache` | `PARSER_CACHE` |
| Published adapters | `/data/adapters` | `ADAPTERS_DIR` |
| NASA imagery/results cache | `/data/space/cache` | `NASA_CACHE_DIR` |

Packaged adapters seed an empty adapter directory at startup. Existing files,
including repaired versions, are preserved. Other local databases, generated
files, exports, and saved demo runs are not copied into the image. Existing local
data is not migrated automatically. Back up the volume and define retention for
job outputs and redacted workspaces; the coaching metadata retention setting does
not prune these directories.

Without `PROMPTPRINT_DATA_DIR`, local defaults remain unchanged. Individual path
overrides take precedence. The backend passes adapter/cache locations to the
Droid job subprocesses so repairs and API reads use the same files.

## Build and check locally

```sh
docker build -t promptprint-backend .
docker volume create promptprint-data
docker run --rm --name promptprint-backend \
  -p 127.0.0.1:8000:8000 \
  -v promptprint-data:/data \
  promptprint-backend
```

This starts in mock/local mode with no credentials and makes no paid calls merely
to boot. In another terminal:

```sh
curl --fail-with-body http://127.0.0.1:8000/health
```

For live local testing, add `--env-file .env` to `docker run` and override any local
database path with `-e DATABASE_URL=sqlite:////data/coaching.db`. An env file is
passed at runtime; it is not included in the image. Live upload/coaching actions
can incur provider charges.

The image excludes saved replay runs, so `DEMO_REPLAY=1` needs separately supplied
fixtures; it is not a substitute for testing live jobs on Railway.

## Operations and remaining release work

### Connect the extension to this deployment

The extension now defaults to `https://hackharvard-production.up.railway.app` and
its manifest permits requests to that host. Rebuild with `cd extension && npm run build`,
then reload the unpacked extension from `chrome://extensions` and refresh the AI
site tabs so they use the new content scripts.

An explicitly stored `backendBaseUrl` still overrides the default. To switch an
existing installation from localhost to the hosted default, open
`chrome://extensions` → Touchgrass → Inspect views → service worker and run:

```js
await chrome.storage.local.remove(["backendBaseUrl", "coachingSessionToken"]);
```

Then reload the extension and refresh the AI-site tab. This clears only the
backend override and old server's session; it does not clear onboarding consent
or usage history. A new session is obtained automatically when backend access is
enabled. Local development can explicitly set `backendBaseUrl` to a loopback URL;
loopback permissions remain in the manifest.

`GET /health` reports the job executor mode. A successful Daytona health response
does not prove the Chalk classifier or a live Droid job has completed; verify
those separately through the extension's coach audit and the job logs.

### Runtime operations

The Docker command skips the launcher's automatic sandbox sweep so health checks
don't depend on a provider API. Run `python backend/cleanup_sandboxes.py --dry-run`
in the deployed environment to inspect leftovers, then run without `--dry-run`
when cleanup is intended. Sandbox TTLs remain in place.

This prepares the runtime, not public multi-user access control. Before public
use, restrict automatic session creation and paid job endpoints, add job/result
ownership and request quotas, and move the extension's shared Groq key behind an
authenticated backend. CORS is not authentication. Update both production backend
URL/permission definitions in the extension and test from another computer.

References: [Railway Infrastructure as Code](https://docs.railway.com/infrastructure-as-code),
[IaC reference](https://docs.railway.com/infrastructure-as-code/reference),
[Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles),
[Railway volumes](https://docs.railway.com/volumes), and
[Factory CLI version/checksum installation](https://docs.factory.com/reference/cli-reference).
