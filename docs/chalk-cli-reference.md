# Implemented CLI reference

Generated from each command’s actual `--help` output. These help commands do not call providers or deploy Functions.

## `uv run python -m scripts.chalk_doctor`

```text
usage: chalk_doctor.py [-h] [--network] [--smoke {jev,small,large,judge}]

Offline configuration inspection; network and billed smoke calls are explicit.

options:
  -h, --help            show this help message and exit
  --network             Opt into listing gateway models without inference
  --smoke {jev,small,large,judge}
                        Authorize one billed synthetic model request
```

## `uv run python -m scripts.pair_extension`

```text
usage: pair_extension.py [-h]

Create a five-minute, one-use pairing code on the backend machine.

options:
  -h, --help  show this help message and exit
```

## `uv run python -m scripts.coaching_artifacts`

```text
usage: coaching_artifacts.py [-h] {mock,fingerprint} ...

Inspect a profile fingerprint or create explicitly synthetic demo artifacts.

positional arguments:
  {mock,fingerprint}
    mock              Write mock profile and provisional policy for UI tests
                      only
    fingerprint       Print the canonical fingerprint for a reviewed profile

options:
  -h, --help          show this help message and exit
```

## `uv run python -m scripts.coaching_artifacts mock`

```text
usage: coaching_artifacts.py mock [-h] [--directory DIRECTORY]

options:
  -h, --help            show this help message and exit
  --directory DIRECTORY
```

## `uv run python -m scripts.coaching_artifacts fingerprint`

```text
usage: coaching_artifacts.py fingerprint [-h] --profile PROFILE

options:
  -h, --help         show this help message and exit
  --profile PROFILE
```

## `uv run python -m evals.prepare`

```text
usage: prepare.py [-h] [--dataset DATASET] [--output OUTPUT]
                  [--checkpoint CHECKPOINT]
                  [--provider-version-tag PROVIDER_VERSION_TAG] [--allow-live]
                  [--concurrency CONCURRENCY] [--max-calls MAX_CALLS]
                  [--max-input-tokens MAX_INPUT_TOKENS]

Prepare blinded answer comparisons; all output is a private local artifact.

options:
  -h, --help            show this help message and exit
  --dataset DATASET
  --output OUTPUT
  --checkpoint CHECKPOINT
  --provider-version-tag PROVIDER_VERSION_TAG
  --allow-live          Authorize billed answer/judge calls for this
                        invocation
  --concurrency CONCURRENCY
  --max-calls MAX_CALLS
  --max-input-tokens MAX_INPUT_TOKENS
```

## `uv run python -m evals.review export`

```text
usage: review.py export [-h] --dataset DATASET --output OUTPUT
                        [--random-count RANDOM_COUNT] [--target-id TARGET_ID]

options:
  -h, --help            show this help message and exit
  --dataset DATASET
  --output OUTPUT
  --random-count RANDOM_COUNT
  --target-id TARGET_ID
```

## `uv run python -m evals.review apply`

```text
usage: review.py apply [-h] --dataset DATASET --reviews REVIEWS --output
                       OUTPUT

options:
  -h, --help         show this help message and exit
  --dataset DATASET
  --reviews REVIEWS
  --output OUTPUT
```

## `uv run python -m evals.run_local`

```text
usage: run_local.py [-h] [--dataset DATASET] --split {dev,test}
                    [--output OUTPUT] [--checkpoint CHECKPOINT]
                    [--provider-version-tag PROVIDER_VERSION_TAG]
                    [--allow-live] [--harmful-rate-target HARMFUL_RATE_TARGET]
                    [--max-calls MAX_CALLS]
                    [--max-input-tokens MAX_INPUT_TOKENS]

Run the shared classifier on one frozen partition, without answer/judge calls.

options:
  -h, --help            show this help message and exit
  --dataset DATASET
  --split {dev,test}
  --output OUTPUT
  --checkpoint CHECKPOINT
  --provider-version-tag PROVIDER_VERSION_TAG
  --allow-live
  --harmful-rate-target HARMFUL_RATE_TARGET
  --max-calls MAX_CALLS
  --max-input-tokens MAX_INPUT_TOKENS
```

