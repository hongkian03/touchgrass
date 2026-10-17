"""Find the biggest sources of wasted AI energy in a user's prompt history.

Reads  ../output/prompts.jsonl   (one exchange per line, see ../lib/schema.json)
Writes ../output/insights.json   (see ../lib/insights_schema.json)

Every energy, water and CO2 number comes from ../lib/footprint.py. This module
holds no energy, water or carbon constants of its own: the numbers below are
token estimates and detection thresholds only.

Detection: near-identical repeated questions, regenerate loops, very long
outputs for short asks, image/video spikes and time-of-day patterns. Each
detector reports the energy it thinks could have been saved (low/high Wh, always
through footprint), and the three largest estimates become the tips.

The output is deterministic. It depends only on the input file, never on the
current time or on randomness: generated_at is the latest timestamp in the data,
so two runs over the same file produce byte-identical output.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
WORK_DIR = HERE.parent
LIB_DIR = WORK_DIR / "lib"
if str(LIB_DIR) not in sys.path:
    sys.path.insert(0, str(LIB_DIR))

import footprint  # noqa: E402  (the library path is set up just above, on purpose)

PROMPTS_PATH = WORK_DIR / "output" / "prompts.jsonl"
INSIGHTS_PATH = WORK_DIR / "output" / "insights.json"

# --- estimation and detection knobs (not footprint numbers) -------------------
CHARS_PER_TOKEN = 4          # output tokens estimated as response characters / 4
EXAMPLE_CHARS = 80           # insights_schema.json maxLength for evidence.examples
ROUND_DP = 6
MIN_CORE_TOKENS = 3          # ignore asks too short to compare safely
EXACT_MIN_WORDS = 3          # ... unless the whole ask is identical, word for word
DUP_JACCARD = 0.65           # "small wording change" threshold on content words
DF_MAX = 200                 # skip tokens appearing in more than this many asks
LONG_ANSWER_CHARS = 600      # an answer this long is a long answer ...
LONG_ANSWER_RATIO = 3.0      # ... or this many times your typical answer ...
SHORT_ASK_CHARS = 80         # ... given an ask no longer than this
MEDIA_KINDS = ("image", "video")
MAX_TIPS = 3
EPOCH = "1970-01-01T00:00:00+00:00"  # period placeholder for an empty input file

_STOPWORDS = frozenset(
    "a an the and or of to in for on at by with from as is are was were be been "
    "do does did i me my we you your it its this that these those can could should "
    "would will just please how what when where which who why if then than so not no "
    "but about into over".split()
)

_WORD = re.compile(r"[a-z0-9]+")


# --- small helpers -----------------------------------------------------------
def parse_ts(value):
    """ISO 8601 string -> datetime (timezone kept if present), or None."""
    text = str(value).strip()
    if not text:
        return None
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _epoch(dt):
    """Sortable timestamp; timezone-naive values are treated as UTC."""
    if dt is None:
        return float("inf")
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc).timestamp()
    return dt.timestamp()


def _round(value):
    return round(float(value), ROUND_DP)


def _range(low, high):
    """A schema-legal {low, high} range with low <= high."""
    lo = _round(max(0.0, low))
    hi = _round(max(0.0, high))
    if hi < lo:
        hi = lo
    return {"low": lo, "high": hi}


def _round_pair(low, high):
    """Round a low/high pair so titles show exactly the numbers the report carries."""
    rounded = _range(low, high)
    return rounded["low"], rounded["high"]


def _num(value):
    """A number exactly as the report stores it, with trailing zeros dropped."""
    value = float(value)
    if value <= 0:
        return "0"
    text = f"{value:.{ROUND_DP}f}".rstrip("0").rstrip(".")
    return text or "0"


def _text(value):
    return "" if value is None else str(value)


def _flag(value):
    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "yes", "y", "t")
    return bool(value)


def _median(values, default=0.0):
    values = [float(v) for v in values]
    if not values:
        return float(default)
    return float(pd.Series(values).median())


def _stem(word):
    if len(word) > 4 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def core_tokens(text):
    """Content words of a prompt, stems only, order dropped, duplicates kept out."""
    words = _WORD.findall(_text(text).lower())
    return frozenset(_stem(w) for w in words if w not in _STOPWORDS)


def exact_key(text):
    """The whole ask, lowercased and stripped of punctuation, when it is long enough to trust."""
    words = _WORD.findall(_text(text).lower())
    if len(words) < EXACT_MIN_WORDS:
        return None
    return " ".join(words)


def _example(text):
    """One prompt, whitespace collapsed, cut to the schema's 80 character limit."""
    flat = " ".join(_text(text).split())
    if len(flat) > EXAMPLE_CHARS:
        flat = flat[: EXAMPLE_CHARS - 1].rstrip() + "\u2026"
    return flat


