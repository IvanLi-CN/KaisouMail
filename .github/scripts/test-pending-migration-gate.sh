#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
import importlib.util
import sys
import tempfile
from pathlib import Path

repo_root = Path.cwd()
scripts_dir = repo_root / ".github/scripts"
sys.path.insert(0, str(scripts_dir))

spec = importlib.util.spec_from_file_location(
    "pending_migration_gate",
    scripts_dir / "pending_migration_gate.py",
)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = module
spec.loader.exec_module(module)

sample_output = """
 ⛅️ wrangler 4.80.0
───────────────────
Resource location: remote

Migrations to be applied:
┌────────────────────────────────────────────┐
│ Name                                       │
├────────────────────────────────────────────┤
│ 0002_multi_domain_support.sql              │
├────────────────────────────────────────────┤
│ 0003_domain_binding_source_soft_delete.sql │
└────────────────────────────────────────────┘
"""
assert module.parse_pending_migration_names(sample_output) == [
    "0002_multi_domain_support.sql",
    "0003_domain_binding_source_soft_delete.sql",
]

no_pending_output = """
 ⛅️ wrangler 4.80.0
✅ No migrations to apply!
"""
assert module.parse_pending_migration_names(no_pending_output) == []

with tempfile.TemporaryDirectory() as temp_dir:
    temp_path = Path(temp_dir)
    safe_file = temp_path / "0002_multi_domain_support.sql"
    unsafe_file = temp_path / "0003_domain_binding_source_soft_delete.sql"
    safe_file.write_text("ALTER TABLE domains ADD COLUMN deleted_at text;\n", encoding="utf-8")
    unsafe_file.write_text("DROP INDEX IF EXISTS domains_status_idx;\n", encoding="utf-8")

    safe_results = module.evaluate_files([str(safe_file)])
    assert safe_results == {}, safe_results

    unsafe_results = module.evaluate_files([str(unsafe_file)])
    assert str(unsafe_file) in unsafe_results

    grandfathered_results = module.evaluate_files(
        [str(unsafe_file)],
        allowed_violations_by_basename=module.GRANDFATHERED_PENDING_MIGRATION_VIOLATIONS,
    )
    assert grandfathered_results == {}, grandfathered_results

print("pending_migration_gate tests passed")
PY
