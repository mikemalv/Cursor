import { conn } from "./conn.ts";

const ACTIVITY_COLUMNS = ["player_id", "property_id", "play_dt", "theo_win", "tier_cd", "host_id"];

export async function recentActivity(playerId: number) {
  const sql = `
    select ${ACTIVITY_COLUMNS.join(", ")}
    from analytics.player_activity
    where player_id = ?
      and play_dt >= dateadd(day, -30, current_date())
    order by play_dt desc`;
  return conn.query(sql, [playerId]);
}

export async function hostBook(hostId: number) {
  // Column list built at runtime -- a naive grep for "HOST_ID" in .sql files misses this.
  return conn.query(
    "select distinct player_id, host_id from analytics.player_activity where host_id = ?",
    [hostId],
  );
}
