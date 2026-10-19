from copy import deepcopy

import pytest

from count_room.catalog import load_incident, load_policy, load_tags
from count_room.gate import decide, may_auto_remediate, may_instantiate_fix, zone_from_tags
from count_room.pipeline import fixture_triage
from count_room.types import Tag, TriageResult


@pytest.fixture
def policy():
    return load_policy()


@pytest.fixture
def snapshot():
    return load_tags()


def triage(objects, files=(), confidence=0.9):
    return TriageResult(
        incident_id="test",
        hypothesis="",
        suspect_files=tuple(files),
        suspect_objects=tuple(objects),
        confidence=confidence,
    )


def test_untagged_marketing_mart_is_standard_and_auto(policy, snapshot):
    d = decide(policy, triage(["ANALYTICS.MARKETING.CAMPAIGN_ROI"]), snapshot)
    assert d.zone.id == "STANDARD"
    assert may_auto_remediate(d)
    assert may_instantiate_fix(d)


def test_player_segments_inherits_pii_from_schema(policy, snapshot):
    d = decide(policy, triage(["ANALYTICS.PLAYER.PLAYER_SEGMENTS"]), snapshot)
    assert d.zone.id == "RESTRICTED_PII"
    assert d.deciding_tag is not None
    assert d.deciding_tag.inherited_from == "ANALYTICS.PLAYER"
    assert d.zone.actions.requires_human
    assert d.zone.actions.output == "evidence_package"
    assert may_auto_remediate(d) is False
    assert may_instantiate_fix(d) is True


def test_ggr_is_ngcb_and_never_patched(policy, snapshot):
    d = decide(policy, triage(["ANALYTICS.REGULATORY.DAILY_GROSS_GAMING_REVENUE"]), snapshot)
    assert d.zone.id == "NGCB_MICS"
    assert may_auto_remediate(d) is False
    assert may_instantiate_fix(d) is False
    assert d.zone.actions.output == "compliance_dossier"


def test_strictest_zone_wins_across_objects(policy, snapshot):
    d = decide(
        policy,
        triage(
            [
                "ANALYTICS.MARKETING.CAMPAIGN_ROI",
                "ANALYTICS.REGULATORY.DAILY_GROSS_GAMING_REVENUE",
            ]
        ),
        snapshot,
    )
    assert d.zone.id == "NGCB_MICS"
    assert may_instantiate_fix(d) is False


def test_low_confidence_blocks_auto_even_in_standard(policy, snapshot):
    d = decide(policy, triage(["ANALYTICS.MARKETING.CAMPAIGN_ROI"], confidence=0.3), snapshot)
    assert d.escalated_for_low_confidence
    assert may_auto_remediate(d) is False


def test_lookup_miss_fails_closed(policy, snapshot):
    d = decide(policy, triage(["ANALYTICS.UNKNOWN.NOPE"]), snapshot)
    assert d.fail_closed
    assert d.zone.id == "NGCB_MICS"
    assert may_instantiate_fix(d) is False


def test_untagged_sibling_in_tagged_schema_escalates(policy, snapshot):
    snap = deepcopy(snapshot)
    snap["schemas"]["ANALYTICS.SANDBOX"] = []
    snap["objects"]["ANALYTICS.SANDBOX.TAGGED_TABLE"] = [
        {"name": "GOVERNANCE.DATA_CLASSIFICATION", "value": "RESTRICTED_PII", "inherited_from": None}
    ]
    snap["objects"]["ANALYTICS.SANDBOX.ORPHAN_MART"] = []
    d = decide(policy, triage(["ANALYTICS.SANDBOX.ORPHAN_MART"]), snap)
    assert d.fail_closed
    assert d.zone.id == "RESTRICTED_PII"
    assert may_auto_remediate(d) is False


def test_refuses_empty_triage(policy, snapshot):
    with pytest.raises(ValueError):
        decide(policy, triage([]), snapshot)


def test_zone_from_tags_picks_strictest():
    zone, tag = zone_from_tags(
        [
            Tag("GOVERNANCE.DATA_CLASSIFICATION", "RESTRICTED_PII"),
            Tag("GOVERNANCE.REGULATORY_SCOPE", "NGCB_MICS"),
        ]
    )
    assert zone == "NGCB_MICS"
    assert tag is not None
    assert tag.value == "NGCB_MICS"


@pytest.mark.parametrize("incident_id, zone", [("roi", "STANDARD"), ("pii", "RESTRICTED_PII"), ("ggr", "NGCB_MICS")])
def test_fixture_incidents_match_expected_zone(policy, incident_id, zone):
    incident = load_incident(incident_id)
    d = decide(policy, fixture_triage(incident))
    assert d.zone.id == zone
    assert d.zone.id == incident.expected_zone


def test_unmapped_suspect_file_never_authorizes_proposal(policy, snapshot):
    with pytest.raises(ValueError, match='Unmapped suspect file'):
        decide(policy, triage(['ANALYTICS.MARKETING.CAMPAIGN_ROI'], files=['sql/unknown.sql']), snapshot)
