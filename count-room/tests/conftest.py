"""Keep test-double runs out of the presenter's real run history."""
import pytest
import count_room.audit

@pytest.fixture(autouse=True)
def isolated_audit_root(monkeypatch, tmp_path):
    monkeypatch.setattr(count_room.audit, 'ROOT', tmp_path)
