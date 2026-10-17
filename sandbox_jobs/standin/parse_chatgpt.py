"""Stand-in for Droid Job 1: parse a ChatGPT conversations.json into prompts.jsonl.

Hand-written so the sandbox flow can be tested while droid is unreachable from Daytona.
Each assistant branch under a user message is one exchange; branches after the first are
regenerations. An image tool call anywhere in the branch makes the exchange kind "image".

Usage: python parse_chatgpt.py EXPORT OUT_JSONL
"""

import json
import sys
from datetime import datetime, timezone


def text_parts(message):
    content = message.get("content") or {}
    if content.get("content_type") != "text":
        return ""
    return "\n".join(p for p in content.get("parts", []) if isinstance(p, str)).strip()


def has_image(message):
    content = message.get("content") or {}
    return any(
        isinstance(p, dict) and p.get("content_type") == "image_asset_pointer"
        for p in content.get("parts", [])
    )


def follow_branch(mapping, node_id):
    """Walk an assistant/tool chain until the turn ends. Returns (response_text, model, is_image)."""
    texts, model, image = [], None, False
    while node_id:
        node = mapping[node_id]
        msg = node.get("message") or {}
        role = (msg.get("author") or {}).get("role")
        if role == "user":
            break
        image |= has_image(msg)
        if role == "assistant":
            model = (msg.get("metadata") or {}).get("model_slug") or model
            if msg.get("recipient", "all") == "all" and text_parts(msg):
                texts.append(text_parts(msg))
            if msg.get("end_turn"):
                break
        children = node.get("children") or []
        node_id = children[0] if children else None
    return "\n".join(texts), model, image


def exchanges(conversation):
    mapping = conversation["mapping"]
    for node in mapping.values():
        msg = node.get("message") or {}
        if (msg.get("author") or {}).get("role") != "user":
            continue
        ts = datetime.fromtimestamp(msg["create_time"], tz=timezone.utc).isoformat(timespec="seconds")
        for i, child in enumerate(node.get("children") or []):
            response, model, image = follow_branch(mapping, child)
            yield {
                "ts": ts,
                "provider": "chatgpt",
                "model": model,
                "kind": "image" if image else "text",
                "prompt_text": text_parts(msg),
                "response_text": response,
                "regenerated": i > 0,
            }


def main(export_path, out_path):
    with open(export_path, encoding="utf-8") as f:
        conversations = json.load(f)
    rows = sorted((e for c in conversations for e in exchanges(c)), key=lambda e: e["ts"])
    with open(out_path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return len(conversations), len(rows)


if __name__ == "__main__":
    convs, rows = main(sys.argv[1], sys.argv[2])
    print(f"conversations: {convs}, exchanges: {rows}")
