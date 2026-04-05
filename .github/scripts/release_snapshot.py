#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib import error, parse, request

SNAPSHOT_SCHEMA_VERSION = 1
DEFAULT_NOTES_REF = "refs/notes/release-snapshots"
API_VERSION = "2022-11-28"
ALLOWED_SNAPSHOT_SOURCES = {"ci-main", "manual-backfill"}
ALLOWED_TYPE_LABELS = {
    "type:patch",
    "type:minor",
    "type:major",
    "type:docs",
    "type:skip",
}
ALLOWED_CHANNEL_LABELS = {"channel:stable", "channel:rc"}
STABLE_TAG_RE = re.compile(r"^v(\d+)\.(\d+)\.(\d+)$")
RELEASE_COMMENT_MARKER = "<!-- kaisoumail-release-version-comment -->"
LINK_NEXT_RE = re.compile(r'<([^>]+)>;\s*rel="next"')


class SnapshotError(RuntimeError):
    pass


@dataclass(frozen=True, order=True)
class StableVersion:
    major: int
    minor: int
    patch: int

    @classmethod
    def parse(cls, value: str) -> "StableVersion":
        match = STABLE_TAG_RE.fullmatch(f"v{value}")
        if not match:
            raise SnapshotError(f"Invalid stable version: {value}")
        return cls(*(int(part) for part in match.groups()))

    @classmethod
    def from_tag(cls, tag: str) -> "StableVersion | None":
        match = STABLE_TAG_RE.fullmatch(tag)
        if not match:
            return None
        return cls(*(int(part) for part in match.groups()))

    def bump(self, bump: str) -> "StableVersion":
        if bump == "patch":
            return StableVersion(self.major, self.minor, self.patch + 1)
        if bump == "minor":
            return StableVersion(self.major, self.minor + 1, 0)
        if bump == "major":
            return StableVersion(self.major + 1, 0, 0)
        raise SnapshotError(f"Unknown release bump: {bump}")

    def render(self) -> str:
        return f"{self.major}.{self.minor}.{self.patch}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Manage immutable release snapshots stored in git notes.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    ensure = subparsers.add_parser("ensure", help="Create or reuse the immutable snapshot for a main commit.")
    ensure.add_argument("--target-sha", required=True)
    ensure.add_argument("--github-repository", required=True)
    ensure.add_argument("--github-token", required=True)
    ensure.add_argument("--notes-ref", default=DEFAULT_NOTES_REF)
    ensure.add_argument("--api-root", default=os.environ.get("GITHUB_API_URL", "https://api.github.com"))
    ensure.add_argument("--output", required=True)
    ensure.add_argument("--target-only", action="store_true")

    export_cmd = subparsers.add_parser("export", help="Export a stored release snapshot into GitHub outputs.")
    export_cmd.add_argument("--target-sha", required=True)
    export_cmd.add_argument("--notes-ref", default=DEFAULT_NOTES_REF)
    export_cmd.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT", ""))

    next_pending = subparsers.add_parser(
        "next-pending",
        help="Find the oldest unreleased snapshot on the first-parent path up to a given main commit.",
    )
    next_pending.add_argument("--notes-ref", default=DEFAULT_NOTES_REF)
    next_pending.add_argument("--main-ref", required=True)
    next_pending.add_argument("--upper-bound", default="")
    next_pending.add_argument("--github-repository", required=True)
    next_pending.add_argument("--github-token", required=True)
    next_pending.add_argument("--api-root", default=os.environ.get("GITHUB_API_URL", "https://api.github.com"))
    next_pending.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT", ""))

    return parser.parse_args()


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(["git", *args], check=False, text=True, capture_output=True)
    if check and result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or f"git {' '.join(args)} failed"
        raise SnapshotError(detail)
    return result


def git_output(*args: str) -> str:
    return git(*args).stdout.strip()


