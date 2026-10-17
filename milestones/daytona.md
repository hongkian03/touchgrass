# Prompt Print: Daytona Milestones

Oct 16, 2026 · @Nico

## How this fits together

Daytona gives every user their own disposable cloud sandbox. Droid runs inside it, the user's chat export only ever lives inside it, and the sandbox is deleted afterward. Your backend never runs agent-written code and never stores raw chat history.

**Pitch line from the plan:** "Untrusted, agent-written code running on private data is exactly the problem sandboxes solve."

**What you reuse from the Factory doc:** the work folder layout, `droid_runner.py`, the three job scripts, and the `JobExecutor` interface from F6. Daytona adds a second executor. If you built F1 to F6 the way that doc says, almost nothing else changes.

**Do D0 and D1 early, not last.** The plan calls "droid won't install or authenticate inside Daytona" the top risk and wanted it tested at 5 PM. Recommended order:

1. Factory F0 (droid works on your laptop)
2. **Daytona D0 and D1 (droid works in a sandbox)**
3. Factory F1 to F6
4. Daytona D2 to D7

That way, if D1 fails, you find out tonight while there's still time for the fallback.

**The fallback (from the plan):** if droid can't run inside the sandbox, run Droid on the backend machine and use Daytona only to execute the code Droid writes (`parser.py`, `analyze.py`, the adapter checker). That's still a real, honest Daytona integration. Ask the Factory and Daytona sponsors right away if D1 fails.

**SDK basics** (from Daytona's docs, so Claude Code doesn't guess):

- `pip install daytona`. The SDK reads `DAYTONA_API_KEY` from the environment.
- `Daytona()` client, then `daytona.create(...)` returns a sandbox, `daytona.delete(sandbox)` removes it.
- `sandbox.process.exec("command")` runs a shell command. `sandbox.fs.upload_file(bytes, path)` and `sandbox.fs.download_file(path)` move files.
- `CreateSandboxFromSnapshotParams(snapshot=..., env_vars={...})` creates from a prebuilt snapshot with environment variables. Values in `env_vars` reach every process in the sandbox.
- Snapshots are defined in Python with `Image.debian_slim("3.12").pip_install(...).run_commands(...)` and built with `daytona.snapshot.create(...)`.
- There's an async client too (`AsyncDaytona`), which fits FastAPI better.

## D0. First sandbox from Python

**Goal:** create a sandbox, run a command in it, move a file in and out, delete it. Ten minutes.

**By hand first:**

1. Make a Daytona account and create an API key in its dashboard. Ask the Daytona sponsor about hackathon credits.
2. Add it to the repo-root `.env`:

```
DAYTONA_API_KEY=your-key-here
```

3. `pip install daytona`

**Prompt for Claude Code:**

```
Create sandbox_jobs/daytona_smoke.py using the daytona Python SDK. Load DAYTONA_API_KEY from the repo-root .env with python-dotenv.

1. daytona = Daytona(), then sandbox = daytona.create() with default settings. Print the sandbox id and how long creation took.
2. sandbox.process.exec("python3 --version && uname -a && whoami && echo $HOME") and print the result.
3. Upload a small JSON file with sandbox.fs.upload_file(bytes, path) into the home directory, run a one-line python3 command in the sandbox that reads it and writes a second file, then download the second file with sandbox.fs.download_file and print it.
4. Always delete the sandbox in a finally block, even if a step fails, and print that it was deleted.

Print each step's timing. Don't put the key in code.
```

Run it: `python sandbox_jobs/daytona_smoke.py`

**Done when:** you see the Python version, the round-tripped file contents, and "deleted", and the sandbox no longer appears in your Daytona dashboard.

