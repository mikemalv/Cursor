from dataclasses import asdict
import inspect
from pathlib import Path
from types import SimpleNamespace
import pytest
from cursor_sdk import Agent, AgentOptions
from count_room import agents
from count_room.audit import AuditLog
from count_room.catalog import ROOT, load_incident, load_policy, read_sql
from count_room.gate import decide
from count_room.pipeline import fixture_triage, handle_incident
from count_room.verify import verify_sql


def test_verifier_executes_both_versions_and_rejects_wrong_math():
    original = read_sql(load_incident('roi').sql_file)
    patch = (ROOT / 'fixtures/patches/roi.sql').read_text()
    assert not verify_sql('roi', original)['passed']
    assert verify_sql('roi', patch)['passed']
    assert not verify_sql('roi', patch.replace('sum(spend) /', '0 * sum(spend) /'))['passed']
    assert not verify_sql('roi', patch.replace('nullif(sum(impressions), 0)', '(sum(impressions) + 1)'))['passed']


@pytest.mark.parametrize('sql', ['DROP TABLE anything', 'SELECT 1; SELECT 2', "SELECT * FROM read_csv('/etc/passwd')", "SELECT * FROM read_csv('https://example.com/data.csv')", 'SELEC broken'])
def test_verifier_rejects_unsafe_or_invalid_sql(sql):
    assert not verify_sql('roi', sql)['passed']


def test_pii_contract_checks_real_columns_and_values():
    assert not verify_sql('pii', read_sql(load_incident('pii').sql_file))['passed']
    assert verify_sql('pii', (ROOT/'fixtures/patches/pii.sql').read_text())['passed']


def test_live_pipeline_does_not_replace_bad_sdk_sql(monkeypatch):
    monkeypatch.setattr(agents,'live_triage',lambda incident,*_: fixture_triage(incident))
    monkeypatch.setattr(agents,'live_fix',lambda *_: 'select 1 as incorrect')
    run=handle_incident('roi',mode='live')
    assert not run.patch_verified
    assert not run.auto_remediated
    assert (Path(run.artifact_path).parent/'proposed.sql').read_text() == 'select 1 as incorrect'


def test_live_failure_never_falls_back(monkeypatch):
    monkeypatch.setattr(agents,'live_triage',lambda incident,*_: fixture_triage(incident))
    def fail(*args): raise RuntimeError('SDK unavailable')
    monkeypatch.setattr(agents,'live_fix',fail)
    with pytest.raises(RuntimeError,match='SDK unavailable'): handle_incident('roi',mode='live')


def test_model_cannot_omit_trusted_regulated_target(monkeypatch):
    monkeypatch.setattr(agents,'live_triage',lambda *_: fixture_triage(load_incident('roi')))
    def forbidden(*args): pytest.fail('regulated fix must never be instantiated')
    monkeypatch.setattr(agents,'live_fix',forbidden)
    run=handle_incident('ggr',mode='live')
    assert run.decision.zone.id=='NGCB_MICS'
    assert not run.patch_verified


def test_each_run_has_separate_audit_and_artifacts():
    first=handle_incident('roi'); second=handle_incident('roi')
    assert first.artifact_path != second.artifact_path


def test_sdk_adapter_uses_installed_signature_and_actual_callback(monkeypatch,tmp_path):
    """Real SDK option/tool types, with a test-double transport (not a live run)."""
    signature=inspect.signature(Agent.create)
    calls=[]
    class FakeAgent:
        agent_id='test-double'
        def __enter__(self): return self
        def __exit__(self,*args): pass
        def send(self,message):
            tool=calls[-1].local.custom_tools
            def messages():
                context=SimpleNamespace(tool_call_id='test-call')
                if 'emit_triage' in tool:
                    tool['emit_triage'].execute(asdict(fixture_triage(load_incident('roi'))),context)
                else:
                    tool['emit_patch'].execute({'sql':'SELECT 42 AS actual_agent_proposal'},context)
                yield SimpleNamespace(type='tool_call',name='test_callback',status='completed')
            return SimpleNamespace(messages=messages,wait=lambda:SimpleNamespace(status='finished'))
    def create(*args,**kwargs):
        signature.bind(*args,**kwargs)
        assert isinstance(args[0],AgentOptions)
        assert args[0].tools==['read','mcp']
        assert not (Path(args[0].local.cwd)/'fixtures').exists()
        calls.append(args[0]);return FakeAgent()
    monkeypatch.setattr(Agent,'create',create)
    monkeypatch.setenv('CURSOR_API_KEY','test-double-key')
    from count_room.warehouse import Warehouse
    incident=load_incident('roi');audit=AuditLog('adapter',tmp_path)
    result=agents.live_triage(incident,Warehouse(),audit)
    assert result.hypothesis
    patch=agents.live_fix(incident,decide(load_policy(),result),audit)
    assert patch=='SELECT 42 AS actual_agent_proposal'
    assert len(calls)==2
    assert 'test_callback' in (audit.dir/'events.jsonl').read_text()


def test_marketing_fix_is_really_applied_in_demo_workspace():
    run = handle_incident('roi')
    assert run.auto_remediated
    applied = Path(run.applied_path)
    assert applied.is_file()
    assert applied.read_text() == (Path(run.artifact_path).parent / 'proposed.sql').read_text()
    assert applied.read_text() != read_sql(load_incident('roi').sql_file)
    assert verify_sql('roi', applied.read_text())['passed']
    assert not run.alert_path


def test_regulated_incident_keeps_sql_and_raises_owner_alert():
    import json
    run = handle_incident('ggr')
    assert not run.auto_remediated and not run.applied_path
    folder = Path(run.artifact_path).parent
    target = folder / 'workspace' / run.incident.sql_file
    assert target.read_text() == read_sql(run.incident.sql_file)
    alert = json.loads(Path(run.alert_path).read_text())
    assert alert['status'] == 'OPEN'
    assert set(alert['owners']) == {'controller', 'regulatory-compliance'}
    assert alert['sql_unchanged'] and not alert['external_message_sent']
    assert not (folder / 'APPLIED.json').exists()


def test_invalid_agent_fix_raises_alert_without_applying(monkeypatch):
    monkeypatch.setattr(agents, 'live_triage', lambda incident,*_: fixture_triage(incident))
    monkeypatch.setattr(agents, 'live_fix', lambda *_: 'select 1 as wrong')
    run = handle_incident('roi', mode='live')
    assert not run.auto_remediated and not run.applied_path
    assert Path(run.alert_path).is_file()
    assert (Path(run.artifact_path).parent / 'workspace' / run.incident.sql_file).read_text() == read_sql(run.incident.sql_file)
