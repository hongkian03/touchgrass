#!/usr/bin/env python
"""Ingest an AI chat export into prompts.jsonl: one JSON object per exchange.

Usage: py parser.py [input_dir] [output_path]
Defaults: ../input and ../output/prompts.jsonl, both relative to this file.

The export is found by listing the input directory (it holds exactly one file).
This parser never depends on the content of text fields: only on structure and on
kept token fields (author roles, content types, recipients, model slugs, IDs and
timestamps).

Exchange = one user prompt plus the assistant reply that answers it. Branching
(regenerated answers are sibling branches under the same user message) is followed
in full: the first branch is regenerated=false, every later branch is
regenerated=true. An exchange whose reply generated an image has kind "image".
"""

import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_INPUT_DIR = HERE.parent / "input"
DEFAULT_OUTPUT_PATH = HERE.parent / "output" / "prompts.jsonl"

FIELD_ORDER = ("ts", "provider", "model", "kind", "prompt_text", "response_text", "regenerated")

CHATGPT_FORMAT = "chatgpt"
CLAUDE_FORMAT = "claude"
GENERIC_FORMAT = "generic"

IMAGE_HINTS = ("image", "dall", "text2im", "img")
VIDEO_HINTS = ("video", "sora", "veo")
_MEDIA_RANK = {None: 0, "image": 1, "video": 2}

PROVIDER_BY_MODEL_PREFIX = (
    ("gpt", CHATGPT_FORMAT),
    ("chatgpt", CHATGPT_FORMAT),
    ("o1", CHATGPT_FORMAT),
    ("o3", CHATGPT_FORMAT),
    ("o4", CHATGPT_FORMAT),
    ("dall", CHATGPT_FORMAT),
    ("claude", CLAUDE_FORMAT),
    ("gemini", "gemini"),
    ("gemma", "gemini"),
    ("grok", "grok"),
    ("llama", "meta"),
    ("mistral", "mistral"),
    ("mixtral", "mistral"),
)


# --------------------------------------------------------------------------- #
# small helpers
# --------------------------------------------------------------------------- #
def text_of(value):
    """Normalize a text-ish value to str (never used for matching, only output)."""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(text_of(v) for v in value)
    return ""