**Write down from the output:** the user name and home directory (you'll need the path for D1 and D2), and how long creation took (it decides whether the demo needs a warm sandbox).

**If it fails:**

- Auth error: key not loaded. Print `os.environ.get("DAYTONA_API_KEY") is not None` to check.
- Upload path errors: use an absolute path under the home directory you printed.
- Sandbox left running after a crash: delete it from the dashboard, and check the `finally` block exists. Leftover sandboxes burn credits.

**Commit:** `D0: Daytona smoke test`

## D1. Droid inside a sandbox

**Goal:** the droid CLI installs in a fresh sandbox, authenticates with your key, and answers through the Python SDK. This is the test the plan wanted first. Everything else in this doc depends on it.

**Needs:** Factory F0 done (you know your key works on your laptop) and D0 done.

**Prompt for Claude Code:**

```
Create sandbox_jobs/daytona_droid_smoke.py using the daytona and python-dotenv packages.

1. Load DAYTONA_API_KEY and FACTORY_API_KEY from the repo-root .env.
2. Create a sandbox with CreateSandboxFromSnapshotParams(language="python", env_vars={"FACTORY_API_KEY": <key>}). Pass the key only through env_vars at creation, never in a command string or a file.
3. In the sandbox, step by step, printing each command's exit code and output:
   a. Check curl exists and outbound network works: curl -sI https://app.factory.ai
   b. Install droid for Linux: curl -fsSL https://app.factory.ai/cli | sh
   c. Find the binary (likely ~/.local/bin/droid) and run droid --version with that full path.
   d. droid exec --auto low "Reply with exactly: OK" using the full path.
   e. pip install droid-sdk, upload sandbox_jobs/smoke_droid.py, run it with ~/.local/bin on PATH.
4. Stop at the first failing step and print which step failed.
5. Delete the sandbox in a finally block.
6. Print the total time for steps a to e.
```

Run it: `python sandbox_jobs/daytona_droid_smoke.py`

**Done when:** step d and step e both print `OK` from inside the sandbox.

**If it fails, by step:**

- **a fails (no network):** the sandbox can't reach the internet. Check your Daytona plan's network settings; some setups restrict outbound traffic or use an allow list. Ask the Daytona sponsor which domains to allow (at least Factory's).
- **b fails:** read the installer's error. Missing tools (curl, tar) can be added in the snapshot (D2).
- **c fails (not found):** the installer put it somewhere else. Have the script run `ls ~/.local/bin` and `find / -name droid -type f 2>/dev/null | head`.
- **d fails with auth:** the key didn't reach the process. Run `printenv | grep -c FACTORY_API_KEY` (prints a count, not the key).
- **e fails but d works:** PATH. The SDK needs `droid` on PATH, so prefix the command with `export PATH=$HOME/.local/bin:$PATH &&`.

**Decision point:** if this isn't working within about 2 hours of trying, switch to the fallback from the overview and tell your team. Don't sink Saturday into it.

**Commit:** `D1: droid runs inside Daytona sandbox` (or `D1: fallback, Droid on backend` if you switched).

## D2. Prebuilt snapshot

**Goal:** a saved sandbox image with Python, pandas, droid, and the SDK already installed, so each new sandbox starts ready in seconds instead of reinstalling everything. The plan calls this out as the time saver for demos.

**One design choice that saves you hours:** bake only the **dependencies** into the snapshot. Upload your job code (`sandbox_jobs/`) fresh at the start of each run. Your code will change all weekend; if it's baked in, every change means rebuilding the snapshot.

**Prompt for Claude Code:**

```
Create sandbox_jobs/build_snapshot.py using the daytona SDK's declarative builder.

- Image.debian_slim("3.12")
- run_commands: install curl, ca-certificates, and git with apt-get; install the droid CLI with curl -fsSL https://app.factory.ai/cli | sh; then copy the droid binary into /usr/local/bin so it's on PATH for any user. Use what we learned in D1 about where the installer puts it.
- pip_install: droid-sdk, pandas, jsonschema, beautifulsoup4, tiktoken, python-dotenv.
- env: WORK_DIR=/work. Create /work with input, lib, droid, output, logs subfolders, writable by the sandbox user.
- No API keys anywhere in the image. Keys only arrive through env_vars at sandbox creation.
- Name the snapshot promptprint-deps-v1 (bump the number when dependencies change). Build it with daytona.snapshot.create, streaming build logs with on_logs=print.

Then create sandbox_jobs/snapshot_check.py: create a sandbox from that snapshot with FACTORY_API_KEY in env_vars, run droid --version, python -c "import pandas, droid_sdk, bs4, jsonschema", and ls /work. Print the creation time. Delete in finally.
```

**Test:**

1. `python sandbox_jobs/build_snapshot.py` (first build takes a few minutes; watch the logs).
2. `python sandbox_jobs/snapshot_check.py`
3. Compare creation time against D0's default sandbox.

**Done when:** a sandbox from the snapshot has droid and every Python package ready with no installs, and creation time is noted.

**If it fails:**

- droid missing in the new sandbox: the installer ran as root and put it in root's home. The copy to `/usr/local/bin` is the fix.
- Permission denied on `/work`: the sandbox runs as a non-root user. `chown` the folder to that user in the build commands (you found the user name in D0).
- Snapshot name already exists: bump the version number.

**Commit:** `D2: dependency snapshot`

## D3. The per-user sandbox flow

**Goal:** one function that takes an export (as bytes in memory), runs Jobs 1 and 2 in a fresh sandbox, and returns only the finished insights. This is the plan's six-step flow.

**The privacy rule that shapes this milestone:** only these things leave the sandbox: `insights.json`, the job summaries (counts, timings, credits), Droid's log, and the cached `parser.py`. Never download `prompts.jsonl` or the export itself, because those contain the raw chat text. The plan's claim is that raw chat history never touches your server's disk; this is what makes it true.

**Prompt for Claude Code:**

```
Create backend/sandbox.py using the daytona SDK (async client if it fits FastAPI better).

async def run_user_jobs(export_bytes, filename, job_id, on_log=None) -> dict:
1. Create a sandbox from snapshot promptprint-deps-v1 with env_vars: FACTORY_API_KEY, WORK_DIR=/work, and any other keys the jobs need, read from the backend's environment. Never bake keys into the snapshot or pass them in command strings.
2. Package sandbox_jobs/ as a tar.gz in memory (excluding samples/ and any __pycache__), upload it, and extract it to /opt/jobs.
3. Upload export_bytes straight to /work/input/<filename>. Never write the export to the backend's disk at any point.
4. If backend/parser_cache/ has a parser for this file's fingerprint, upload it too. (Compute the fingerprint inside the sandbox by running fingerprint.py there, download only the fingerprint string, then upload the matching cached parser if one exists.)
5. Run python /opt/jobs/run_jobs.py inside the sandbox with a timeout. Capture exit code.
6. Download only: /work/output/insights.json, the job summary JSON, /work/logs/*.jsonl, and /work/droid/parser.py (save it into backend/parser_cache/<fingerprint>/ if the ingest succeeded without a cache hit). Never download prompts.jsonl or anything from /work/input.
7. Delete the sandbox in a finally block, always. Log the sandbox id and that it was deleted.
8. Return {insights, summary, sandbox_id, timings for each step}.

Also create backend/try_sandbox_flow.py that calls run_user_jobs on sandbox_jobs/samples/ (the fake ChatGPT export) read into memory, and prints the timings and the top 3 tip titles.
```

**Test:**

1. `python backend/try_sandbox_flow.py`
2. Check the timings: sandbox creation, upload, Droid jobs, download, delete.
3. Confirm the sandbox is gone from the Daytona dashboard.
4. Search your backend folder for any copy of the export or `prompts.jsonl`. There must be none.
5. Run it a second time: it should be a cache hit and much faster.

**Done when:** insights come back from a sandbox, the sandbox is deleted, no raw chat text exists anywhere on the backend, and the second run uses the cached parser.

**If it fails:**

- Jobs can't find their files: paths differ between your laptop (`./work`) and the sandbox (`/work`). Everything should read `WORK_DIR` from the environment, not hard-code it.
- Exec times out: Droid jobs take minutes. Raise the exec timeout, and in D5 you'll switch to running in the background.
- Sandbox not deleted after an error: the `finally` is missing or something raised before the try. Fix this before anything else; leaked sandboxes cost credits.

**Commit:** `D3: per-user sandbox flow, no raw chat on backend`

## D4. DaytonaExecutor in the backend

**Goal:** flip one environment variable (`EXECUTOR=daytona`) and every upload runs in its own sandbox instead of on your laptop. The routes from Factory F6 don't change.

**A detail that matters for the privacy claim:** FastAPI's normal file upload (`UploadFile`) quietly writes files larger than about 1 MB to a temp file on disk. A real chat export is bigger than that. To keep "never touches our disk" true, read the request body into memory yourself.

**Prompt for Claude Code:**

```
Add DaytonaExecutor to backend/executor.py, implementing the existing JobExecutor interface by calling backend/sandbox.py.

- run_ingest_and_analyze uses run_user_jobs from sandbox.py and stores the returned insights and summary on the job record, exactly as LocalExecutor does.
- Select it when EXECUTOR=daytona.
- Change POST /upload so that in daytona mode it reads the raw request body into memory with a size cap (50 MB), instead of using UploadFile, which can spill large files to a temp file on disk. Keep the same response shape. Return 413 if over the cap.
- Unlike local mode, allow up to 3 jobs in parallel in daytona mode, since each user gets their own sandbox. Use an asyncio semaphore.
- Record sandbox_id and per-step timings on the job record so the dashboard can show them.
- Make sure the export bytes are released after upload to the sandbox and never logged.
```

**Test:**

1. Start the backend with `EXECUTOR=daytona` (in PowerShell: `$env:EXECUTOR = "daytona"` before `uvicorn`).
2. Repeat the Factory F6 tests: POST the fake export to `/upload`, poll `/jobs/<id>`, check `/insights/latest`.
3. Upload three files quickly. Three sandboxes should appear in the Daytona dashboard at once, then all disappear.
4. Upload a file over 50 MB (any big file renamed). Should get 413.
5. Check the backend folder and your temp folder for any copy of the export. None.

**Done when:** the same endpoints work in both modes, parallel uploads get separate sandboxes, and nothing is written to the backend's disk.

**If it fails:**

- Works in local mode but not Daytona: compare the job's sandbox logs (D5 makes this easier) with a local run of the same file.
- Backend freezes during a job: a synchronous Daytona call is blocking the event loop. Use the async client or run it in a thread.

**Commit:** `D4: DaytonaExecutor, in-memory uploads`. Merge to `main` so the dashboard can use it.

## D5. Live logs from the sandbox

**Goal:** while Droid works inside the sandbox, its log streams line by line to the dashboard. The plan's demo shows judges Droid writing and testing the parser live, so this is what they actually see.

**Approach:** start the job in the background inside the sandbox, then read new log lines every second until a "done" marker appears. Daytona also has process sessions with streaming logs; if the SDK version you have supports it cleanly, that's nicer, but polling is reliable and uses only calls you already tested.

**Watch what's in the log:** Droid inspects the export while it works, so tool results can contain pieces of real chats. The log the UI sees should show what Droid is doing (its messages, which tools it called, test pass or fail), not the contents it read.

**Prompt for Claude Code:**

```
Add live log streaming to backend/sandbox.py.

1. Check the installed daytona SDK for process sessions with async or streaming command logs. If available and simple, use it. Otherwise:
   - Start the jobs in the background inside the sandbox (nohup, redirect stdout and stderr to /work/logs/run.out), and have run_jobs.py write /work/output/done.json with the exit code when it finishes.
   - Every 1 second, read only the new part of each /work/logs/*.jsonl file (track byte offsets; use tail -c +N through process.exec rather than re-downloading whole files), and pass each new line to the on_log callback.
   - Stop when done.json exists, then do the normal downloads and delete.
2. Overall job timeout of 10 minutes. On timeout, download whatever logs exist, mark the job failed, and delete the sandbox.
3. Connect on_log to the existing GET /jobs/{job_id}/logs Server-Sent Events route from Factory F6, so it works the same in local and Daytona mode.
4. In sandbox_jobs/droid_runner.py, make sure the log lines contain only: Droid's own assistant text, tool names, file paths it wrote, commands it ran, and pass or fail results. Never the content of tool results (which may contain chat text from the export). Truncate any line over 200 characters.
```

**Test:**

1. Daytona mode. Upload the fake sample. Open `/jobs/<id>/logs` in a browser tab right away.
2. Lines should appear within a second or two of Droid doing things, not all at once at the end.
3. Read through them: no prompt or response text from the sample should appear. (Put an obvious marker like `SECRETWORD123` in the fake export and search the log for it.)
4. Force a timeout (set it to 20 seconds temporarily): job fails cleanly, sandbox deleted.

**Done when:** logs stream live in Daytona mode, the marker word never appears in them, and timeouts clean up.

**If it fails:**

- Lines arrive in bursts: Python is buffering inside the sandbox. Run with `python -u` or flush after each write.
- Duplicate lines: byte offsets aren't being updated.
- Marker word appears: find which log type carries it and drop that content in the runner.

**Commit:** `D5: live sandbox log streaming with redaction`

## D6. Mechanic in its own sandbox

**Goal:** each adapter repair (Factory F5) runs in a fresh, short-lived sandbox. The backend verifies the result with its own checker before publishing, so nothing Droid wrote is trusted blindly.

**Why the backend verifies, not the sandbox:** the sandbox can't reach your local backend anyway, and the final check should be done by code you control outside the agent's environment. The adapter is just JSON data, so checking it on the backend is safe.

**Prompt for Claude Code:**

```
Implement DaytonaExecutor.run_repair in backend/executor.py.

1. Create a sandbox from promptprint-deps-v1 with FACTORY_API_KEY in env_vars. Upload the sandbox_jobs tarball as in D3.
2. Upload the page snapshot HTML, the broken adapter JSON, and expected.json into /work/input. Keep the snapshot in memory on the backend; never write it to backend disk.
3. Run python /opt/jobs/repair_adapter.py with a --no-publish flag (add that flag: it skips the PUT and just leaves /work/output/adapter.json). Stream logs through on_log like D5.
4. Download /work/output/adapter.json and the logs. Delete the sandbox in finally.
5. On the backend, run sandbox_jobs/lib/check_adapter.py (our code) against the downloaded adapter and the in-memory snapshot. Publish to /adapters/{site} only if it passes and the version is higher than the current one.
6. Warm sandbox option for the demo: an environment flag WARM_REPAIR_SANDBOX=1 makes the backend create one sandbox from the snapshot at startup (with code already uploaded) and use it for the next repair, then delete it and create a new warm one in the background. This removes creation time from the live demo.
```

**Test:**

1. Daytona mode. Use `break_adapter.py` from Factory F5 to make a broken adapter.
2. POST it with the snapshot to `/adapter-failure`. Watch `/jobs/<id>/logs`.
3. Check the published adapter version went up and the checker passed on the backend side.
4. Time it with and without `WARM_REPAIR_SANDBOX=1`. Write both numbers down.
5. If the extension owner has M4 working: have ChatGPT open with the extension and watch it pick up the fix without a refresh.

**Done when:** a repair runs fully in a sandbox, is verified by the backend before publishing, and you know how long it takes warm vs cold.

**If it fails:**

- Repair passes in the sandbox but fails the backend check: the two checkers differ (different BeautifulSoup version). Pin the same version in the snapshot and backend `requirements.txt`.
- Warm sandbox expired: Daytona may auto-stop idle sandboxes. Recreate the warm one shortly before the demo, or check its state before using it.

**Commit:** `D6: Mechanic repairs in short-lived sandboxes, backend-verified`

## D7. Cleanup, privacy proof, demo fallbacks

**Goal:** no sandbox ever leaks, you can show judges evidence for the privacy claim instead of just saying it, and the Daytona part of the demo survives bad Wi-Fi.

**Prompt for Claude Code:**

```
Harden the Daytona integration.

1. Leak protection: when creating sandboxes, set Daytona's auto-stop and auto-delete (or ephemeral) options if the installed SDK supports them, so even a crashed backend can't leave sandboxes running. Also add backend/cleanup_sandboxes.py that lists all sandboxes labeled as ours and deletes any older than 15 minutes. Label every sandbox we create (for example app=promptprint, job_id=...) so the cleanup never touches anything else.

2. Privacy evidence: add GET /jobs/{job_id}/audit returning, for that job: sandbox_id, created_at, deleted_at, the list of files uploaded into the sandbox (names and sizes only), and the list of files downloaded from it (names and sizes only). The dashboard can show this as proof that only insights came back.

3. Replay fallback: an environment flag DEMO_REPLAY=1 makes /upload and /adapter-failure skip Daytona and replay a saved successful run: stream the saved log lines at their original timing through /jobs/{id}/logs and return the saved insights or adapter. Add backend/save_demo_run.py to capture a real successful run into backend/demo_runs/.

4. Add a short "Where Daytona works" section to README.md: one sandbox per user from a prebuilt snapshot, keys only via env_vars, raw export uploaded from memory and never stored, only insights downloaded, sandboxes deleted after each job, repairs in short-lived sandboxes verified by the backend.
```

**Demo checklist:**

- [ ] `cleanup_sandboxes.py` run before the demo: zero leftover sandboxes.
- [ ] One real successful upload run and one repair run saved with `save_demo_run.py`.
- [ ] Tested `DEMO_REPLAY=1` end to end, so switching to it mid-demo is one restart.
- [ ] Warm repair sandbox enabled and recreated shortly before going on stage.
- [ ] The audit page for the demo job open in a tab, to point at during the Daytona line.
- [ ] Say it out loud in the demo: "The raw chat history never touches our server's disk. It lives in a sandbox for about a minute and then the sandbox is gone."

**Done when:** a deliberately crashed run leaves nothing behind after cleanup, the audit endpoint shows only insights downloaded, and replay mode works.

**Commit:** `D7: sandbox cleanup, audit trail, demo replay`

## Stretch: Best-of-N parallel Droids

**Only start this after D0 to D7 work end to end.** The plan says hard-mode features come after the core works (target Saturday 2 PM), and a half-built stretch feature hurts more than it helps at judging.

**Goal:** for a new export format (cache miss), start 4 sandboxes at once. Each Droid writes its own parser independently. Score them all on part of the file none of them saw, keep the winner. This is the plan's hard-mode Daytona feature: it shows why fast, disposable sandboxes matter.

**Prompt for Claude Code:**

```
Add Best-of-N parsing to backend/sandbox.py, used only on a parser cache miss and only when BEST_OF_N is set (default off).

1. Inside a first sandbox, split the export into a dev part and a held-out part (for ChatGPT-style exports, hold out about 20% of conversations; for CSV, 20% of rows). Download nothing except the two parts' sizes.
   Simpler alternative if splitting inside the sandbox is awkward: upload the full export to each sandbox and have each split it deterministically with the same seed.
2. Start N=4 sandboxes in parallel from the snapshot. In each, run the Ingestor on the dev part only.
3. In each sandbox, run that parser on the held-out part and our validator on the result. Score each: validator pass (required), number of valid exchanges extracted, and whether its counts (exchanges, regenerations, images) agree with the majority of the other parsers.
4. Pick the highest score, cache its parser.py, and use it for the user's full run.
5. Delete all N sandboxes in finally, even if some fail or time out. Record each candidate's score, duration, and credits on the job record.
6. Show the 4 candidates and their scores in the job summary so the dashboard can display the race.
```

**Test:** run it on the Claude-style or CSV sample (so it's a cache miss). Four sandboxes should appear together in the dashboard, all disappear afterward, and the job summary should list four scored candidates with one chosen.

**Watch the cost:** this is 4 times the Droid credits per new format. Run it once or twice to capture a demo run, then rely on replay.

**Done when:** four parallel candidates are scored on held-out data, the winner is cached, and nothing leaks.

**Commit:** `Stretch: Best-of-N parallel Droid parsers`
