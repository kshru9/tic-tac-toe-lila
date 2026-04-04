/**
 * Nakama runtime initialization for Tic-Tac-Toe
 * 
 * This module initializes the multiplayer game runtime.
 * Gamma 2 implements the authoritative multiplayer core.
 */
function InitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
) {
  logger.info('Tic-Tac-Toe runtime module initializing (Gamma 2)');
  
  // Register RPC endpoints
  initializer.registerRpc('health', healthRpc);
  initializer.registerRpc('create_room', createRoomRpc);
  initializer.registerRpc('join_room', joinRoomRpc);
  initializer.registerRpc('list_rooms', listRoomsRpc);
  initializer.registerRpc('quick_play', quickPlayRpc);
  
  // Register match handler
  initializer.registerMatch('tic_tac_toe', matchHandler);
  
  logger.info('Tic-Tac-Toe runtime module initialized (Gamma 2 multiplayer core)');
}

/**
 * Health check RPC endpoint
 */
function healthRpc(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  return JSON.stringify({
    status: 'healthy',
    service: 'tic-tac-toe',
    stage: 'gamma-2-multiplayer-core',
    timestamp: Date.now()
  });
}