def _examples(df, indexes):
    out = []
    for i in indexes:
        item = _example(df.at[i, "prompt_text"])
        if item and item not in out:
            out.append(item)
        if len(out) == 3:
            break
    return out


def _sum_energy(df, indexes):
    low = high = 0.0
    for i in indexes:
        low += float(df.at[i, "energy_low"])
        high += float(df.at[i, "energy_high"])
    return low, high


def _cand(cid, pattern, title, counts, examples, low, high, how_to_fix, rows=(), fired=None):
    rows = frozenset(int(i) for i in rows)
    if fired is None:
        fired = bool(rows) and (low > 0 or high > 0)
    return {
        "id": cid,
        "pattern": pattern,
        "title": title,
        "counts": {k: int(v) for k, v in counts.items()},
        "examples": list(examples)[:3],
        "low": float(low),
        "high": float(high),
        "how_to_fix": how_to_fix,
        "rows": rows,
        "fired": bool(fired),
    }


def _rank(candidate):
    return (-candidate["high"], -candidate["low"], candidate["id"])


# --- input -------------------------------------------------------------------
def records_to_frame(rows):
    """Build the working frame: one row per exchange, energy taken from footprint."""
    normalized = []
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        ts = _text(raw.get("ts"))
        dt = parse_ts(ts)
        prompt = _text(raw.get("prompt_text"))
        response = _text(raw.get("response_text"))
        kind = _text(raw.get("kind")).lower() or "text"
        if kind not in ("text", "image", "video"):
            kind = "text"
        normalized.append(
            {
                "ts": ts,
                "dt": dt,
                "sort_key": _epoch(dt),
                "date": dt.date().isoformat() if dt else ts[:10],
                "hour": dt.hour if dt else -1,
                "provider": _text(raw.get("provider")),
                "model": _text(raw.get("model")),
                "kind": kind,
                "prompt_text": prompt,
                "response_text": response,
                "regenerated": _flag(raw.get("regenerated")),
                "prompt_chars": len(prompt),
                "response_chars": len(response),
                "output_tokens": len(response) / CHARS_PER_TOKEN,
            }
        )

    columns = [
        "ts", "dt", "sort_key", "date", "hour", "provider", "model", "kind",
        "prompt_text", "response_text", "regenerated", "prompt_chars",
        "response_chars", "output_tokens", "energy_low", "energy_high",
    ]
    if not normalized:
        empty = pd.DataFrame({name: pd.Series(dtype=object) for name in columns})
        return empty

    df = pd.DataFrame(normalized)
    df["dt"] = pd.Series([row["dt"] for row in normalized], dtype=object, index=df.index)
    energies = [
        footprint.energy_wh(row["kind"], row["model"], row["output_tokens"])
        for row in normalized
    ]
    df["energy_low"] = [pair[0] for pair in energies]
    df["energy_high"] = [pair[1] for pair in energies]
    df = df.sort_values("sort_key", kind="stable").reset_index(drop=True)
    return df[columns]


def load_exchanges(path):
    rows = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            rows.append(obj)
    return records_to_frame(rows)


# --- near-duplicate grouping -------------------------------------------------
class _UnionFind:
    def __init__(self, size):
        self.parent = list(range(size))

    def find(self, i):
        while self.parent[i] != i:
            self.parent[i] = self.parent[self.parent[i]]
            i = self.parent[i]
        return i

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[max(ra, rb)] = min(ra, rb)


