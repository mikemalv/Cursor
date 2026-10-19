{{ config(materialized='incremental', unique_key=['player_id','play_dt']) }}

select
    player_id,
    property_id,
    play_dt,
    theo_win,
    comp_points,
    tier_cd            as tier_code,
    host_id,
    count(*)           as trip_count
from {{ source('analytics', 'player_activity') }}
where play_dt >= dateadd(day, -90, current_date())
group by 1,2,3,4,5,6,7
