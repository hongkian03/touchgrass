"""Create a five-minute, one-use pairing code on the backend machine."""

import argparse

from backend.coaching.config import Settings
from backend.coaching.repository import Repository


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    settings = Settings.from_env()
    repo = Repository(settings.db_path, "pairing-only", settings.retention_days)
    try:
        print(repo.issue_pairing())
    finally:
        repo.close()


if __name__ == "__main__":
    main()