def question_groups(df):
    """Label each row with the question it asks.

    Two asks land in the same group when they are the same sentence once case and
    punctuation are ignored, or when their content words overlap enough to be the
    same question with a small wording change. Rows that share a question with no
    one else get None.
    """
    size = len(df)
    cores = [core_tokens(text) for text in df["prompt_text"]]
    exacts = [exact_key(text) for text in df["prompt_text"]]
    finder = _UnionFind(size)

    buckets = {}
    for i, key in enumerate(exacts):
        if key is not None:
            buckets.setdefault(key, []).append(i)
    for key in sorted(buckets):
        rows = buckets[key]
        for other in rows[1:]:
            finder.union(rows[0], other)

    # Same content words in a different order is the same question, however often it repeats.
    signatures = {}
    for i, core in enumerate(cores):
        if len(core) >= MIN_CORE_TOKENS:
            signatures.setdefault(tuple(sorted(core)), []).append(i)
    for signature in sorted(signatures):
        rows = signatures[signature]
        for other in rows[1:]:
            finder.union(rows[0], other)

    postings = {}
    for i, core in enumerate(cores):
        if len(core) < MIN_CORE_TOKENS:
            continue
        for token in core:
            postings.setdefault(token, []).append(i)
    for token in sorted(postings):
        rows = postings[token]
        if len(rows) > DF_MAX:
            continue  # a word this common carries no signal about sameness
        for a in range(len(rows)):
            for b in range(a + 1, len(rows)):
                i, j = rows[a], rows[b]
                shared = len(cores[i] & cores[j])
                union_size = len(cores[i]) + len(cores[j]) - shared
                if union_size and shared / union_size >= DUP_JACCARD:
                    finder.union(i, j)

    labels = [None] * size
    for i in range(size):
        if len(cores[i]) >= MIN_CORE_TOKENS or exacts[i] is not None:
            labels[i] = finder.find(i)
    tally = {}
    for label in labels:
        if label is not None:
            tally[label] = tally.get(label, 0) + 1
    return [label if label is not None and tally[label] > 1 else None for label in labels]


def repeated_groups(df, labels):
    """Groups of two or more rows asking the same question, each in timestamp order."""
    groups = {}
    for i in df.index:
        label = labels[i]
        if label is not None:
            groups.setdefault(label, []).append(i)
    return [sorted(group) for group in groups.values() if len(group) > 1]


# --- detectors ---------------------------------------------------------------
def detect_repeated_questions(df, labels=None):
    total = len(df)
    pattern = "repeated_questions"
    if total == 0:
        return _cand(pattern, pattern, "No exchanges in this file, so no repeated questions to report",
                     {"repeated_questions": 0, "duplicate_asks": 0, "total_exchanges": 0}, [], 0.0, 0.0,
                     "Nothing to fix without prompt history.")

    if labels is None:
        labels = question_groups(df)
    groups = repeated_groups(df, labels)
    ranked = sorted(
        groups,
        key=lambda group: (-_sum_energy(df, group[1:])[1], group[0]),
    )
    duplicates = []
    for group in ranked:
        duplicates.extend(group[1:])
    low, high = _round_pair(*_sum_energy(df, duplicates))
    count = len(groups)

    if not duplicates:
        return _cand(pattern, pattern,
                     f"No repeated questions: all {total} asks you made are worded differently",
                     {"repeated_questions": 0, "duplicate_asks": 0, "total_exchanges": total},
                     [], 0.0, 0.0,
                     "Nothing to fix: every ask so far bought you a new answer.")

    title = (f"{len(duplicates)} duplicate ask(s) across {count} repeated question(s) "
             f"cost {_num(low)}-{_num(high)} Wh")
    how_to_fix = (f"Ask each of those {count} question(s) once and reuse the answer; the "
                  f"{len(duplicates)} re-typed ask(s) bought nothing new.")
    examples = _examples(df, [group[0] for group in ranked])
    return _cand(pattern, pattern, title,
                 {"repeated_questions": count, "duplicate_asks": len(duplicates),
                  "total_exchanges": total},
                 examples, low, high, how_to_fix, duplicates)


