# Shared coaching configuration

`profile.json` describes the offline benchmark model pair and generation settings.
`policy.json` ties the recommendation threshold to that profile's fingerprint.
Both files are nonsecret configuration intended to be committed together.

For live mode, set these in your private root `.env`:

```dotenv
COACHING_PROFILE_PATH=config/coaching/profile.json
COACHING_POLICY_PATH=config/coaching/policy.json
```

Configure gateway credentials and matching model IDs separately; see
`docs/chalk-setup.md`. The independent judge used for this benchmark is
`openai/gpt-6.1-sol`, configured through `JUDGE_MODEL_ID`.
The checked-in policy remains shadow-only and the profile does not enable website
switching. Mock mode can leave both paths empty to use the packaged mock defaults.

When changing the profile, increment its version and regenerate its fingerprint:

```sh
uv run python -m scripts.coaching_artifacts fingerprint --profile config/coaching/profile.json
```

Update `policy.json`'s `profile_fingerprint` accordingly and reevaluate before
enabling suggestions. Keep credentials, user prompts, generated answers, datasets,
reports and checkpoints out of this directory. They belong in private `.env` or
ignored `artifacts/` storage as appropriate.

The `scripts.coaching_artifacts live-eval` command still creates experimental
configuration and synthetic tasks under `artifacts/`. Promote only a reviewed,
nonsecret profile/policy pair here; do not copy an entire experiment directory.