def normalize_sha(target_sha: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{40}", target_sha):
        raise SnapshotError(f"Invalid target SHA: {target_sha}")
    git("cat-file", "-e", f"{target_sha}^{{commit}}")
    return target_sha


def fetch_notes_ref(notes_ref: str) -> None:
    probe = git("ls-remote", "--exit-code", "origin", notes_ref, check=False)
    if probe.returncode == 0:
        git("fetch", "--no-tags", "origin", f"+{notes_ref}:{notes_ref}")


def fetch_tags() -> None:
    git("fetch", "--tags", "origin")


def github_request(api_root: str, token: str, path: str, *, allow_404: bool = False) -> tuple[Any | None, Any]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json, application/vnd.github.groot-preview+json",
        "User-Agent": "kaisoumail-release-snapshot",
        "X-GitHub-Api-Version": API_VERSION,
    }
    url = path if path.startswith("http://") or path.startswith("https://") else f"{api_root.rstrip('/')}{path}"
    req = request.Request(url, headers=headers)
    try:
        with request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8")), resp.headers
    except error.HTTPError as exc:
        if allow_404 and exc.code == 404:
            return None, exc.headers
        body = exc.read().decode("utf-8", errors="replace")
        raise SnapshotError(f"GitHub API error on {path}: {exc.code} {body}") from exc
    except error.URLError as exc:
        raise SnapshotError(f"GitHub API request failed on {path}: {exc}") from exc


def github_request_json(api_root: str, token: str, path: str, *, allow_404: bool = False) -> Any:
    payload, _headers = github_request(api_root, token, path, allow_404=allow_404)
    return payload


def github_request_paginated(api_root: str, token: str, path: str) -> list[Any]:
    items: list[Any] = []
    next_path: str | None = path
    while next_path:
        payload, headers = github_request(api_root, token, next_path)
        if not isinstance(payload, list):
            raise SnapshotError(f"GitHub API returned a non-list payload for paginated path: {next_path}")
        items.extend(payload)
        link_header = headers.get("Link", "")
        match = LINK_NEXT_RE.search(link_header)
        next_path = match.group(1) if match else None
    return items


def load_pr_for_commit(
    api_root: str,
    repository: str,
    token: str,
    target_sha: str,
) -> dict[str, Any]:
    owner, repo = repository.split("/", 1)
    payload = github_request_json(api_root, token, f"/repos/{owner}/{repo}/commits/{target_sha}/pulls")
    if not isinstance(payload, list):
        raise SnapshotError("GitHub API returned an unexpected payload for commit-associated PRs")
    if len(payload) != 1:
        raise SnapshotError(f"Expected exactly 1 PR associated with commit {target_sha}, got {len(payload)}")
    pr_number = payload[0].get("number")
    if not isinstance(pr_number, int):
        raise SnapshotError("Commit-associated PR payload is missing a numeric PR number")
    pr = github_request_json(api_root, token, f"/repos/{owner}/{repo}/pulls/{pr_number}")
    if not isinstance(pr, dict):
        raise SnapshotError("GitHub API returned a malformed pull request payload")
    return pr


def current_pr_labels(pr: dict[str, Any]) -> list[str]:
    labels = pr.get("labels")
    if not isinstance(labels, list):
        raise SnapshotError("Pull request payload is missing labels")
    names: list[str] = []
    for label in labels:
        if isinstance(label, dict) and isinstance(label.get("name"), str):
            names.append(label["name"])
    return sorted(set(names))


def current_pr_head_sha(pr: dict[str, Any]) -> str:
    head = pr.get("head")
    if not isinstance(head, dict):
        raise SnapshotError("Pull request payload is missing head metadata")
    sha = head.get("sha")
    if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise SnapshotError("Pull request payload is missing a valid head.sha")
    return sha