def detect_regenerate_loops(df, labels=None):
    total = len(df)
    pattern = "regenerate_loops"
    if total == 0:
        return _cand(pattern, pattern, "No exchanges in this file, so no regenerations to report",
                     {"regenerated_exchanges": 0, "regenerate_loops": 0, "total_exchanges": 0},
                     [], 0.0, 0.0, "Nothing to fix without prompt history.")

    if labels is None:
        labels = question_groups(df)
    regenerated = [i for i in df.index if bool(df.at[i, "regenerated"])]
    loops = 0
    seen = set()
    for i in df.index:
        label = labels[i]
        if label is not None:
            if label in seen and bool(df.at[i, "regenerated"]):
                loops += 1
            seen.add(label)

    low, high = _round_pair(*_sum_energy(df, regenerated))
    if not regenerated:
        return _cand(pattern, pattern,
                     f"No regenerations: all {total} answers were accepted first time",
                     {"regenerated_exchanges": 0, "regenerate_loops": 0, "total_exchanges": total},
                     [], 0.0, 0.0,
                     "Nothing to fix: your first prompt already got the answer you wanted.")

    title = f"{len(regenerated)} regenerated response(s) wasted {_num(low)}-{_num(high)} Wh"
    if loops:
        title += f"; {loops} of them re-asked a question you had already asked"
    how_to_fix = (f"Put length, tone and format in the first prompt so its answer is usable: "
                  f"{len(regenerated)} of {total} responses here were regenerations.")
    return _cand(pattern, pattern, title,
                 {"regenerated_exchanges": len(regenerated), "regenerate_loops": loops,
                  "total_exchanges": total},
                 _examples(df, regenerated), low, high, how_to_fix, regenerated)


def detect_long_output_short_ask(df):
    pattern = "long_output_short_ask"
    total = len(df)
    text = df[df["kind"] == "text"] if total else df

    if len(text) == 0:
        return _cand(pattern, pattern,
                     f"No text exchanges in {total} exchange(s), so no long answers to report",
                     {"long_outputs": 0, "text_exchanges": 0, "total_exchanges": total},
                     [], 0.0, 0.0,
                     "Nothing to fix: long outputs only appear on text asks.")

    response_chars = [int(text.at[i, "response_chars"]) for i in text.index]
    prompt_chars = [int(text.at[i, "prompt_chars"]) for i in text.index]
    typical = int(round(_median(response_chars)))
    long_cut = max(LONG_ANSWER_CHARS, LONG_ANSWER_RATIO * typical)
    short_cut = max(SHORT_ASK_CHARS, _median(prompt_chars))
    long_asks = [int(text.at[i, "prompt_chars"]) for i in text.index
                 if text.at[i, "prompt_chars"] <= short_cut]

    flagged = [i for i in text.index
               if text.at[i, "response_chars"] >= long_cut and text.at[i, "prompt_chars"] <= short_cut]
    others = [text.at[i, "output_tokens"] for i in text.index if i not in set(flagged)]
    target_tokens = max(1.0, _median(others if others else text["output_tokens"].tolist()))

    low = high = 0.0
    for i in flagged:
        tokens = float(text.at[i, "output_tokens"])
        model = text.at[i, "model"]
        keep = min(tokens, target_tokens)
        full = footprint.energy_wh("text", model, tokens)
        lean = footprint.energy_wh("text", model, keep)
        low += max(0.0, full[0] - lean[0])
        high += max(0.0, full[1] - lean[1])
    low, high = _round_pair(low, high)

    longest = int(max(response_chars))
    typical = int(round(_median(response_chars)))
    counts = {
        "long_outputs": len(flagged),
        "longest_response_chars": longest,
        "typical_response_chars": typical,
        "long_answer_threshold_chars": int(round(long_cut)),
        "short_asks": len(long_asks),
        "total_exchanges": total,
    }

    if not flagged:
        return _cand(pattern, pattern,
                     f"No long answers: your longest is {longest} chars against asks around "
                     f"{int(round(_median(prompt_chars)))} chars",
                     counts, [], 0.0, 0.0,
                     "Nothing to fix: your asks are long enough that the answers stay in proportion.")

    if high <= 0:
        return _cand(pattern, pattern,
                     f"{len(flagged)} answer(s) ran past {int(round(long_cut))} chars, but your "
                     f"typical answer is {typical} chars, so there is little to trim",
                     counts, _examples(df, flagged), 0.0, 0.0,
                     "Nothing to fix: those long answers are in line with the rest of your history.")

    target_chars = int(round(target_tokens * CHARS_PER_TOKEN))
    title = (f"{len(flagged)} short ask(s) drew answers up to {longest} chars (your typical answer "
             f"is {typical}) and cost {_num(low)}-{_num(high)} Wh of avoidable output")
    how_to_fix = (f"Ask for about {target_chars} characters, or 'briefly, three bullets', on those "
                  f"{len(flagged)} questions; the rest of your {typical}-character answers show that "
                  f"is enough.")
    return _cand(pattern, pattern, title, counts, _examples(df, flagged), low, high, how_to_fix, flagged)


