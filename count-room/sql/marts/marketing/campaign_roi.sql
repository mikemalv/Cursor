-- ANALYTICS.MARKETING.CAMPAIGN_ROI
-- Nightly marketing mart. Untagged — STANDARD zone.
-- Planted bug: divide-by-zero when a campaign has zero impressions.

select
    campaign_id,
    campaign_name,
    sum(spend) as spend,
    sum(impressions) as impressions,
    sum(spend) / sum(impressions) as roi
from analytics.marketing.campaign_daily
group by 1, 2
;
