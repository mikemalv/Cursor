select
    campaign_id,
    campaign_name,
    sum(spend) as spend,
    sum(impressions) as impressions,
    sum(spend) / nullif(sum(impressions), 0) as roi
from analytics.marketing.campaign_daily
group by 1, 2
;
