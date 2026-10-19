import pytest

from count_room.warehouse import Warehouse, WarehouseDenied, assert_select_only


@pytest.mark.parametrize(
    "sql",
    [
        "select 1",
        "SELECT campaign_id FROM analytics.marketing.campaign_roi",
        "with x as (select 1 as n) select * from x",
    ],
)
def test_allows_select(sql):
    assert assert_select_only(sql)


@pytest.mark.parametrize(
    "sql",
    [
        "insert into t values (1)",
        "update t set a = 1",
        "delete from t",
        "create table t (a int)",
        "alter table t set tag foo = 'bar'",
        "drop table t",
        "grant select on t to role marketing",
        "create schema dev clone analytics.marketing",
        "select 1; drop table t",
        "",
        "explain select 1",
    ],
)
def test_denies_writes_and_multi_statements(sql):
    with pytest.raises(WarehouseDenied):
        assert_select_only(sql)


def test_fixture_profile_lookup():
    wh = Warehouse()
    out = wh.select(
        "select campaign_id, sum(impressions) as impressions "
        "from analytics.marketing.campaign_daily group by 1",
        incident_id="roi",
    )
    assert "3 of 412" in out["summary"]


def test_denied_select_does_not_hit_fixtures():
    wh = Warehouse()
    with pytest.raises(WarehouseDenied):
        wh.select("update analytics.marketing.campaign_roi set roi = 0")
