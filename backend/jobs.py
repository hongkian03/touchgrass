"""F6: job records in SQLite (backend/jobs.sqlite locally, or configured data directory).

jobs: job_id, type (ingest, repair), site (repairs only), status (queued, running, succeeded,
failed), created_at, finished_at, summary (JSON: counts, timings, credits, never chat text), error.
"""

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from backend.paths import JOB_DB_PATH

DB_PATH = JOB_DB_PATH
DONE = ("succeeded", "failed")


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class JobStore:
    def __init__(self, path=DB_PATH):
        # Only the event loop's thread touches the connection.
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("""CREATE TABLE IF NOT EXISTS jobs (
            job_id TEXT PRIMARY KEY, type TEXT NOT NULL, site TEXT, status TEXT NOT NULL,
            created_at TEXT NOT NULL, finished_at TEXT, summary TEXT, error TEXT)""")
        self.db.commit()

    def create(self, job_type, site=None):
        job_id = uuid.uuid4().hex[:12]
        self.db.execute("INSERT INTO jobs (job_id, type, site, status, created_at) VALUES (?, ?, ?, 'queued', ?)",
                        (job_id, job_type, site, _now()))
        self.db.commit()
        return job_id

    def set_status(self, job_id, status, summary=None, error=None):
        finished = _now() if status in DONE else None
        self.db.execute("UPDATE jobs SET status = ?, finished_at = COALESCE(?, finished_at), "
                        "summary = COALESCE(?, summary), error = COALESCE(?, error) WHERE job_id = ?",
                        (status, finished, json.dumps(summary) if summary is not None else None, error, job_id))
        self.db.commit()

    def get(self, job_id):
        row = self.db.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        if row is None:
            return None
        job = dict(row)
        job["summary"] = json.loads(job["summary"]) if job["summary"] else None
        return job

    def active_repair(self, site):
        row = self.db.execute("SELECT job_id FROM jobs WHERE type = 'repair' AND site = ? AND status IN "
                              "('queued', 'running') ORDER BY created_at DESC LIMIT 1", (site,)).fetchone()
        return row["job_id"] if row else None

    def latest_succeeded(self, job_type):
        row = self.db.execute("SELECT job_id FROM jobs WHERE type = ? AND status = 'succeeded' "
                              "ORDER BY finished_at DESC LIMIT 1", (job_type,)).fetchone()
        return row["job_id"] if row else None
