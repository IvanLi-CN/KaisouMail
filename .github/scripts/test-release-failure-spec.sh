#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
from pathlib import Path
import re


path = Path("docs/specs/0002-release-failure-telegram-alerts/SPEC.md")
lines = path.read_text(encoding="utf-8").splitlines()
sections = {}
current = None
for line in lines:
    match = re.match(r"^##\s+(.+?)\s*$", line)
    if match:
        current = match.group(1)
        sections[current] = []
    elif current is not None:
        sections[current].append(line)

for name in ("Context and Scope", "Requirements", "Verification", "Related ADRs"):
    assert name in sections, f"missing section: {name}"

requirements = "\n".join(sections["Requirements"])
verification = "\n".join(sections["Verification"])
req_ids = sorted(set(re.findall(r"\bREQ-[A-Z0-9][A-Z0-9_-]*\b", requirements)))
ver_ids = sorted(set(re.findall(r"\bVER-[A-Z0-9][A-Z0-9_-]*\b", verification)))
assert req_ids, "requirements must declare REQ-* identifiers"
assert ver_ids, "verification must declare VER-* identifiers"
assert re.search(r"\b(MUST|SHALL|MUST NOT)\b", requirements), "requirements must be normative"
for req_id in req_ids:
    assert re.search(rf"covers:\s*[^\n]*\b{re.escape(req_id)}\b", verification), f"no verification covers {req_id}"

adr_lines = [line.strip() for line in sections["Related ADRs"] if line.strip()]
assert len(adr_lines) == 1 and adr_lines[0].startswith("- [ADR 0002:")
assert "../../adr/0002-oidrune-release-notification-boundary.md" in adr_lines[0]
print("release failure Spec contract tests passed")
PY