def parse_release_labels(labels: list[str]) -> tuple[str, str]:
    type_labels = [label for label in labels if label.startswith("type:")]
    channel_labels = [label for label in labels if label.startswith("channel:")]
    if len(type_labels) != 1:
        raise SnapshotError(
            f"Expected exactly 1 type:* label, got {len(type_labels)}: {', '.join(type_labels) or '(none)'}"
        )
    if len(channel_labels) != 1:
        raise SnapshotError(
            f"Expected exactly 1 channel:* label, got {len(channel_labels)}: {', '.join(channel_labels) or '(none)'}"
        )
    type_label = type_labels[0]
    channel_label = channel_labels[0]
    if type_label not in ALLOWED_TYPE_LABELS:
        raise SnapshotError(f"Unknown type label: {type_label}")
    if channel_label not in ALLOWED_CHANNEL_LABELS:
        raise SnapshotError(f"Unknown channel label: {channel_label}")
    return type_label, channel_label


def package_base_version(target_sha: str) -> StableVersion:
    raw = git_output("show", f"{target_sha}:package.json")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SnapshotError("Failed to parse package.json from target commit") from exc
    version = payload.get("version")
    if not isinstance(version, str):
        raise SnapshotError("package.json must contain a string version")
    return StableVersion.parse(version)


def stable_versions_from_tags(target_sha: str) -> list[StableVersion]:
    versions: list[StableVersion] = []
    for tag in git_output("tag", "--merged", target_sha, "-l", "v*").splitlines():
        version = StableVersion.from_tag(tag.strip())
        if version is not None:
            versions.append(version)
    return versions


def stable_versions_from_snapshots(notes_ref: str, target_sha: str) -> list[StableVersion]:
    versions: list[StableVersion] = []
    commits = first_parent_commits(target_sha)
    for commit in commits[:-1]:
        snapshot = read_snapshot(notes_ref, commit)
        if not snapshot or not snapshot.get("release_enabled"):
            continue
        if snapshot.get("release_channel") != "stable":
            continue
        next_stable_version = snapshot.get("next_stable_version")
        if not isinstance(next_stable_version, str) or not next_stable_version:
            continue
        versions.append(StableVersion.parse(next_stable_version))
    return versions


def compute_base_stable_version(notes_ref: str, target_sha: str) -> StableVersion:
    versions = stable_versions_from_tags(target_sha)
    versions.extend(stable_versions_from_snapshots(notes_ref, target_sha))
    if versions:
        return max(versions)
    return package_base_version(target_sha)


def validate_snapshot(payload: Any, *, expected_sha: str | None = None) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise SnapshotError("Release snapshot note must decode to an object")
    if payload.get("schema_version") != SNAPSHOT_SCHEMA_VERSION:
        raise SnapshotError(f"Unsupported release snapshot schema: {payload.get('schema_version')!r}")
    target_sha = payload.get("target_sha")
    if not isinstance(target_sha, str) or not re.fullmatch(r"[0-9a-f]{40}", target_sha):
        raise SnapshotError("Release snapshot target_sha must be a 40-char commit SHA")
    if expected_sha and target_sha != expected_sha:
        raise SnapshotError(f"Release snapshot target_sha mismatch: expected {expected_sha}, got {target_sha}")
    snapshot_source = payload.get("snapshot_source")
    if snapshot_source not in ALLOWED_SNAPSHOT_SOURCES:
        raise SnapshotError("Release snapshot snapshot_source is invalid")
    if not isinstance(payload.get("release_enabled"), bool):
        raise SnapshotError("Release snapshot release_enabled must be boolean")
    if not isinstance(payload.get("release_prerelease"), bool):
        raise SnapshotError("Release snapshot release_prerelease must be boolean")

    required_string_fields = [
        "type_label",
        "channel_label",
        "release_bump",
        "release_channel",
        "base_stable_version",
        "next_stable_version",
        "app_effective_version",
        "release_tag",
        "tags_csv",
    ]
    if payload["release_enabled"]:
        for key in required_string_fields:
            value = payload.get(key)
            if not isinstance(value, str) or not value:
                raise SnapshotError(f"Release snapshot {key} must be a non-empty string when release_enabled=true")
    return payload


def read_snapshot(notes_ref: str, target_sha: str) -> dict[str, Any] | None:
    result = git("notes", f"--ref={notes_ref}", "show", target_sha, check=False)
    if result.returncode != 0:
        return None
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise SnapshotError(f"Release snapshot note for {target_sha} is not valid JSON") from exc
    return validate_snapshot(payload, expected_sha=target_sha)


