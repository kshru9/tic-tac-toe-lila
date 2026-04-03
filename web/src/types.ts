// Connection state for multiplayer service
export type ConnectionState = 
  | 'connecting' 
  | 'connected' 
  | 'reconnecting' 
  | 'disconnected';

// Game mode (currently only classic Tic-Tac-Toe)
export type GameMode = 'classic';

// Player symbols
export type PlayerSymbol = 'X' | 'O';

// Match phases
export type MatchPhase = 
  | 'waiting_for_opponent' 
  | 'ready' 
  | 'in_progress' 
  | 'reconnect_grace' 
  | 'completed';

// Player identity for nickname-first entry
export interface PlayerIdentity {
  nickname: string;
  deviceId: string;
  joinedAt: number;
}

// Room summary for public discovery (Gamma 2 authoritative shape)
export interface RoomSummary {
  matchId: string;
  roomCode: string;
  mode: 'classic';
  playerCount: number;
  maxPlayers: 2;
}

// Room discovery item (legacy Gamma 1 shape, kept for compatibility)
export interface RoomDiscoveryItem {
  roomId: string;
  roomCode: string;
  hostNickname: string;
  playerCount: number;
  maxPlayers: number;
  createdAt: number;
}

// Shell action result for lobby actions
export interface ShellActionResult<T = void> {
  success: boolean;
  message: string;
  data?: T;
}

// App view/status
export type AppView = 
  | 'loading' 
  | 'nickname_entry' 
  | 'lobby' 
  | 'match';

// Client session persistence
export interface ClientSession {
  identity: PlayerIdentity;
  sessionToken?: string;
  refreshToken?: string;
  lastConnectedAt?: number;
}

// Quick play options
export interface QuickPlayOptions {
  gameMode: GameMode;
  timeoutSeconds?: number;
}

// Create room options
export interface CreateRoomOptions {
  roomCode?: string;
  maxPlayers?: number;
  isPrivate?: boolean;
}

// Join room options
export interface JoinRoomOptions {
  roomCode: string;
}

// Player seat state
export interface PlayerSeatState {
  userId: string;
  nickname: string;
  connected: boolean;
}

// Match outcome reasons
export type MatchOutcomeReason = 
  | 'win_row' 
  | 'win_column' 
  | 'win_diagonal' 
  | 'draw_full_board' 
  | 'disconnect_forfeit';

// Public match state (canonical state broadcast from server)
export interface PublicMatchState {
  matchId: string;
  roomCode: string;
  mode: 'classic';
  phase: MatchPhase;
  board: Array<null | 'X' | 'O'>;
  playerX: PlayerSeatState | null;
  playerO: PlayerSeatState | null;
  currentTurn: 'X' | 'O' | null;
  winner: 'X' | 'O' | null;
  outcomeReason: MatchOutcomeReason | null;
  moveCount: number;
  createdAt: number;
  updatedAt: number;
  reconnectDeadlineAt: number | null;
}

// Room join result (legacy composite type - prefer using specific RPC result types)
export interface RoomJoinResult {
  matchId: string;
  roomCode: string;
  mode: 'classic';
  isPrivate?: boolean;
  joinedExisting?: boolean;
}

// Room list item (alias to RoomSummary for Gamma 2 clarity)
export type RoomListItem = RoomSummary;

// Match action reject reasons
export type MatchActionRejectReason = 
  | 'not_your_turn' 
  | 'cell_taken' 
  | 'game_not_in_progress' 
  | 'invalid_payload';

// Gamma 2 RPC error reasons
export type RoomRpcErrorReason = 
  | 'invalid_room_code'
  | 'room_not_found'
  | 'room_not_joinable'
  | 'failed_to_create_room'
  | 'failed_to_join_room'
  | 'failed_to_list_rooms'
  | 'failed_to_quick_play'
  | 'invalid_payload';

// Gamma 2 RPC error result
export interface RpcErrorResult {
  success: false;
  error: RoomRpcErrorReason;
  message: string;
}

// Special error result for list_rooms that includes empty rooms array
export interface ListRoomsRpcErrorResult extends RpcErrorResult {
  rooms: [];
}

// Gamma 2 RPC success results
export interface CreateRoomRpcSuccess {
  success: true;
  matchId: string;
  roomCode: string;
  isPrivate: boolean;
  mode: 'classic';
}

export interface JoinRoomRpcSuccess {
  success: true;
  matchId: string;
  roomCode: string;
  mode: 'classic';
}

export interface QuickPlayRpcSuccess {
  success: true;
  matchId: string;
  roomCode: string;
  mode: 'classic';
  joinedExisting: boolean;
}

export interface ListRoomsRpcSuccess {
  success: true;
  rooms: RoomSummary[];
}

// Gamma 2 RPC result unions
export type CreateRoomRpcResult = CreateRoomRpcSuccess | RpcErrorResult;
export type JoinRoomRpcResult = JoinRoomRpcSuccess | RpcErrorResult;
export type QuickPlayRpcResult = QuickPlayRpcSuccess | RpcErrorResult;
export type ListRoomsRpcResult = ListRoomsRpcSuccess | ListRoomsRpcErrorResult;

// Realtime message types
export interface MoveIntentPayload {
  index: number;
}

export interface ActionRejectPayload {
  reason: MatchActionRejectReason;
  message?: string;
}

// Match event types for app layer
export type MatchEventType = 'state_sync' | 'action_rejected' | 'match_joined' | 'match_left';

export interface MatchEvent {
  type: MatchEventType;
  data: any;
}

// Active match context
export interface ActiveMatchContext {
  matchId: string;
  roomCode: string;
  playerSymbol: 'X' | 'O' | null;
}