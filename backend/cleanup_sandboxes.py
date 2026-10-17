"""D7: delete leftover PromptPrint sandboxes.

Only touches sandboxes labeled app=promptprint (every sandbox backend/sandbox.py creates has
that label), and only ones older than --max-age-minutes. Run it before the demo.

Usage: py backend/cleanup_sandboxes.py [--max-age-minutes 60] [--dry-run]

The default is 60 minutes because a hybrid sandbox (D4) stays up while Droid works on the backend,
which can take 15 minutes or more; its own TTL is 60.
"""

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

# The SDK reads DAYTONA_API_KEY from the environment; the key is never printed or put in code.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from daytona import (  # noqa: E402
    Daytona,
    DaytonaConflictError,
    DaytonaNotFoundError,
    ListSandboxesQuery,
    SandboxState,
)

from sandbox import LABELS  # noqa: E402

# The list can lag a delete by a few seconds; these are already on their way out.
GONE = {SandboxState.DESTROYING, SandboxState.DESTROYED}


def created_at(sandbox):
    return datetime.fromisoformat(sandbox.created_at.replace("Z", "+00:00"))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--max-age-minutes", type=float, default=60)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=args.max_age_minutes)
    daytona = Daytona()

    ours = list(daytona.list(ListSandboxesQuery(labels=LABELS)))
    # The label filter is server-side; check again here so a filter bug can never touch other sandboxes.
    ours = [s for s in ours if all(s.labels.get(k) == v for k, v in LABELS.items()) and s.state not in GONE]
    old = [s for s in ours if created_at(s) <= cutoff]
    print(f"{len(ours)} sandbox(es) labeled {LABELS}, {len(old)} older than {args.max_age_minutes:g} min")

    failed = 0
    for s in old:
        age = (now - created_at(s)).total_seconds() / 60
        desc = f"{s.id}  job_id={s.labels.get('job_id')}  state={s.state}  age={age:.1f} min"
        if args.dry_run:
            print(f"would delete {desc}")
            continue
        try:
            daytona.delete(s)
            print(f"deleted {desc}")
        except DaytonaNotFoundError:
            print(f"already gone {desc}")
        except DaytonaConflictError:
            print(f"already being deleted {desc}")  # 409: a state change is in progress
        except Exception as e:
            failed += 1
            print(f"FAILED to delete {desc}: {type(e).__name__}: {e}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