## `uv run python -m evals.tune`

```text
usage: tune.py [-h] --rows ROWS --output OUTPUT [--target TARGET]
               [--min-support MIN_SUPPORT]

Sweep cached development predictions; never issue inference calls.

options:
  -h, --help            show this help message and exit
  --rows ROWS
  --output OUTPUT
  --target TARGET
  --min-support MIN_SUPPORT
```

## `uv run python -m evals.run_chalk`

```text
usage: run_chalk.py [-h] --execute --dataset DATASET --split {dev,test}
                    [--output OUTPUT]
                    [--provider-version-tag PROVIDER_VERSION_TAG]
                    [--resume-run RESUME_RUN] [--timeout TIMEOUT]
                    [--max-calls MAX_CALLS]
                    [--max-input-tokens MAX_INPUT_TOKENS]

Explicit deployment/upload/run boundary; import and --help are offline.

options:
  -h, --help            show this help message and exit
  --execute             Authorize deployment, dataset upload and billed remote
                        execution
  --dataset DATASET
  --split {dev,test}
  --output OUTPUT
  --provider-version-tag PROVIDER_VERSION_TAG
  --resume-run RESUME_RUN
  --timeout TIMEOUT
  --max-calls MAX_CALLS
  --max-input-tokens MAX_INPUT_TOKENS
```

## `uv run python -m evals.parser_eval`

```text
usage: parser_eval.py [-h] [--reference REFERENCE] [--actual ACTUAL]
                      [--runner RUNNER] [--source SOURCE] [--output OUTPUT]

Independent normalized-exchange scoring; the ingest owner supplies the runner.

options:
  -h, --help            show this help message and exit
  --reference REFERENCE
  --actual ACTUAL       Score one existing normalized JSON array
  --runner RUNNER       Owner-supplied Python module:callable; runs five
                        attempts
  --source SOURCE
  --output OUTPUT
```

## `uv run python -m evals.publish`

```text
usage: publish.py [-h] --report REPORT --inspected

Explicitly publish an inspected, sanitized report to the local API database.

options:
  -h, --help       show this help message and exit
  --report REPORT
  --inspected      Confirm that you inspected the report and its provenance
```

## `uv run python -m evals.run_eval1`

```text
usage: run_eval1.py [-h] [--dataset DATASET] --split {dev,test}
                    [--output OUTPUT] [--checkpoint CHECKPOINT]
                    [--provider-version-tag PROVIDER_VERSION_TAG]
                    [--allow-live] [--harmful-rate-target HARMFUL_RATE_TARGET]
                    [--max-calls MAX_CALLS]
                    [--max-input-tokens MAX_INPUT_TOKENS]

Run the shared classifier on one frozen partition, without answer/judge calls.

options:
  -h, --help            show this help message and exit
  --dataset DATASET
  --split {dev,test}
  --output OUTPUT
  --checkpoint CHECKPOINT
  --provider-version-tag PROVIDER_VERSION_TAG
  --allow-live
  --harmful-rate-target HARMFUL_RATE_TARGET
  --max-calls MAX_CALLS
  --max-input-tokens MAX_INPUT_TOKENS
```

## `uv run python -m evals.run_eval2`

```text
usage: run_eval2.py [-h] [--reference REFERENCE] [--actual ACTUAL]
                    [--runner RUNNER] [--source SOURCE] [--output OUTPUT]

Independent normalized-exchange scoring; the ingest owner supplies the runner.

options:
  -h, --help            show this help message and exit
  --reference REFERENCE
  --actual ACTUAL       Score one existing normalized JSON array
  --runner RUNNER       Owner-supplied Python module:callable; runs five
                        attempts
  --source SOURCE
  --output OUTPUT
```
