# Saved Droid outputs

Files Droid wrote in real runs, reused by `smoke_test.py` (via `DROID_SAVED_DIR`) so the whole flow can be tested without Factory credits. Only Droid's call is skipped: our validator, checks, sandboxes and publishing all still run on them.

| File | Written by | In run |
| --- | --- | --- |
| `parser.py` | the Ingestor, from the redacted planted sample | Daytona rehearsal, job `c5c4c69552e3` |
| `analyze.py` | the Analyst, from fake prompts and counts | Daytona rehearsal, job `c5c4c69552e3` |
| `adapter.json` | the Mechanic, from the cleaned ChatGPT page | the saved repair in `../repair/` (its version is reset to one above the broken adapter when reused) |

They were written from redacted or fake data only and hold no chat text.
