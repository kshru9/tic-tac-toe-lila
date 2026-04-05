/**
 * Nakama runtime initialization for Tic-Tac-Toe
 * 
 * This module initializes the multiplayer game runtime.
 * Gamma 3 adds leaderboard with streak tracking.
 */
function InitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
) {
  logger.info('Tic-Tac-Toe runtime module initializing (Gamma 3)');
  
  // Register RPC endpoints
  initializer.registerRpc('health', healthRpc);
  initializer.registerRpc('create_room', createRoomRpc);
  initializer.registerRpc('join_room', joinRoomRpc);
  initializer.registerRpc('list_rooms', listRoomsRpc);
  initializer.registerRpc('quick_play', quickPlayRpc);
  initializer.registerRpc('get_leaderboard', getLeaderboardRpc);
  
  // Register match handler
  initializer.registerMatch('tic_tac_toe', matchHandler);
  
  logger.info('Tic-Tac-Toe runtime module initialized (Gamma 3 with leaderboard)');
}

/**
 * Health check RPC endpoint
 */
function healthRpc(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  return JSON.stringify({
    status: 'healthy',
    service: 'tic-tac-toe',
    stage: 'gamma-3-with-leaderboard',
    timestamp: Date.now()
  });
}
