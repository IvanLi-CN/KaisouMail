#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import threading
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer

repo_root = Path.cwd()
script_path = repo_root / ".github/scripts/release_snapshot.py"
spec = importlib.util.spec_from_file_location("release_snapshot", script_path)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = module
spec.loader.exec_module(module)

assert module.StableVersion.parse("0.1.0").bump("patch").render() == "0.1.1"
assert module.StableVersion.parse("0.1.0").bump("minor").render() == "0.2.0"
assert module.StableVersion.from_tag("v2.3.4").render() == "2.3.4"
assert module.parse_release_labels(["type:minor", "channel:rc"]) == ("type:minor", "channel:rc")

with tempfile.TemporaryDirectory() as tmp:
    tmp_path = Path(tmp)
    previous_cwd = Path.cwd()
    env = os.environ.copy()
    env.update(
        {
            "GIT_AUTHOR_NAME": "Test Bot",
            "GIT_AUTHOR_EMAIL": "test@example.com",
            "GIT_COMMITTER_NAME": "Test Bot",
            "GIT_COMMITTER_EMAIL": "test@example.com",
        }
    )

    def run(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            args,
            cwd=tmp_path,
            env=env,
            check=check,
            text=True,
            capture_output=True,
        )

    run("git", "init", "-b", "main")
    run("git", "remote", "add", "origin", ".")

    (tmp_path / "package.json").write_text(json.dumps({"name": "kaisoumail", "version": "0.1.0"}) + "\n")
    run("git", "add", "package.json")
    run("git", "commit", "-m", "init")
    first_sha = run("git", "rev-parse", "HEAD").stdout.strip()
    run("git", "tag", "v0.1.0", first_sha)

    (tmp_path / "package.json").write_text(json.dumps({"name": "kaisoumail", "version": "0.1.0", "x": 1}) + "\n")
    run("git", "add", "package.json")
    run("git", "commit", "-m", "second")
    second_sha = run("git", "rev-parse", "HEAD").stdout.strip()

    (tmp_path / "package.json").write_text(json.dumps({"name": "kaisoumail", "version": "0.1.0", "x": 2}) + "\n")
    run("git", "add", "package.json")
    run("git", "commit", "-m", "third")
    third_sha = run("git", "rev-parse", "HEAD").stdout.strip()

    first_snapshot = {
        "schema_version": 1,
        "target_sha": second_sha,
        "pr_number": 10,
        "pr_title": "release second",
        "pr_head_sha": "a" * 40,
        "type_label": "type:minor",
        "channel_label": "channel:stable",
        "release_bump": "minor",
        "release_channel": "stable",
        "release_enabled": True,
        "release_prerelease": False,
        "base_stable_version": "0.1.0",
        "next_stable_version": "0.2.0",
        "app_effective_version": "0.2.0",
        "release_tag": "v0.2.0",
        "tags_csv": "v0.2.0",
        "snapshot_source": "ci-main",
        "created_at": "2026-01-01T00:00:00Z",
        "notes_ref": "refs/notes/release-snapshots",
    }
    second_snapshot = {
        "schema_version": 1,
        "target_sha": third_sha,
        "pr_number": 11,
        "pr_title": "release third",
        "pr_head_sha": "b" * 40,
        "type_label": "type:patch",
        "channel_label": "channel:stable",
        "release_bump": "patch",
        "release_channel": "stable",
        "release_enabled": True,
        "release_prerelease": False,
        "base_stable_version": "0.2.0",
        "next_stable_version": "0.2.1",
        "app_effective_version": "0.2.1",
        "release_tag": "v0.2.1",
        "tags_csv": "v0.2.1",
        "snapshot_source": "ci-main",
        "created_at": "2026-01-01T00:00:00Z",
        "notes_ref": "refs/notes/release-snapshots",
    }

    note_file = tmp_path / "note.json"
    note_file.write_text(json.dumps(first_snapshot))
    run("git", "notes", "--ref=refs/notes/release-snapshots", "add", "-f", "-F", str(note_file), second_sha)
    note_file.write_text(json.dumps(second_snapshot))
    run("git", "notes", "--ref=refs/notes/release-snapshots", "add", "-f", "-F", str(note_file), third_sha)

    os.chdir(tmp_path)
    assert module.compute_base_stable_version("refs/notes/release-snapshots", third_sha).render() == "0.2.0"

    original_release_state = module.release_side_effects_completed
    module.release_side_effects_completed = lambda snapshot, **kwargs: snapshot["target_sha"] == third_sha
    assert module.pending_release_targets(
        "refs/notes/release-snapshots",
        third_sha,
        api_root="https://api.github.com",
        repository="IvanLi-CN/KaisouMail",
        token="token",
    ) == [second_sha]
    module.release_side_effects_completed = lambda snapshot, **kwargs: snapshot["target_sha"] == second_sha
    assert module.pending_release_targets(
        "refs/notes/release-snapshots",
        third_sha,
        api_root="https://api.github.com",
        repository="IvanLi-CN/KaisouMail",
        token="token",
    ) == [third_sha]
    module.release_side_effects_completed = original_release_state

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/repos/IvanLi-CN/KaisouMail/releases/tags/v0.2.0":
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps({"tag_name": "v0.2.0"}).encode())
                return
            if self.path == "/repos/IvanLi-CN/KaisouMail/issues/10/comments?per_page=100":
                self.send_response(200)
                self.end_headers()
                self.wfile.write(
                    json.dumps(
                        [
                            {
                                "body": "<!-- kaisoumail-release-version-comment -->",
                                "user": {"type": "Bot", "login": "github-actions[bot]"},
                            }
                        ]
                    ).encode()
                )
                return
            if self.path == "/repos/IvanLi-CN/KaisouMail/releases/tags/v0.2.1":
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps({"tag_name": "v0.2.1"}).encode())
                return
            if self.path == "/repos/IvanLi-CN/KaisouMail/issues/11/comments?per_page=100":
                self.send_response(200)
                self.end_headers()
                self.wfile.write(
                    json.dumps(
                        [
                            {
                                "body": "<!-- kaisoumail-release-version-comment -->",
                                "user": {"type": "User", "login": "someone"},
                            }
                        ]
                    ).encode()
                )
                return
            self.send_response(404)
            self.end_headers()

        def log_message(self, format, *args):
            return

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    api_root = f"http://127.0.0.1:{server.server_port}"
    assert module.release_side_effects_completed(
        first_snapshot,
        api_root=api_root,
        repository="IvanLi-CN/KaisouMail",
        token="token",
    ) is True
    assert module.release_side_effects_completed(
        second_snapshot,
        api_root=api_root,
        repository="IvanLi-CN/KaisouMail",
        token="token",
    ) is False
    server.shutdown()
    thread.join()

    original = module.load_pr_for_commit
    module.load_pr_for_commit = lambda *args, **kwargs: (_ for _ in ()).throw(module.SnapshotError("Expected exactly 1 PR"))
    try:
        module.build_snapshot(
            target_sha=third_sha,
            repository="IvanLi-CN/KaisouMail",
            token="token",
            notes_ref="refs/notes/release-snapshots",
            api_root="https://api.github.com",
            snapshot_source="ci-main",
        )
        raise AssertionError("Expected build_snapshot to fail when no PR is associated")
    except module.SnapshotError:
        pass
    finally:
        module.load_pr_for_commit = original
    os.chdir(previous_cwd)

print("release_snapshot tests passed")
PY
