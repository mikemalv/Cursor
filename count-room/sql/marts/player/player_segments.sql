-- ANALYTICS.PLAYER.PLAYER_SEGMENTS
-- Inherits GOVERNANCE.DATA_CLASSIFICATION = RESTRICTED_PII from the schema.
-- Planted bug: SELECT * pulled EMAIL and DATE_OF_BIRTH into a mart
-- the marketing analyst role can read.

select *
from analytics.player.player_profile
;
