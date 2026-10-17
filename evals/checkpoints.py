"""Private durable stages and conservative per-attempt budget reservations."""

import asyncio
import json
import sqlite3
from pathlib import Path

from backend.integrations.chalk_gateway import GatewayError


class BudgetExceeded(Exception):
    pass


class Checkpoints:
    def __init__(self, path, max_calls=100, max_input_tokens=100000, max_cost_usd=None):
        if max_calls < 1 or max_input_tokens < 1:
            raise ValueError("call and input caps must be positive")
        if max_cost_usd is not None:
            raise ValueError(
                "dollar caps require verified pricing; no price table is configured"
            )
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS stages(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY, key TEXT, input_reservation INTEGER, error TEXT);
        """)
        self.max_calls, self.max_input_tokens = max_calls, max_input_tokens

    def close(self):
        self.db.close()

    def get(self, key):
        row = self.db.execute("SELECT value FROM stages WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else None

    def save(self, key, value):
        with self.db:
            self.db.execute(
                "INSERT OR REPLACE INTO stages VALUES (?,?)",
                (key, json.dumps(value, allow_nan=False)),
            )

    def reserve(self, key, payload):
        # UTF-8 byte count + envelope reserve is deliberately conservative, not a token measurement.
        reservation = len(json.dumps(payload, ensure_ascii=False).encode()) + 1024
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            count, total = self.db.execute(
                "SELECT count(*),coalesce(sum(input_reservation),0) FROM attempts"
            ).fetchone()
            if count >= self.max_calls or total + reservation > self.max_input_tokens:
                raise BudgetExceeded("call_or_input_reservation_cap")
            cur = self.db.execute(
                "INSERT INTO attempts(key,input_reservation) VALUES (?,?)",
                (key, reservation),
            )
            return cur.lastrowid

    async def call(self, key, payload, operation, retries=0):
        cached = self.get(key)
        if cached is not None:
            return cached
        for attempt in range(retries + 1):
            attempt_id = self.reserve(key, payload)
            try:
                value = await operation()
            except GatewayError as exc:
                with self.db:
                    self.db.execute(
                        "UPDATE attempts SET error=? WHERE id=?",
                        (exc.category, attempt_id),
                    )
                if (
                    (exc.retry_after is not None and exc.retry_after > 60)
                    or attempt >= retries
                    or exc.category
                    not in (
                        "provider_rate_limit",
                        "provider_unavailable",
                        "connection_error",
                        "timeout",
                    )
                ):
                    raise
                await asyncio.sleep(exc.retry_after or min(2**attempt, 30))
            else:
                self.save(key, value)
                return value