def to_iso(value):
    """Epoch seconds or ISO string -> ISO 8601 string, or None."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc).isoformat()
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(value, str) and value.strip():
        raw = value.strip()
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).isoformat()
        except ValueError:
            return None
    return None


def media_from_token(value):
    """Map a token (content type, recipient, mime type, name) to image/video/None."""
    if not isinstance(value, str) or not value:
        return None
    low = value.lower()
    if any(h in low for h in VIDEO_HINTS):
        return "video"
    if any(h in low for h in IMAGE_HINTS):
        return "image"
    return None


def pick_media(current, found):
    if _MEDIA_RANK.get(found, 0) > _MEDIA_RANK.get(current, 0):
        return found
    return current


def infer_provider_from_model(model):
    if not isinstance(model, str) or not model:
        return None
    low = model.lower()
    for prefix, provider in PROVIDER_BY_MODEL_PREFIX:
        if low.startswith(prefix):
            return provider
    return None


def author_role(msg):
    """Role of a message, lowercased; supports ChatGPT author.role and role/sender."""
    if not isinstance(msg, dict):
        return ""
    author = msg.get("author")
    if isinstance(author, dict):
        role = author.get("role")
        if isinstance(role, str) and role:
            return role.strip().lower()
    for key in ("role", "sender", "from", "author"):
        role = msg.get(key)
        if isinstance(role, str) and role:
            role = role.strip().lower()
            return "user" if role in ("human", "prompt") else role
    return ""


def author_name(msg):
    if not isinstance(msg, dict):
        return None
    author = msg.get("author")
    if isinstance(author, dict) and isinstance(author.get("name"), str):
        return author["name"]
    name = msg.get("name")
    return name if isinstance(name, str) else None


def is_hidden(msg):
    """True for messages the UI hides (system scaffolding, tool plumbing)."""
    if not isinstance(msg, dict):
        return False
    md = msg.get("metadata")
    if isinstance(md, dict) and md.get("is_visually_hidden_from_conversation"):
        return True
    if msg.get("is_hidden") or msg.get("hidden"):
        return True
    return False


def msg_model(msg):
    if not isinstance(msg, dict):
        return None
    for key in ("model_slug", "model", "default_model_slug"):
        value = msg.get(key)
        if isinstance(value, str) and value:
            return value
    md = msg.get("metadata")
    if isinstance(md, dict):
        for key in ("model_slug", "model", "default_model_slug", "resolved_model_slug"):
            value = md.get(key)
            if isinstance(value, str) and value:
                return value
    return None


# --------------------------------------------------------------------------- #
# content extraction (ChatGPT-style content objects and Claude-style blocks)
# --------------------------------------------------------------------------- #
def media_from_dict_part(part):
    """image/video/None for a non-text content part (e.g. an asset pointer)."""
    found = media_from_token(part.get("content_type"))
    found = pick_media(found, media_from_token(part.get("type")))
    for key in ("mime_type", "mime", "asset_pointer", "file_mime_type"):
        found = pick_media(found, media_from_token(part.get(key)))
    md = part.get("metadata")
    if isinstance(md, dict):
        for key in ("mime_type", "mime", "asset_type", "type", "content_type"):
            found = pick_media(found, media_from_token(md.get(key)))
    return found


def parse_content(content):
    """Return (text, media) for a message content object.

    Handles ChatGPT content dicts (parts list, content_type code/text/multimodal_text)
    and Claude content (string, or list of blocks with a "type").
    """
    if isinstance(content, str):
        return content, None
    if isinstance(content, list):
        return parse_blocks(content)
    if not isinstance(content, dict):
        return "", None

    media = media_from_token(content.get("content_type"))
    pieces = []
    parts = content.get("parts")
    if isinstance(parts, list):
        for part in parts:
            if isinstance(part, str):
                if part:
                    pieces.append(part)
            elif isinstance(part, dict):
                media = pick_media(media, media_from_dict_part(part))
                nested = part.get("text")
                if isinstance(nested, str) and nested:
                    pieces.append(nested)
    elif isinstance(parts, str):
        pieces.append(parts)
    if not pieces:
        # e.g. content_type "code", which keeps its text in a "text" field
        for key in ("text", "content", "value"):
            value = content.get(key)
            if isinstance(value, str) and value:
                pieces.append(value)
            elif isinstance(value, list):
                text, nested_media = parse_blocks(value)
                media = pick_media(media, nested_media)
                if text:
                    pieces.append(text)
    return "\n".join(p for p in pieces if p), media


def parse_blocks(blocks):
    """Claude/generic content blocks: keep text blocks, notice media blocks."""
    pieces = []
    media = None
    for block in blocks:
        if isinstance(block, str):
            if block:
                pieces.append(block)
            continue
        if not isinstance(block, dict):
            continue
        btype = block.get("type") or block.get("content_type")
        found = media_from_token(btype)
        if found is None:
            found = media_from_dict_part(block)
        if found and not isinstance(block.get("text"), str):
            media = pick_media(media, found)
            continue
        text = block.get("text")
        if isinstance(text, str) and text:
            pieces.append(text)
            media = pick_media(media, media_from_token(block.get("type")))
        elif found:
            media = pick_media(media, found)
        nested = block.get("content")
        if isinstance(nested, list):
            inner, inner_media = parse_blocks(nested)
            media = pick_media(media, inner_media)
            if inner and isinstance(block.get("text"), type(None)):
                pieces.append(inner)
    return "\n".join(p for p in pieces if p), media


def media_from_message(msg, content_media=None):
    """Media signal carried by the message envelope (recipient / tool name)."""
    media = content_media
    media = pick_media(media, media_from_token(msg.get("recipient")))
    media = pick_media(media, media_from_token(msg.get("recipient_name")))
    media = pick_media(media, media_from_token(author_name(msg)))
    md = msg.get("metadata")
    if isinstance(md, dict):
        for key in ("model_slug", "tool_name", "plugin_id", "recipient"):
            media = pick_media(media, media_from_token(md.get(key)))
    return media


# --------------------------------------------------------------------------- #
# ChatGPT-style export: conversations with a message tree in "mapping"
# --------------------------------------------------------------------------- #
def message_nodes(mapping):
    return {nid: node for nid, node in mapping.items() if isinstance(node, dict)}


def ordered_nodes(nodes):
    """Depth-first document order over the message tree, roots first."""
    roots = [
        node
        for node in nodes.values()
        if not isinstance(node.get("parent"), str) or node.get("parent") not in nodes
    ]
    ordered = []
    visited = set()
    stack = list(reversed(roots))
    while stack:
        node = stack.pop()
        nid = node.get("id")
        if nid in visited:
            continue
        visited.add(nid)
        ordered.append(node)
        children = [nodes[c] for c in (node.get("children") or []) if c in nodes and c not in visited]
        stack.extend(reversed(children))
    return ordered


def is_user_prompt(msg):
    return (
        isinstance(msg, dict)
        and author_role(msg) == "user"
        and not is_hidden(msg)
        and msg.get("content") is not None
    )


def branch_sequences(nodes, start_id, limit=64):
    """Every reply path starting at start_id and ending at the next user prompt."""
    sequences = []

    def walk(nid, acc, seen, depth):
        if depth > limit:
            sequences.append(acc)
            return
        node = nodes.get(nid)
        if node is None:
            sequences.append(acc)
            return
        msg = node.get("message")
        if msg is not None:
            if is_user_prompt(msg):
                # the next prompt: this is where this reply path ends
                if acc:
                    sequences.append(acc)
                return
            acc = acc + [node]
        children = [c for c in (node.get("children") or []) if c in nodes and c not in seen]
        if not children:
            sequences.append(acc)
            return
        for child in children:
            walk(child, acc, seen | {child}, depth + 1)

    walk(start_id, [], {start_id}, 0)
    return sequences


def first_time(seq, fallback=None):
    for node in seq:
        msg = node.get("message")
        if isinstance(msg, dict):
            value = to_iso(msg.get("create_time"))
            if value:
                try:
                    return datetime.fromisoformat(value).timestamp()
                except ValueError:
                    pass
    return fallback


def reply_from_sequence(seq, conv):
    """(response_text, media, model, has_reply) for one reply path."""
    visible = []
    internal = []
    media = None
    model = None
    has_reply = False

    for node in seq:
        msg = node.get("message")
        if not isinstance(msg, dict):
            continue
        role = author_role(msg)
        if role == "system" or is_hidden(msg):
            continue
        text, content_media = parse_content(msg.get("content"))
        media = pick_media(media, media_from_message(msg, content_media))
        if role == "assistant":
            has_reply = True
            found_model = msg_model(msg)
            if found_model:
                model = found_model
            if text:
                if msg.get("recipient", "all") in ("all", None, ""):
                    visible.append(text)
                else:
                    internal.append(text)
        elif role == "tool":
            has_reply = True
            if text:
                internal.append(text)
            found_model = msg_model(msg)
            if found_model and not model:
                model = found_model

    response = "\n\n".join(p for p in visible if p)
    if not response:
        response = "\n\n".join(p for p in internal if p)
    if not model and isinstance(conv, dict):
        fallback = conv.get("default_model_slug") or conv.get("model")
        model = fallback if isinstance(fallback, str) and fallback else None
    return response, media, model, has_reply


def chatgpt_records(conv, provider):
    """All exchanges in one ChatGPT conversation, following every branch."""
    records = []
    mapping = conv.get("mapping")
    if not isinstance(mapping, dict):
        return records
    nodes = message_nodes(mapping)
    conv_ts = to_iso(conv.get("create_time")) or to_iso(conv.get("update_time"))

    for node in ordered_nodes(nodes):
        msg = node.get("message")
        if not is_user_prompt(msg):
            continue
        ts = to_iso(msg.get("create_time")) or conv_ts
        prompt_text, _ = parse_content(msg.get("content"))
        if not ts:
            continue

        branches = []
        for child_id in node.get("children") or []:
            if child_id in nodes:
                branches.extend(branch_sequences(nodes, child_id))
        # order branches by when they were produced: first one is the original
        indexed = sorted(
            enumerate(branches),
            key=lambda item: (first_time(item[1]) is None, first_time(item[1]) or 0.0, item[0]),
        )

        for position, (_, seq) in enumerate(indexed):
            response, media, model, has_reply = reply_from_sequence(seq, conv)
            if not has_reply:
                continue
            records.append(
                make_record(
                    ts=ts,
                    provider=provider,
                    model=model,
                    media=media,
                    prompt_text=prompt_text,
                    response_text=response,
                    regenerated=position > 0,
                )
            )
    return records


# --------------------------------------------------------------------------- #
# linear exports (Claude "chat_messages", or a flat "messages" list)
# --------------------------------------------------------------------------- #
def linear_messages(conv):
    for key in ("chat_messages", "messages", "conversation", "turns"):
        value = conv.get(key)
        if isinstance(value, list):
            return value
    return []


def linear_ts(msg, conv):
    for key in ("created_at", "create_time", "timestamp", "updated_at", "update_time", "time"):
        value = to_iso(msg.get(key))
        if value:
            return value
    for key in ("created_at", "create_time", "timestamp", "updated_at", "update_time", "time"):
        value = to_iso(conv.get(key))
        if value:
            return value
    return None


def linear_records(conv, provider):
    """Exchanges in a flat message list: each reply to a prompt, branches included."""
    records = []
    prompt_msg = None
    reply_index = 0
    for msg in linear_messages(conv):
        if not isinstance(msg, dict):
            continue
        role = author_role(msg)
        if role == "system":
            continue
        hidden = is_hidden(msg)
        if role == "user":
            if hidden:
                continue
            prompt_msg = msg
            reply_index = 0
            continue
        if role not in ("assistant", "tool", "model", "bot"):
            continue
        if prompt_msg is None or hidden:
            continue
        text, content_media = parse_content(
            msg.get("content") if msg.get("content") is not None else msg.get("text")
        )
        if not text and isinstance(msg.get("text"), str):
            text = msg["text"]
        media = media_from_message(msg, content_media)
        ts = linear_ts(prompt_msg, conv)
        if not ts:
            continue
        records.append(
            make_record(
                ts=ts,
                provider=provider,
                model=msg_model(msg) or (conv.get("model") if isinstance(conv.get("model"), str) else None),
                media=media,
                prompt_text=parse_content(prompt_msg.get("content"))[0]
                or text_of(prompt_msg.get("text")),
                response_text=text,
                regenerated=reply_index > 0,
            )
        )
        reply_index += 1
    return records


# --------------------------------------------------------------------------- #
# export loading and format detection
# --------------------------------------------------------------------------- #
def load_export(path):
    raw = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix.lower() == ".jsonl":
        items = []
        for line in raw.splitlines():
            if line.strip():
                items.append(json.loads(line))
        return items
    return json.loads(raw)


def as_conversations(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("conversations", "chats", "threads", "data", "items"):
            value = data.get(key)
            if isinstance(value, list):
                return value
        return [data]
    return []


def detect_format(data):
    """'chatgpt' (mapping trees), 'claude' (chat_messages), 'generic', 'unknown'."""
    for conv in as_conversations(data):
        if not isinstance(conv, dict):
            continue
        if isinstance(conv.get("mapping"), dict):
            return CHATGPT_FORMAT
        if isinstance(conv.get("chat_messages"), list):
            return CLAUDE_FORMAT
    for conv in as_conversations(data):
        if isinstance(conv, dict) and isinstance(conv.get("messages"), list):
            return GENERIC_FORMAT
    if isinstance(data, dict) and isinstance(data.get("mapping"), dict):
        return CHATGPT_FORMAT
    return "unknown"


def provider_for(conv, fmt, models):
    """Provider: stated in the export, else inferred from model names, else format."""
    if isinstance(conv, dict):
        for key in ("provider", "platform", "service", "source"):
            value = conv.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip().lower()
    for model in models:
        inferred = infer_provider_from_model(model)
        if inferred:
            return inferred
    if fmt in (CHATGPT_FORMAT, CLAUDE_FORMAT):
        return fmt
    return "unknown"


def conversation_records(conv, fmt):
    if fmt == CHATGPT_FORMAT and not isinstance(conv.get("mapping"), dict):
        fmt = CLAUDE_FORMAT if isinstance(conv.get("chat_messages"), list) else GENERIC_FORMAT
    if fmt == CHATGPT_FORMAT:
        models = [
            msg_model(node.get("message"))
            for node in message_nodes(conv.get("mapping") or {}).values()
            if isinstance(node.get("message"), dict)
        ]
        provider = provider_for(conv, fmt, [m for m in models if m])
        return chatgpt_records(conv, provider)
    models = [msg_model(msg) for msg in linear_messages(conv) if isinstance(msg, dict)]
    provider = provider_for(conv, fmt, [m for m in models if m])
    return linear_records(conv, provider)


def parse_export(data):
    """Return (records, detected_format)."""
    fmt = detect_format(data)
    records = []
    for conv in as_conversations(data):
        if not isinstance(conv, dict):
            continue
        records.extend(conversation_records(conv, fmt))
    return records, fmt


def make_record(ts, provider, model, media, prompt_text, response_text, regenerated):
    kind = media if media in ("image", "video") else "text"
    return {
        "ts": ts,
        "provider": provider or "unknown",
        "model": model if isinstance(model, str) and model else None,
        "kind": kind,
        "prompt_text": text_of(prompt_text),
        "response_text": text_of(response_text),
        "regenerated": bool(regenerated),
    }


# --------------------------------------------------------------------------- #
# IO
# --------------------------------------------------------------------------- #
def find_export(input_dir=DEFAULT_INPUT_DIR):
    """The export: the single file in input_dir (JSON, JSONL or plain text)."""
    directory = Path(input_dir)
    if not directory.is_dir():
        raise SystemExit(f"input directory not found: {directory}")
    files = sorted((p for p in directory.iterdir() if p.is_file()), key=lambda p: p.name)
    if not files:
        raise SystemExit(f"no export file in {directory}")
    preferred = [p for p in files if p.suffix.lower() in (".json", ".jsonl", ".txt")]
    return (preferred or files)[0]


def write_records(records, out_path=DEFAULT_OUTPUT_PATH):
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps({k: record[k] for k in FIELD_ORDER}, ensure_ascii=False) + "\n")
    return out_path


def summarize(records, fmt, path, out_path):
    models = Counter(record["model"] or "(unknown)" for record in records)
    print(f"input: {path}")
    print(f"output: {out_path}")
    print(f"detected format: {fmt}")
    print(f"exchanges: {len(records)}")
    print("exchanges per model:")
    for model, count in models.most_common():
        print(f"  {model}: {count}")
    print(f"regenerated: {sum(1 for r in records if r['regenerated'])}")
    print(f"images: {sum(1 for r in records if r['kind'] == 'image')}")
    print(f"videos: {sum(1 for r in records if r['kind'] == 'video')}")


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    input_dir = Path(argv[0]) if len(argv) > 0 else DEFAULT_INPUT_DIR
    out_path = Path(argv[1]) if len(argv) > 1 else DEFAULT_OUTPUT_PATH
    path = find_export(input_dir)
    records, fmt = parse_export(load_export(path))
    write_records(records, out_path)
    summarize(records, fmt, path, out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