def detect_media_spike(df):
    pattern = "media_spike"
    total = len(df)
    media = [i for i in df.index if df.at[i, "kind"] in MEDIA_KINDS] if total else []
    images = [i for i in media if df.at[i, "kind"] == "image"]
    videos = [i for i in media if df.at[i, "kind"] == "video"]

    if not media:
        return _cand(pattern, pattern,
                     f"No image or video asks in {total} exchange(s)",
                     {"media_exchanges": 0, "image_exchanges": 0, "video_exchanges": 0,
                      "spike_days": 0, "extra_media_exchanges": 0, "total_exchanges": total},
                     [], 0.0, 0.0,
                     "Nothing to fix: your history is all text, which is the lightest way to work.")

    spike_days = []
    extras = []
    for date in sorted({df.at[i, "date"] for i in media}):
        day_rows = sorted(i for i in media if df.at[i, "date"] == date)
        if len(day_rows) > 1:
            spike_days.append(date)
        extras.extend(day_rows[1:])
    extras.extend(i for i in media if bool(df.at[i, "regenerated"]) and i not in set(extras))
    extras = sorted(set(extras))

    low, high = _round_pair(*_sum_energy(df, extras))
    _, media_high = _sum_energy(df, media)
    total_high = sum(float(v) for v in df["energy_high"]) if total else 0.0
    share = int(round(100 * media_high / total_high)) if total_high > 0 else 0
    counts = {
        "media_exchanges": len(media),
        "image_exchanges": len(images),
        "video_exchanges": len(videos),
        "spike_days": len(spike_days),
        "extra_media_exchanges": len(extras),
        "media_energy_share_pct": share,
        "total_exchanges": total,
    }

    if not extras:
        return _cand(pattern, pattern,
                     f"{len(media)} image/video ask(s) are {share}% of your energy but none repeat "
                     f"within a day",
                     counts, _examples(df, media), 0.0, 0.0,
                     "Nothing to fix: you generated each image or video once instead of re-rolling it.")

    title = (f"{len(media)} image/video ask(s) carry {share}% of your energy; {len(extras)} "
             f"beyond the first on their day cost {_num(low)}-{_num(high)} Wh")
    if spike_days:
        how_to_fix = (f"Generate one image or video per idea and re-roll only after a specific change, "
                      f"instead of the {len(extras)} extra media ask(s) you logged on "
                      f"{len(spike_days)} day(s).")
    else:
        how_to_fix = (f"Accept an image or video once it is close and refine it in text instead of the "
                      f"{len(extras)} media ask(s) you regenerated here.")
    return _cand(pattern, pattern, title, counts, _examples(df, extras), low, high, how_to_fix, extras)


