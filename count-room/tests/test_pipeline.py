from count_room.pipeline import handle_incident
from pathlib import Path


def test_roi_writes_evidence_and_never_blocks_fix():
    run = handle_incident("roi", mode="fixture")
    assert run.decision.zone.id == "STANDARD"
    assert run.auto_remediated
    assert run.patch_verified
    assert any(s.id == "fix" and s.ran for s in run.stages)
    assert any(s.id == "clone" and s.ran for s in run.stages)
    assert Path(run.artifact_path).name == "EVIDENCE.md"
    assert Path(run.artifact_path).is_file()


def test_ggr_never_instantiates_fix():
    run = handle_incident("ggr", mode="fixture")
    assert run.decision.zone.id == "NGCB_MICS"
    assert run.auto_remediated is False
    fix = next(s for s in run.stages if s.id == "fix")
    clone = next(s for s in run.stages if s.id == "clone")
    assert fix.blocked
    assert clone.skipped
    assert Path(run.artifact_path).name == "DOSSIER.md"
    text = Path(run.artifact_path).read_text()
    assert "AUTOMATED REMEDIATION BLOCKED" in text
    assert "never instantiated" in text.lower() or "never instantiated" in fix.detail.lower()


def test_pii_patches_but_privacy_review_fails():
    run = handle_incident("pii", mode="fixture")
    assert run.decision.zone.id == "RESTRICTED_PII"
    assert run.auto_remediated is False
    assert any(s.id == "fix" and s.ran for s in run.stages)
    privacy = next(s for s in run.stages if s.id == "privacy-reviewer")
    assert "FAIL" in privacy.summary
    text = Path(run.artifact_path).read_text()
    assert "PLAYER_LOOKALIKE" in text


def test_demo_pipeline_prints_both_outcomes(capsys):
    from count_room.cli import cmd_pipeline

    assert cmd_pipeline(live=False) == 0
    out = capsys.readouterr().out
    assert "COUNT ROOM" in out
    assert "1/2  roi" in out
    assert "2/2  ggr" in out
    assert "FIX APPLIED" in out
    assert "NEVER CREATED" in out
    assert "ALERT OPEN" in out
    assert "nullif" in out
    assert "SUMMARY" in out
    assert "DuckDB" not in out
    assert "duckdb" not in out


def test_source_sql_is_not_rewritten():
    original = Path(__file__).resolve().parents[1] / "sql/marts/regulatory/daily_ggr.sql"
    before = original.read_text()
    handle_incident("ggr", mode="fixture")
    handle_incident("roi", mode="fixture")
    assert original.read_text() == before
    assert "date_trunc('day', wager_ts)" in before
