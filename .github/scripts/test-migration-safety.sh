#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
import importlib.util
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "migration_safety_gate",
    Path(".github/scripts/migration_safety_gate.py"),
)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)

safe_sql = """
-- safe expand migration
ALTER TABLE domains ADD COLUMN deleted_at text;
CREATE INDEX domains_deleted_at_idx ON domains(deleted_at);
UPDATE domains SET deleted_at = NULL WHERE deleted_at IS NULL;
"""
unsafe_sql = """
ALTER TABLE domains RENAME COLUMN root_domain TO mail_domain;
DROP INDEX IF EXISTS domains_status_idx;
INSERT OR REPLACE INTO domains(id, root_domain) VALUES ('1', 'example.com');
"""

assert module.evaluate_sql_text(safe_sql) == []
literal_sql = "INSERT INTO audit_logs(message) VALUES ('drop table requested by customer');"
escaped_literal_sql = "INSERT INTO audit_logs(message) VALUES ('rename column ''legacy'' later');"
assert module.evaluate_sql_text(literal_sql) == []
assert module.evaluate_sql_text(escaped_literal_sql) == []
violations = module.evaluate_sql_text(unsafe_sql)
codes = {violation["code"] for violation in violations}
assert {"rename-table-or-column", "drop-index", "replace-into"}.issubset(codes), codes

with tempfile.TemporaryDirectory() as temp_dir:
    safe_path = Path(temp_dir) / "0001_safe.sql"
    unsafe_path = Path(temp_dir) / "0002_unsafe.sql"
    safe_path.write_text(safe_sql, encoding="utf-8")
    unsafe_path.write_text(unsafe_sql, encoding="utf-8")

    file_results = module.evaluate_files([str(safe_path), str(unsafe_path)])
    assert str(safe_path) not in file_results
    assert str(unsafe_path) in file_results

print("migration_safety_gate tests passed")
PY
