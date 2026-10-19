import json
from pathlib import Path

from count_room import demo_web


def test_every_excerpt_matches_its_current_file():
    bundle = demo_web.source_code()
    for snippet in bundle['snippets'].values():
        lines = Path(bundle['files'][snippet['file']]['path']).read_text().splitlines()
        start = snippet['start'] - 1
        assert snippet['lines'] == lines[start:start + len(snippet['lines'])]
    assert 'verification =' in '\n'.join(bundle['snippets']['verify_proposal']['lines'])


def test_source_only_refresh_preserves_evidence_and_never_runs_agents(monkeypatch, tmp_path):
    bundle = demo_web.source_code()
    target = tmp_path / 'web' / 'demo-data.js'
    target.parent.mkdir()
    original = {'roi': {'run_id': 'live-run', 'files': {'patch.diff': 'saved SQL'}},
                'ggr': {'run_id': 'regulated-run'}, 'source_code': {'old': True}}
    target.write_text('window.COUNT_ROOM_DATA = ' + json.dumps(original) + ';\n')
    monkeypatch.setattr(demo_web, 'ROOT', tmp_path)
    monkeypatch.setattr(demo_web, 'source_code', lambda: bundle)
    def unexpected_run(*args, **kwargs):
        raise AssertionError('source refresh must not execute a scenario')
    monkeypatch.setattr(demo_web, 'payload', unexpected_run)
    demo_web.export(source_only=True)
    updated = json.loads(target.read_text().split('=', 1)[1].strip().removesuffix(';'))
    assert updated == {**original, 'source_code': bundle}
