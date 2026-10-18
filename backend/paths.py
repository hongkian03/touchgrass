"""Runtime storage locations. Leave PROMPTPRINT_DATA_DIR unset for local defaults."""

import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def storage_path(variable: str, relative: str, local_default: Path) -> Path:
    if value := os.environ.get(variable):
        return Path(value).expanduser().resolve()
    if root := os.environ.get("PROMPTPRINT_DATA_DIR"):
        return (Path(root).expanduser() / relative).resolve()
    return local_default


JOB_DB_PATH = storage_path("JOB_DATABASE_PATH", "jobs.sqlite", REPO / "backend" / "jobs.sqlite")
JOB_ROOT = storage_path("JOB_ROOT", "work/jobs", REPO / "work" / "jobs")
VIEW_ROOT = storage_path("DROID_VIEW_ROOT", "droid_view/jobs", REPO / "droid_view" / "jobs")
PARSER_CACHE = storage_path("PARSER_CACHE", "parser_cache", REPO / "parser_cache")
ADAPTERS_DIR = storage_path("ADAPTERS_DIR", "adapters", REPO / "backend" / "adapters")


def coaching_database_url() -> str:
    if root := os.environ.get("PROMPTPRINT_DATA_DIR"):
        return "sqlite:///" + str((Path(root).expanduser() / "coaching.db").resolve())
    return "sqlite:///artifacts/coaching.db"


def seed_adapters() -> None:
    """Install packaged adapters into an empty volume without overwriting repairs."""
    source = REPO / "backend" / "adapters"
    if ADAPTERS_DIR.resolve() == source.resolve():
        return
    ADAPTERS_DIR.mkdir(parents=True, exist_ok=True)
    for path in source.glob("*.json"):
        try:
            with (ADAPTERS_DIR / path.name).open("xb") as destination:
                destination.write(path.read_bytes())
        except FileExistsError:
            pass