def detect_time_of_day(df, labels=None):
    pattern = "time_of_day"
    total = len(df)
    if total == 0 or int(df["hour"].max()) < 0:
        return _cand(pattern, pattern,
                     f"No usable hours: {total} exchange(s) carry no readable timestamp",
                     {"peak_hour": 0, "peak_hour_exchanges": 0, "redundant_in_peak_hour": 0,
                      "total_exchanges": total},
                     [], 0.0, 0.0,
                     "Nothing to fix: time of day needs timestamps in the history.")

    if labels is None:
        labels = question_groups(df)
    dated = df[df["hour"] >= 0]
    counts_per_hour = {int(h): int(c) for h, c in dated.groupby("hour").size().items()}
    energy_per_hour = {int(h): float(v) for h, v in dated.groupby("hour")["energy_high"].sum().items()}
    peak_hour = sorted(counts_per_hour,
                       key=lambda h: (-counts_per_hour[h], -energy_per_hour.get(h, 0.0), h))[0]
    hour_rows = [i for i in dated.index if int(df.at[i, "hour"]) == peak_hour]

    seen = set()
    redundant = []
    for i in hour_rows:
        label = labels[i]
        if label is not None:
            if label in seen:
                redundant.append(i)
            seen.add(label)
        if bool(df.at[i, "regenerated"]) and i not in redundant:
            redundant.append(i)
    redundant = sorted(set(redundant))

    low, high = _round_pair(*_sum_energy(df, redundant))
    hour_high = energy_per_hour.get(peak_hour, 0.0)
    total_high = sum(float(v) for v in df["energy_high"])
    share = int(round(100 * hour_high / total_high)) if total_high > 0 else 0
    counts = {
        "peak_hour": peak_hour,
        "peak_hour_exchanges": len(hour_rows),
        "redundant_in_peak_hour": len(redundant),
        "peak_hour_energy_share_pct": share,
        "total_exchanges": total,
    }

    if not redundant:
        return _cand(pattern, pattern,
                     f"Your busiest hour is {peak_hour:02d}:00 with {len(hour_rows)} of {total} "
                     f"ask(s) ({share}% of energy) and no repeated ask inside it",
                     counts, [], 0.0, 0.0,
                     "Nothing to fix: no hour of your day concentrates repeat or re-rolled asks.")

    title = (f"Your {peak_hour:02d}:00 hour holds {share}% of your energy ({len(hour_rows)} of "
             f"{total} asks) and {len(redundant)} repeat or re-roll ask(s) in it cost "
             f"{_num(low)}-{_num(high)} Wh")
    how_to_fix = (f"Batch those {len(redundant)} repeat or re-roll ask(s) in your {peak_hour:02d}:00 "
                  f"hour into one prompt that states every constraint up front.")
    return _cand(pattern, pattern, title, counts, _examples(df, redundant), low, high,
                 how_to_fix, redundant)


def detect_model_mix(df):
    """Fallback source of waste: heavy models used where a lighter one present in the data would do."""
    pattern = "other"
    text = df[df["kind"] == "text"] if len(df) else df
    if len(text) == 0:
        return _cand("model_mix", pattern,
                     f"No text exchanges in {len(df)} exchange(s), so no model mix to compare",
                     {"heavy_model_exchanges": 0, "text_exchanges": 0, "total_exchanges": len(df)},
                     [], 0.0, 0.0, "Nothing to fix: model choice only shows up on text asks.")

    order = {"small": 0, "medium": 1, "large": 2}
    classes = {str(text.at[i, "model"]): order.get(footprint.model_class(text.at[i, "model"]), 1)
               for i in text.index}
    lightest = min(classes.values())
    light_names = [name for name, rank in classes.items() if rank == lightest]
    usage = {name: sum(1 for i in text.index if str(text.at[i, "model"]) == name) for name in light_names}
    light_model = sorted(light_names, key=lambda name: (-usage[name], name))[0]

    heavy = [i for i in text.index if classes[str(text.at[i, "model"])] > lightest]
    low = high = 0.0
    heavy_high = 0.0
    for i in heavy:
        tokens = float(text.at[i, "output_tokens"])
        model = str(text.at[i, "model"])
        saved = footprint.compare_models(model, light_model, tokens)
        low += float(text.at[i, "energy_low"]) * saved[0] / 100.0
        high += float(text.at[i, "energy_high"]) * saved[1] / 100.0
        heavy_high += float(text.at[i, "energy_high"])
    low, high = _round_pair(low, high)

    heavy_names = sorted({str(text.at[i, "model"]) for i in heavy})
    counts = {
        "heavy_model_exchanges": len(heavy),
        "text_exchanges": len(text),
        f"exchanges_on_{light_model}": int(usage[light_model]),
        "total_exchanges": len(df),
    }
    for name in heavy_names[:2]:
        counts[f"exchanges_on_{name}"] = sum(1 for i in heavy if str(text.at[i, "model"]) == name)

    if not heavy or high <= 0:
        return _cand("model_mix", pattern,
                     f"All {len(text)} text ask(s) already run on {light_model}, the lightest model in "
                     f"your history",
                     counts, [], 0.0, 0.0,
                     "Nothing to fix: you are not paying for a bigger model than your questions need.")
    saved_pct = int(round(100 * high / heavy_high)) if heavy_high > 0 else 0
    title = (f"{len(heavy)} text ask(s) on {', '.join(heavy_names[:2])} would cost "
             f"{_num(low)}-{_num(high)} Wh less on {light_model} ({saved_pct}% of their energy)")
    how_to_fix = (f"Send short asks like those {len(heavy)} to {light_model} instead of "
                  f"{', '.join(heavy_names[:2])}; your history shows it keeps the same answers at "
                  f"{saved_pct}% less energy.")
    return _cand("model_mix", pattern, title, counts, _examples(df, heavy), low, high, how_to_fix, heavy)


