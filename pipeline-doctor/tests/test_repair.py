from pathlib import Path
import shutil
import pytest
import agent
from checks import verify

ROOT=Path(__file__).resolve().parents[1]

@pytest.fixture
def project(tmp_path,monkeypatch):
    shutil.copytree(ROOT/'fixtures',tmp_path/'fixtures')
    shutil.copyfile(ROOT/'CONTRACT.md',tmp_path/'CONTRACT.md')
    monkeypatch.setattr(agent,'ROOT',tmp_path)
    return tmp_path


def test_original_reproduces_both_failures():
    result=verify(ROOT/'fixtures/broken_report.py')
    checks={c['name']:c for c in result['checks']}
    assert checks['ordinary campaign']['passed']
    assert 'ZeroDivisionError' in checks['zero clicks remains visible']['error']
    assert 'ValueError' in checks['empty result set']['error']


def test_reference_preserves_contract():
    result=verify(ROOT/'fixtures/fixed_report.py')
    assert result['passed'] and len(result['checks'])==6


def test_fixture_changes_real_workspace_and_saves_evidence(project):
    result=agent.execute()
    target=Path(result['workspace'])/'campaign_report.py'
    assert result['passed']
    assert target.read_text()==result['files']['after.py']
    assert target.read_text()!=result['files']['before.py']
    assert not verify(project/'fixtures/broken_report.py')['passed']
    assert 'rate' in result['files']['patch.diff']


def test_bad_agent_change_is_never_replaced_with_fixture(project,monkeypatch):
    def bad(workspace,record):
        (workspace/'campaign_report.py').write_text('def summarize_campaigns(records):\n    return {}\n')
    monkeypatch.setattr(agent,'live_repair',bad)
    result=agent.execute('live')
    assert not result['passed']
    assert 'return {}' in result['files']['after.py']


def test_agent_error_remains_a_failure(project,monkeypatch):
    def fail(*args):raise RuntimeError('transport unavailable')
    monkeypatch.setattr(agent,'live_repair',fail)
    result=agent.execute('live')
    assert not result['passed'] and 'transport unavailable' in result['error']
    assert result['files']['before.py']==result['files']['after.py']


def test_agent_cannot_change_contract_to_claim_success(project,monkeypatch):
    def bad(workspace,record):
        shutil.copyfile(project/'fixtures/fixed_report.py',workspace/'campaign_report.py')
        (workspace/'CONTRACT.md').write_text('Anything passes')
    monkeypatch.setattr(agent,'live_repair',bad)
    assert not agent.execute('live')['passed']
