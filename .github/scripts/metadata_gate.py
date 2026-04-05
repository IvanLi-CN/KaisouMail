#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

API_VERSION = "2022-11-28"
ALLOWED_TYPE_LABELS = frozenset(
    {
        "type:patch",
        "type:minor",
        "type:major",
        "type:docs",
        "type:skip",
    }
)
ALLOWED_CHANNEL_LABELS = frozenset({"channel:stable", "channel:rc"})


class GateError(RuntimeError):
    pass


class GitHubClient:
    def __init__(self, owner: str, repo: str, api_root: str, token: str) -> None:
        self.owner = owner
        self.repo = repo
        self.api_root = api_root.rstrip("/")
        self.token = token

    def request_json(self, path: str) -> Any:
        url = self.api_root + path
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "kaisoumail-metadata-gate/1.0",
            "X-GitHub-Api-Version": API_VERSION,
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise GateError(detail or exc.reason) from exc
        except urllib.error.URLError as exc:
            raise GateError(f"GitHub API request failed: {exc.reason}") from exc


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate KaisouMail PR metadata gates.")
    parser.add_argument("gate", choices=("label",))
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""))
    parser.add_argument("--api-root", default=os.environ.get("GITHUB_API_URL", "https://api.github.com"))
    parser.add_argument("--token", default=os.environ.get("GITHUB_TOKEN", ""))
    parser.add_argument("--event-path", default=os.environ.get("GITHUB_EVENT_PATH", ""))
    parser.add_argument("--pull-number", type=int, default=None)
    return parser.parse_args()


def split_repo(full_name: str) -> tuple[str, str]:
    owner, sep, repo = full_name.partition("/")
    if not sep or not owner or not repo:
        raise GateError("Repository must be in owner/name form")
    return owner, repo


def load_event_payload(path: str) -> dict[str, Any]:
    if not path:
        return {}
    event_path = Path(path)
    if not event_path.is_file():
        return {}
    payload = json.loads(event_path.read_text())
    if not isinstance(payload, dict):
        raise GateError("GitHub event payload must be a JSON object")
    return payload


def resolve_pull_number(payload: dict[str, Any], manual_pull_number: int | None) -> int:
    if manual_pull_number is not None and manual_pull_number > 0:
        return manual_pull_number
    pull_request = payload.get("pull_request")
    if isinstance(pull_request, dict):
        number = pull_request.get("number")
        if isinstance(number, int) and number > 0:
            return number
    raise GateError("Missing valid pull request number for label gate evaluation")


def describe_labels(labels: list[str]) -> str:
    return ", ".join(sorted(set(labels))) if labels else "(none)"


def evaluate_labels_from_names(labels: list[str]) -> tuple[bool, str]:
    type_labels = sorted({label for label in labels if label.startswith("type:")})
    channel_labels = sorted({label for label in labels if label.startswith("channel:")})
    unknown_type_labels = [label for label in type_labels if label not in ALLOWED_TYPE_LABELS]
    unknown_channel_labels = [label for label in channel_labels if label not in ALLOWED_CHANNEL_LABELS]
    selected_type_labels = [label for label in type_labels if label in ALLOWED_TYPE_LABELS]
    selected_channel_labels = [label for label in channel_labels if label in ALLOWED_CHANNEL_LABELS]

    problems: list[str] = []
    if unknown_type_labels:
        problems.append(f"Unknown type label(s): {', '.join(unknown_type_labels)}")
    if unknown_channel_labels:
        problems.append(f"Unknown channel label(s): {', '.join(unknown_channel_labels)}")
    if len(selected_type_labels) != 1:
        problems.append(f"Expected exactly 1 type:* label, got {len(selected_type_labels)}")
    if len(selected_channel_labels) != 1:
        problems.append(f"Expected exactly 1 channel:* label, got {len(selected_channel_labels)}")

    if problems:
        return False, f"{'; '.join(problems)} | labels={describe_labels(labels)}"
    return True, f"Labels OK: {selected_type_labels[0]} + {selected_channel_labels[0]}"


def fetch_issue_labels(client: GitHubClient, pull_number: int) -> list[str]:
    payload = client.request_json(f"/repos/{client.owner}/{client.repo}/issues/{pull_number}")
    if not isinstance(payload, dict):
        raise GateError(f"Issue payload for PR #{pull_number} must be an object")
    labels = payload.get("labels") or []
    if not isinstance(labels, list):
        raise GateError(f"Labels payload for PR #{pull_number} must be a list")
    return sorted(
        {
            str(label.get("name"))
            for label in labels
            if isinstance(label, dict) and isinstance(label.get("name"), str) and label.get("name")
        }
    )


def write_step_summary(lines: list[str]) -> None:
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY", "")
    if not summary_path:
        return
    with open(summary_path, "a", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")


def run_label_gate(args: argparse.Namespace) -> int:
    owner, repo = split_repo(args.repo)
    payload = load_event_payload(args.event_path)
    pull_number = resolve_pull_number(payload, args.pull_number)
    client = GitHubClient(owner, repo, args.api_root, args.token)
    labels = fetch_issue_labels(client, pull_number)
    passed, description = evaluate_labels_from_names(labels)

    write_step_summary(
        [
            "## PR label gate",
            "",
            f"- PR #{pull_number}: {'pass' if passed else 'fail'}",
            f"- Details: {description}",
        ]
    )

    if not passed:
        print(f"PR #{pull_number}: {description}", file=sys.stderr)
        return 1

    print(f"metadata-gate[label]: validated PR #{pull_number}")
    return 0


def main() -> int:
    args = parse_args()
    try:
        return run_label_gate(args)
    except GateError as exc:
        print(f"metadata-gate[{args.gate}]: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