def build_snapshot(
    *,
    target_sha: str,
    repository: str,
    token: str,
    notes_ref: str,
    api_root: str,
    snapshot_source: str,
) -> dict[str, Any]:
    pr = load_pr_for_commit(api_root, repository, token, target_sha)
    labels = current_pr_labels(pr)
    type_label, channel_label = parse_release_labels(labels)
    release_enabled = type_label not in {"type:docs", "type:skip"}
    release_bump = type_label.split(":", 1)[1]
    release_channel = channel_label.split(":", 1)[1]
    pr_number = pr.get("number")
    if not isinstance(pr_number, int):
        raise SnapshotError("Pull request payload is missing a numeric PR number")

    snapshot: dict[str, Any] = {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "target_sha": target_sha,
        "pr_number": pr_number,
        "pr_title": str(pr.get("title") or ""),
        "pr_head_sha": current_pr_head_sha(pr),
        "type_label": type_label,
        "channel_label": channel_label,
        "release_bump": release_bump,
        "release_channel": release_channel,
        "release_enabled": release_enabled,
        "release_prerelease": False,
        "base_stable_version": "",
        "next_stable_version": "",
        "app_effective_version": "",
        "release_tag": "",
        "tags_csv": "",
        "snapshot_source": snapshot_source,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "notes_ref": notes_ref,
    }

    if release_enabled:
        base = compute_base_stable_version(notes_ref, target_sha)
        next_stable = base.bump(release_bump)
        effective = next_stable.render()
        prerelease = False
        if release_channel == "rc":
            effective = f"{effective}-rc.{target_sha[:7]}"
            prerelease = True
        snapshot.update(
            {
                "base_stable_version": base.render(),
                "next_stable_version": next_stable.render(),
                "app_effective_version": effective,
                "release_tag": f"v{effective}",
                "release_prerelease": prerelease,
                "tags_csv": f"v{effective}",
            }
        )

    return validate_snapshot(snapshot, expected_sha=target_sha)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def github_release_exists(api_root: str, repository: str, token: str, release_tag: str) -> bool:
    owner, repo = repository.split("/", 1)
    payload = github_request_json(
        api_root,
        token,
        f"/repos/{owner}/{repo}/releases/tags/{parse.quote(release_tag, safe='')}",
        allow_404=True,
    )
    return isinstance(payload, dict)


def github_pr_has_release_comment(api_root: str, repository: str, token: str, pr_number: int) -> bool:
    owner, repo = repository.split("/", 1)
    comments = github_request_paginated(
        api_root,
        token,
        f"/repos/{owner}/{repo}/issues/{pr_number}/comments?per_page=100",
    )
    for comment in comments:
        if not isinstance(comment, dict):
            continue
        body = comment.get("body")
        user = comment.get("user")
        if (
            isinstance(body, str)
            and RELEASE_COMMENT_MARKER in body
            and isinstance(user, dict)
            and user.get("type") == "Bot"
            and user.get("login") == "github-actions[bot]"
        ):
            return True
    return False


def release_side_effects_completed(snapshot: dict[str, Any], *, api_root: str, repository: str, token: str) -> bool:
    if not snapshot.get("release_enabled"):
        return True
    release_tag = snapshot.get("release_tag")
    pr_number = snapshot.get("pr_number")
    if not isinstance(release_tag, str) or not release_tag:
        return False
    if not github_release_exists(api_root, repository, token, release_tag):
        return False
    if not isinstance(pr_number, int) or pr_number <= 0:
        return False
    return github_pr_has_release_comment(api_root, repository, token, pr_number)


def first_parent_commits(target_sha: str) -> list[str]:
    return [commit for commit in git_output("rev-list", "--first-parent", "--reverse", target_sha).splitlines() if commit]


