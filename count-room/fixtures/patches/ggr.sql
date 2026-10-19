-- Attachment only. Never applied by the agent.
-- Gaming day is 06:00 local to 06:00 the next calendar day.

select
    date_trunc('day', dateadd('hour', -6, wager_ts)) as gaming_day,
    property_id,
    sum(coin_in) as coin_in,
    sum(coin_out) as coin_out,
    sum(coin_in) - sum(coin_out) as gross_gaming_revenue
from analytics.regulatory.slot_wagers
group by 1, 2
;
