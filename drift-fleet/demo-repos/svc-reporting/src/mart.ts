/**
 * SOX-scoped. Feeds externally reported gaming revenue figures.
 * Changes here follow the controlled change process -- an agent may prepare the
 * package, but it may not open the pull request.
 */
export const PlayerActivityMapping = {
  table: "ANALYTICS.PLAYER_ACTIVITY",
  columns: {
    playerId: "PLAYER_ID",
    propertyId: "PROPERTY_ID",
    playDate: "PLAY_DT",
    theoreticalWin: "THEO_WIN",
    compPoints: "COMP_POINTS",
    tierCode: "TIER_CD",
    hostId: "HOST_ID",
  },
} as const;