def pending_release_targets(
    notes_ref: str,
    upper_bound_sha: str,
    *,
    api_root: str,
    repository: str,
    token: str,
) -> list[str]:
    pending: list[str] = []
    for commit in first_parent_commits(upper_bound_sha):
        snapshot = read_snapshot(notes_ref, commit)
        if not snapshot or not snapshot.get("release_enabled"):
            continue
        if release_side_effects_completed(snapshot, api_root=api_root, repository=repository, token=token):
            continue
        pending.append(commit)
    return pending


def export_key_values(values: dict[str, Any], github_output: str) -> None:
    lines: list[str] = []
    for key, value in values.items():
        rendered = ""
        if isinstance(value, bool):
            rendered = "true" if value else "false"
        elif value is not None:
            rendered = str(value)
        lines.append(f"{key}={rendered}")
    payload = "\n".join(lines) + "\n"
    if github_output:
        with Path(github_output).open("a", encoding="utf-8") as handle:
            handle.write(payload)
    else:
        sys.stdout.write(payload)


def export_snapshot(snapshot: dict[str, Any], github_output: str) -> None:
    export_key_values(
        {
            "target_sha": snapshot.get("target_sha", ""),
            "release_enabled": snapshot.get("release_enabled", False),
            "release_bump": snapshot.get("release_bump", ""),
            "release_channel": snapshot.get("release_channel", ""),
            "pr_number": snapshot.get("pr_number", ""),
            "pr_title": snapshot.get("pr_title", ""),
            "pr_head_sha": snapshot.get("pr_head_sha", ""),
            "app_effective_version": snapshot.get("app_effective_version", ""),
            "release_tag": snapshot.get("release_tag", ""),
            "release_prerelease": snapshot.get("release_prerelease", False),
            "tags_csv": snapshot.get("tags_csv", ""),
        },
        github_output,
    )


def ensure_snapshot(args: argparse.Namespace) -> int:
    target_sha = normalize_sha(args.target_sha)
    fetch_notes_ref(args.notes_ref)
    existing = read_snapshot(args.notes_ref, target_sha)
    output_path = Path(args.output)
    if existing is not None:
        write_json(output_path, existing)
        return 0

    snapshot = build_snapshot(
        target_sha=target_sha,
        repository=args.github_repository,
        token=args.github_token,
        notes_ref=args.notes_ref,
        api_root=args.api_root,
        snapshot_source="manual-backfill" if args.target_only else "ci-main",
    )
    with tempfile.TemporaryDirectory(prefix="kaisoumail-release-snapshot-") as tmp:
        temp_note = Path(tmp) / "snapshot.json"
        write_json(temp_note, snapshot)
        git("notes", f"--ref={args.notes_ref}", "add", "-f", "-F", str(temp_note), target_sha)
        write_json(output_path, snapshot)
        git("push", "origin", args.notes_ref)
    return 0


def export_existing_snapshot(args: argparse.Namespace) -> int:
    target_sha = normalize_sha(args.target_sha)
    fetch_notes_ref(args.notes_ref)
    snapshot = read_snapshot(args.notes_ref, target_sha)
    if snapshot is None:
        raise SnapshotError(f"Missing immutable release snapshot for {target_sha}")
    export_snapshot(snapshot, args.github_output)
    return 0


def export_next_pending(args: argparse.Namespace) -> int:
    upper_bound = normalize_sha(args.upper_bound or git_output("rev-parse", args.main_ref))
    git("merge-base", "--is-ancestor", upper_bound, args.main_ref)
    fetch_notes_ref(args.notes_ref)
    fetch_tags()
    pending = pending_release_targets(
        args.notes_ref,
        upper_bound,
        api_root=args.api_root,
        repository=args.github_repository,
        token=args.github_token,
    )
    export_key_values({"target_sha": pending[0] if pending else ""}, args.github_output)
    return 0


def main() -> int:
    args = parse_args()
    try:
        if args.command == "ensure":
            return ensure_snapshot(args)
        if args.command == "export":
            return export_existing_snapshot(args)
        if args.command == "next-pending":
            return export_next_pending(args)
        raise SnapshotError(f"Unsupported command: {args.command}")
    except SnapshotError as exc:
        print(f"release_snapshot.py: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
