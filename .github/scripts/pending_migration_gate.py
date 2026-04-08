#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sys
from collections.abc import Iterable
from pathlib import Path

from migration_safety_gate import GateError, evaluate_files

ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
TABLE_ROW_RE = re.compile(r"^\s*[│|]\s*([0-9]{4}_[^│|]+\.sql)\s*[│|]\s*$")
PLAIN_ROW_RE = re.compile(r"^\s*([0-9]{4}_[^\s]+\.sql)\s*$")


GRANDFATHERED_PENDING_MIGRATION_VIOLATIONS: dict[str, set[str]] = {
    "0003_domain_binding_source_soft_delete.sql": {"drop-index"},
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate remote pending D1 migrations against the forward-compatible auto-release contract."
    )
    parser.add_argument(
        "--migrations-dir",
        required=True,
        help="Directory containing migration SQL files referenced by Wrangler output",
    )
    parser.add_argument(
        "--wrangler-output-file",
        help="Path to a file containing `wrangler d1 migrations list` output. Reads stdin when omitted.",
    )
    return parser.parse_args()


def strip_ansi(text: str) -> str:
    return ANSI_ESCAPE_RE.sub("", text)


def unique(sequence: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in sequence:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def parse_pending_migration_names(raw_output: str) -> list[str]:
    cleaned = strip_ansi(raw_output)
    saw_header = False
    migration_names: list[str] = []

    for line in cleaned.splitlines():
        if "Migrations to be applied:" in line:
            saw_header = True
            continue

        table_match = TABLE_ROW_RE.match(line)
        if table_match:
            migration_names.append(table_match.group(1).strip())
            continue

        plain_match = PLAIN_ROW_RE.match(line)
        if plain_match:
            migration_names.append(plain_match.group(1).strip())

    if migration_names:
        return unique(migration_names)

    if "No migrations to apply!" in cleaned:
        return []

    if saw_header:
        raise GateError("Wrangler reported pending migrations, but their filenames could not be parsed safely.")

    raise GateError("Wrangler output did not contain a pending migration list or a 'No migrations to apply!' marker.")


def load_output(args: argparse.Namespace) -> str:
    if args.wrangler_output_file:
        return Path(args.wrangler_output_file).read_text(encoding="utf-8")
    return sys.stdin.read()


def main() -> int:
    args = parse_args()
    raw_output = load_output(args)

    try:
        migration_names = parse_pending_migration_names(raw_output)
        migration_paths = [str(Path(args.migrations_dir) / name) for name in migration_names]
        violations = evaluate_files(
            migration_paths,
            allowed_violations_by_basename=GRANDFATHERED_PENDING_MIGRATION_VIOLATIONS,
        )
    except GateError as exc:
        print(f"pending-migration-gate: {exc}", file=sys.stderr)
        return 1

    if not migration_names:
        print("pending-migration-gate: no remote D1 migrations are pending")
        return 0

    print("pending-migration-gate: evaluating pending migrations:")
    for migration_name in migration_names:
        print(f"- {migration_name}")

    if not violations:
        print("pending-migration-gate: all pending migrations satisfy the auto-release contract")
        return 0

    print(
        "pending-migration-gate: blocked destructive patterns in pending migrations:",
        file=sys.stderr,
    )
    for file_name, file_violations in violations.items():
        print(f"- {file_name}", file=sys.stderr)
        for violation in file_violations:
            print(
                f"  - {violation['code']}: {violation['reason']} | snippet={violation['snippet']}",
                file=sys.stderr,
            )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
