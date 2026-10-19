-- Legacy nightly export. Not referenced by any dbt model or ORM mapping;
-- discovered only by a scout that reads SQL files as well as source code.
copy into @export_stage/host_book/
from (
  select player_id, host_id, tier_cd, theo_win
  from analytics.player_activity
  where play_dt = current_date() - 1
)
file_format = (type = csv);
