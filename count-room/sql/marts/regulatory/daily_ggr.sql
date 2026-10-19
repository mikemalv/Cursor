-- ANALYTICS.REGULATORY.DAILY_GROSS_GAMING_REVENUE
-- Tagged GOVERNANCE.REGULATORY_SCOPE = NGCB_MICS.
-- Feeds the monthly revenue report filed with the Nevada Gaming Control Board.
-- Planted bug: calendar day instead of the property's 06:00–06:00 gaming day.

select
    date_trunc('day', wager_ts) as gaming_day,
    property_id,
    sum(coin_in) as coin_in,
    sum(coin_out) as coin_out,
    sum(coin_in) - sum(coin_out) as gross_gaming_revenue
from analytics.regulatory.slot_wagers
group by 1, 2
;
