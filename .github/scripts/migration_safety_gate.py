#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
import sys
from collections.abc import Mapping, Set as AbstractSet
from pathlib import Path


class GateError(RuntimeError):
    pass


BLOCKED_PATTERNS: tuple[tuple[str, re.Pattern[str], str], ...] = (
    (
        "drop-table",
        re.compile(r"\bdrop\s+table\b", re.IGNORECASE),
        "DROP TABLE breaks the expand-only auto-release contract.",
    ),
    (
        "drop-index",
        re.compile(r"\bdrop\s+index\b", re.IGNORECASE),
        "DROP INDEX should be deferred to a later cleanup release outside the default auto path.",
    ),
    (
        "drop-column",
        re.compile(r"\balter\s+table\b[\s\S]*?\bdrop\s+column\b", re.IGNORECASE),
        "DROP COLUMN is destructive and requires a manual/two-step rollout.",
    ),
    (
        "rename-table-or-column",
        re.compile(r"\balter\s+table\b[\s\S]*?\brename\s+(?:to|column)\b", re.IGNORECASE),
        "RENAME TABLE/COLUMN is not allowed on the default forward-compatible release path.",
    ),
    (
        "replace-into",
        re.compile(r"\b(?:insert\s+or\s+replace|replace\s+into)\b", re.IGNORECASE),
        "REPLACE-style writes can overwrite live data unexpectedly and are blocked in auto migrations.",
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate changed D1 migrations against the forward-compatible auto-release contract."
    )
    parser.add_argument("files", nargs="*", help="Changed migration SQL files to evaluate")
    return parser.parse_args()


def strip_sql_comments_and_literals(sql: str) -> str:
    result: list[str] = []
    i = 0
    state = "normal"

    while i < len(sql):
        current = sql[i]
        next_char = sql[i + 1] if i + 1 < len(sql) else ""

        if state == "normal":
            if current == "-" and next_char == "-":
                result.extend((" ", " "))
                i += 2
                state = "line-comment"
                continue
            if current == "/" and next_char == "*":
                result.extend((" ", " "))
                i += 2
                state = "block-comment"
                continue
            if current == "'":
                result.append(" ")
                i += 1
                state = "single-quote"
                continue

            result.append(current)
            i += 1
            continue

        if state == "line-comment":
            result.append("\n" if current == "\n" else " ")
            i += 1
            if current == "\n":
                state = "normal"
            continue

        if state == "block-comment":
            if current == "*" and next_char == "/":
                result.extend((" ", " "))
                i += 2
                state = "normal"
                continue
            result.append("\n" if current == "\n" else " ")
            i += 1
            continue

        if state == "single-quote":
            if current == "'" and next_char == "'":
                result.extend((" ", " "))
                i += 2
                continue
            result.append("\n" if current == "\n" else " ")
            i += 1
            if current == "'":
                state = "normal"
            continue

        raise GateError(f"Unknown parser state: {state}")

    return "".join(result)


def snippet_around(text: str, start: int, end: int, radius: int = 48) -> str:
    lo = max(0, start - radius)
    hi = min(len(text), end + radius)
    return re.sub(r"\s+", " ", text[lo:hi]).strip()


def evaluate_sql_text(sql: str) -> list[dict[str, str]]:
    sanitized = strip_sql_comments_and_literals(sql)
    violations: list[dict[str, str]] = []

    for code, pattern, reason in BLOCKED_PATTERNS:
        for match in pattern.finditer(sanitized):
            violations.append(
                {
                    "code": code,
                    "reason": reason,
                    "snippet": snippet_around(sanitized, match.start(), match.end()),
                }
            )

    return violations


def filter_exempt_violations(
    file_name: str,
    violations: list[dict[str, str]],
    *,
    allowed_violations_by_basename: Mapping[str, AbstractSet[str]] | None = None,
) -> list[dict[str, str]]:
    if not violations or not allowed_violations_by_basename:
        return violations

    allowed_codes = allowed_violations_by_basename.get(Path(file_name).name)
    if not allowed_codes:
        return violations

    return [
        violation for violation in violations if violation.get("code", "") not in allowed_codes
    ]


def evaluate_files(
    files: list[str],
    *,
    allowed_violations_by_basename: Mapping[str, AbstractSet[str]] | None = None,
) -> dict[str, list[dict[str, str]]]:
    results: dict[str, list[dict[str, str]]] = {}

    for file_name in files:
        path = Path(file_name)
        if not path.is_file():
            raise GateError(
                f"Migration file is missing from the checkout: {file_name}. Deleting or renaming historical migrations is not allowed on the default auto-release path."
            )

        violations = evaluate_sql_text(path.read_text(encoding="utf-8"))
        violations = filter_exempt_violations(
            file_name,
            violations,
            allowed_violations_by_basename=allowed_violations_by_basename,
        )
        if violations:
            results[file_name] = violations

    return results


def write_step_summary(violations: dict[str, list[dict[str, str]]]) -> None:
    summary_path_raw = os.environ.get("GITHUB_STEP_SUMMARY", "")
    if not summary_path_raw:
        return

    summary_path = Path(summary_path_raw)
    lines = [
        "## Migration safety gate",
        "",
    ]

    if not violations:
        lines.extend(
            [
                "- Result: pass",
                "- Details: all changed D1 migrations stay within the default expand-only auto-release contract.",
            ]
        )
    else:
        lines.append("- Result: fail")
        lines.append("- Details: destructive migration patterns were detected in changed SQL files.")
        for file_name, file_violations in violations.items():
            lines.append(f"- `{file_name}`")
            for violation in file_violations:
                lines.append(
                    f"  - `{violation['code']}`: {violation['reason']} Snippet: `{violation['snippet']}`"
                )

    with summary_path.open("a", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")


def main() -> int:
    args = parse_args()
    try:
        violations = evaluate_files(args.files)
    except GateError as exc:
        print(f"migration-safety-gate: {exc}", file=sys.stderr)
        return 1

    write_step_summary(violations)

    if not violations:
        print("migration-safety-gate: no destructive migration patterns detected")
        return 0

    print(
        "migration-safety-gate: blocked destructive patterns in changed migration files:",
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
