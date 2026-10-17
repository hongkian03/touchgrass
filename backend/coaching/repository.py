import hashlib
import hmac
import json
import secrets
import sqlite3
import time
from pathlib import Path
from uuid import uuid4


class Repository:
    def __init__(self, path, digest_key, retention_days=7):
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False, timeout=0.05)
        self.db.row_factory = sqlite3.Row
        self.digest_key = digest_key.encode()
        self.retention_seconds = retention_days * 86400
        self.db.executescript("""
            PRAGMA foreign_keys=ON;
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS pairing(code TEXT PRIMARY KEY, expires REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, owner TEXT UNIQUE NOT NULL, expires REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS coaching_decisions(
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, created REAL NOT NULL,
                input_length INTEGER NOT NULL, input_digest TEXT NOT NULL,
                metadata TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'ready');
            CREATE TABLE IF NOT EXISTS coaching_events(
                owner TEXT NOT NULL, id TEXT NOT NULL, decision_id TEXT NOT NULL REFERENCES coaching_decisions(id) ON DELETE CASCADE,
                created REAL NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,id));
            CREATE TABLE IF NOT EXISTS published_eval_reports(id TEXT PRIMARY KEY, created REAL NOT NULL, report TEXT NOT NULL);
        """)
        self.prune()

    def close(self):
        self.db.close()

    def prune(self):
        now = time.time()
        with self.db:
            self.db.execute(
                "DELETE FROM coaching_decisions WHERE created < ?",
                (now - self.retention_seconds,),
            )
            self.db.execute("DELETE FROM pairing WHERE expires < ?", (now,))
            self.db.execute("DELETE FROM sessions WHERE expires < ?", (now,))

    @staticmethod
    def token_hash(token):
        return hashlib.sha256(token.encode()).hexdigest()

    def issue_pairing(self):
        code = secrets.token_urlsafe(24)
        with self.db:
            self.db.execute(
                "INSERT INTO pairing VALUES (?,?)",
                (self.token_hash(code), time.time() + 300),
            )
        return code

    def pair(self, code):
        token, owner = secrets.token_urlsafe(32), str(uuid4())
        with self.db:
            deleted = self.db.execute(
                "DELETE FROM pairing WHERE code=? AND expires>?",
                (self.token_hash(code), time.time()),
            )
            if deleted.rowcount != 1:
                raise PermissionError("invalid_pairing")
            self.db.execute(
                "INSERT INTO sessions VALUES (?,?,?)",
                (self.token_hash(token), owner, time.time() + self.retention_seconds),
            )
        return token

    def owner(self, token):
        row = self.db.execute(
            "SELECT owner FROM sessions WHERE token=? AND expires>?",
            (self.token_hash(token), time.time()),
        ).fetchone()
        if not row:
            raise PermissionError("invalid_session")
        return row["owner"]

    def save_decision(self, owner, req, decision):
        # Neither raw prompt nor context enters the persisted JSON.
        digest = hmac.new(
            self.digest_key, (owner + req.model_dump_json()).encode(), hashlib.sha256
        ).hexdigest()
        self.prune()
        with self.db:
            self.db.execute(
                "INSERT INTO coaching_decisions(id,owner,created,input_length,input_digest,metadata) VALUES (?,?,?,?,?,?)",
                (
                    str(decision.response.decision_id),
                    owner,
                    time.time(),
                    len(req.prompt_text),
                    digest,
                    decision.model_dump_json(),
                ),
            )

    def event(self, owner, event):
        payload = event.model_dump_json()
        with self.db:
            # Serialize state checks and writes across workers.
            self.db.execute("BEGIN IMMEDIATE")
            previous = self.db.execute(
                "SELECT payload FROM coaching_events WHERE owner=? AND id=?",
                (owner, str(event.event_id)),
            ).fetchone()
            if previous:
                if previous["payload"] != payload:
                    raise ValueError("event_id_conflict")
                return "duplicate"
            row = self.db.execute(
                "SELECT * FROM coaching_decisions WHERE id=? AND owner=?",
                (str(event.decision_id), owner),
            ).fetchone()
            if row is None:
                raise PermissionError("decision_not_found")
            metadata = json.loads(row["metadata"])["response"]
            if event.draft_revision != metadata["draft_revision"]:
                raise ValueError("stale_revision")
            kind = event.event_type
            if time.time() > row["created"] + metadata[
                "ttl_ms"
            ] / 1000 and kind not in ("expired", "late_result"):
                raise ValueError("expired_decision")
            transitions = {
                "ready": {"shown", "late_result", "expired", "sent_anyway"},
                "shown": {
                    "dismissed",
                    "switch_clicked",
                    "sent_anyway",
                    "expired",
                    "late_result",
                },
                "switch_clicked": {
                    "switch_confirmed",
                    "sent_anyway",
                    "expired",
                    "late_result",
                },
                "switch_confirmed": {
                    "sent_with_target",
                    "sent_anyway",
                    "expired",
                    "late_result",
                },
            }
            if kind not in transitions.get(row["state"], set()):
                raise ValueError("invalid_event_transition")
            if kind in (
                "shown",
                "switch_clicked",
                "switch_confirmed",
                "sent_with_target",
            ):
                if metadata["action"] != "suggest_small":
                    raise ValueError("no_suggestion")
            if kind in ("switch_confirmed", "sent_with_target"):
                if (
                    event.source_label != metadata["current_model_label"]
                    or event.target_label != metadata["target"]["website_label"]
                ):
                    raise ValueError("model_mismatch")
            self.db.execute(
                "INSERT INTO coaching_events VALUES (?,?,?,?,?)",
                (
                    owner,
                    str(event.event_id),
                    str(event.decision_id),
                    time.time(),
                    payload,
                ),
            )
            self.db.execute(
                "UPDATE coaching_decisions SET state=? WHERE id=?",
                (kind, str(event.decision_id)),
            )
        return "recorded"

    def clear(self, owner):
        with self.db:
            self.db.execute("DELETE FROM coaching_decisions WHERE owner=?", (owner,))

    def publish(self, report):
        with self.db:
            self.db.execute(
                "INSERT INTO published_eval_reports VALUES (?,?,?)",
                (str(uuid4()), time.time(), report.model_dump_json()),
            )

    def summary(self):
        row = self.db.execute(
            "SELECT report FROM published_eval_reports ORDER BY created DESC LIMIT 1"
        ).fetchone()
        return json.loads(row["report"]) if row else {"status": "not_run"}