# --- assembly ----------------------------------------------------------------
def build_insights(df):
    """Pick the three tips with the largest estimated savings, then the report around them."""
    labels = question_groups(df)
    detectors = [
        detect_repeated_questions(df, labels),
        detect_regenerate_loops(df, labels),
        detect_long_output_short_ask(df),
        detect_media_spike(df),
        detect_time_of_day(df, labels),
    ]
    fallbacks = [detect_model_mix(df)]

    fired = sorted([c for c in detectors if c["fired"]], key=_rank)
    picked = []
    covered = set()
    for candidate in fired:
        if candidate["rows"] and candidate["rows"] <= covered:
            continue  # the same exchanges already carry an earlier tip
        picked.append(candidate)
        covered |= set(candidate["rows"])

    filler_pool = sorted(
        [c for c in fallbacks if c["fired"]]
        + [c for c in fired if c not in picked]
        + [c for c in detectors if not c["fired"]]
        + [c for c in fallbacks if not c["fired"]],
        key=_rank,
    )
    chosen_ids = {c["id"] for c in picked}
    for candidate in filler_pool:
        if len(picked) >= MAX_TIPS:
            break
        if candidate["id"] in chosen_ids:
            continue
        picked.append(candidate)
        chosen_ids.add(candidate["id"])

    tips = [_tip_json(c) for c in sorted(picked[:MAX_TIPS], key=_rank)]

    total_low = float(df["energy_low"].sum()) if len(df) else 0.0
    total_high = float(df["energy_high"].sum()) if len(df) else 0.0
    stamps = [df.at[i, "dt"] for i in df.index if df.at[i, "dt"] is not None]
    if stamps:
        start = min(stamps, key=_epoch).isoformat()
        end = max(stamps, key=_epoch).isoformat()
    else:
        start = end = EPOCH

    return {
        "generated_at": end,
        "period": {"start": start, "end": end},
        "totals": {
            "exchanges": int(len(df)),
            "energy_wh": _range(total_low, total_high),
            "water_ml": _range(footprint.water_ml(total_low), footprint.water_ml(total_high)),
            "co2_g": _range(footprint.co2_g(total_low), footprint.co2_g(total_high)),
        },
        "tips": tips,
    }


def _tip_json(candidate):
    return {
        "id": candidate["id"],
        "title": candidate["title"],
        "pattern": candidate["pattern"],
        "evidence": {
            "counts": {key: int(value) for key, value in candidate["counts"].items()},
            "examples": list(candidate["examples"])[:3],
        },
        "estimated_savings": {"energy_wh": _range(candidate["low"], candidate["high"])},
        "how_to_fix": candidate["how_to_fix"],
    }


def run(prompts_path=PROMPTS_PATH, insights_path=INSIGHTS_PATH):
    df = load_exchanges(prompts_path)
    insights = build_insights(df)
    insights_path = Path(insights_path)
    insights_path.write_text(
        json.dumps(insights, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return insights


def main():
    insights = run()
    totals = insights["totals"]
    print(
        f"{totals['exchanges']} exchanges {insights['period']['start']}..{insights['period']['end']}, "
        f"{_num(totals['energy_wh']['low'])}-{_num(totals['energy_wh']['high'])} Wh, "
        f"{_num(totals['water_ml']['low'])}-{_num(totals['water_ml']['high'])} mL water, "
        f"{_num(totals['co2_g']['low'])}-{_num(totals['co2_g']['high'])} g CO2e"
    )
    for tip in insights["tips"]:
        savings = tip["estimated_savings"]["energy_wh"]
        print(f"  [{tip['pattern']}] {tip['title']} ({_num(savings['low'])}-{_num(savings['high'])} Wh)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
