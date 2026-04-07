/**
 * Authoritative Nakama match handler for classic Tic-Tac-Toe
 */

// Constants
const GRACE_WINDOW_MS = 30000; // 30 seconds for reconnect grace
const TURN_MS = 30000; // 30 seconds per turn in timed mode
const WAITING_ROOM_TTL_MS = 5 * 60 * 1000; // 5 minutes for waiting room expiry (Gamma 2)
const EMPTY_ROOM_DISSOLVE_MS = 15000; // 15 seconds for empty room dissolve (Gamma 2)
const ROOM_CODE_LENGTH = 6;
const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MAX_ACTION_HISTORY = 30; // Keep last 30 action IDs per player for duplicate detection

// Match op-codes
const OP_CODE_MOVE_INTENT = 1;
const OP_CODE_STATE_SYNC = 2;
const OP_CODE_ACTION_REJECTED = 3;
const OP_CODE_REMATCH_REQUEST = 4;
const OP_CODE_REMATCH_ACCEPT = 5;

// Match phases
type MatchPhase = 
  | 'waiting_for_opponent' 
  | 'ready' 
  | 'in_progress' 
  | 'reconnect_grace' 
  | 'completed';

// Player seat state
interface PlayerSeatState {
  userId: string;
  nickname: string;
  connected: boolean;
}

// Internal match state
interface TicTacToeMatchState {
  // Public fields
  matchId: string;
  roomCode: string;
  mode: 'classic' | 'timed';
  phase: MatchPhase;
  board: BoardState;
  playerX: PlayerSeatState | null;
  playerO: PlayerSeatState | null;
  currentTurn: 'X' | 'O' | null;
  winner: 'X' | 'O' | null;
  outcomeReason: OutcomeReason | null;
  moveCount: number;
  createdAt: number;
  updatedAt: number;
  reconnectDeadlineAt: number | null;
  version: number;
  turnDeadlineAt: number | null;
  remainingTurnMs: number | null;
  
  // Internal fields
  visibility: 'public' | 'private';
  creatorUserId: string | null;
  creatorNickname: string | null;
  // Duplicate action tracking
  lastActionIdsX: string[];
  lastActionIdsO: string[];
  // Gamma 2: rematch handshake flags
  rematchRequestedByX: boolean;
  rematchRequestedByO: boolean;
  // Gamma 2: empty room dissolve tracking
  emptySinceAt: number | null;
  // Gamma 3: leaderboard stats commit guard
  statsCommitted: boolean;
}

/** Parse join metadata into a seat nickname (object, alternate keys, or JSON string). */
function nicknameFromJoinMetadata(md: any): string {
  if (md == null || md === '') return 'Player';
  if (typeof md === 'string') {
    var t = md.trim();
    if (t.length === 0) return 'Player';
    if (t.charAt(0) === '{' || t.charAt(0) === '[') {
      try {
        return nicknameFromJoinMetadata(JSON.parse(t));
      } catch (_e) {
        return t;
      }
    }
    return t;
  }
  if (typeof md === 'object') {
    var raw =
      md.nickname != null
        ? md.nickname
        : md.Nickname != null
          ? md.Nickname
          : md.nick_name;
    if (raw == null || raw === undefined) return 'Player';
    var s = String(raw).trim();
    return s.length > 0 ? s : 'Player';
  }
  return 'Player';
}

/** Read nickname from a seat for leaderboard (camelCase or snake_case wire keys). */
function nicknameFromSeatField(seat: PlayerSeatState | null | undefined): string | null {
  if (!seat) return null;
  var seatAny = seat as any;
  var raw =
    seatAny.nickname != null
      ? seatAny.nickname
      : seatAny.Nickname != null
        ? seatAny.Nickname
        : seatAny.nick_name;
  if (raw == null || raw === undefined) return null;
  var st = String(raw).trim();
  return st.length > 0 ? st : null;
}

/**
 * Best-effort display nickname for leaderboard: seat first, else room-creator RPC name when seat is still default.
 */
function leaderboardNicknameForSeat(state: TicTacToeMatchState, seat: PlayerSeatState | null | undefined): string | null {
  if (!seat || !seat.userId) return null;
  var fromSeat = nicknameFromSeatField(seat);
  var creatorTrim = state.creatorNickname != null ? String(state.creatorNickname).trim() : '';
  if (state.creatorUserId === seat.userId && creatorTrim.length > 0) {
    if (fromSeat == null || fromSeat === 'Player') return creatorTrim;
  }
  return fromSeat;
}

// Move intent payload
interface MoveIntentPayload {
  index: number;
  actionId: string;
  expectedVersion: number;
  expectedTurn: 'X' | 'O';
}

// Action rejection payload
interface ActionRejectPayload {
  reason: 'not_your_turn' | 'cell_taken' | 'game_not_in_progress' | 'invalid_payload' | 'reconnect_in_progress' | 'stale_state' | 'duplicate_action';
  message?: string;
  state?: any; // Public state snapshot
}

// Match label structure
interface MatchLabel {
  roomCode: string;
  visibility: 'public' | 'private';
  mode: 'classic' | 'timed';
  phase: MatchPhase;
  occupancy: 0 | 1 | 2;
  open: boolean;
  // Gamma 2: waiting room expiry support
  expiresAt: number | null;
}

/**
 * Generate a random room code
 */
function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ALPHANUMERIC[Math.floor(Math.random() * ALPHANUMERIC.length)];
  }
  return code;
}

/**
 * Decode Uint8Array to string without using TextDecoder (not available in Nakama runtime)
 */
function decodeUint8ArrayToString(uint8Array: Uint8Array): string {
  let result = '';
  for (let i = 0; i < uint8Array.length; i++) {
    result += String.fromCharCode(uint8Array[i]);
  }
  return result;
}

/**
 * Decode ArrayBuffer to string without using TextDecoder
 */
function decodeArrayBufferToString(arrayBuffer: ArrayBuffer): string {
  const uint8Array = new Uint8Array(arrayBuffer);
  return decodeUint8ArrayToString(uint8Array);
}

/**
 * Serialize internal state to public canonical state
 */
function getPublicState(state: TicTacToeMatchState): any {
  // JSON.stringify omits `undefined` keys; clients must always see a turn while in play.
  let currentTurn: 'X' | 'O' | null | undefined = state.currentTurn;
  if (state.phase === 'in_progress' && state.winner == null) {
    currentTurn = currentTurn ?? 'X';
  }
  return {
    matchId: state.matchId,
    roomCode: state.roomCode,
    mode: state.mode,
    phase: state.phase,
    board: state.board,
    playerX: state.playerX,
    playerO: state.playerO,
    currentTurn,
    winner: state.winner,
    outcomeReason: state.outcomeReason,
    moveCount: state.moveCount,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    reconnectDeadlineAt: state.reconnectDeadlineAt,
    version: state.version,
    turnDeadlineAt: state.turnDeadlineAt,
    remainingTurnMs: state.remainingTurnMs,
    // Gamma 2: Include rematch handshake state
    rematchRequestedByX: state.rematchRequestedByX,
    rematchRequestedByO: state.rematchRequestedByO,
    statsCommitted: state.statsCommitted
  };
}

/**
 * Update match label
 */
function buildMatchLabel(state: TicTacToeMatchState): MatchLabel {
  const occupancy: 0 | 1 | 2 = 
    (state.playerX ? 1 : 0) + (state.playerO ? 1 : 0) as 0 | 1 | 2;
  
  // "open" means joinable (by code or public discovery). Discovery still filters visibility=public.
  const open =
    state.phase === 'waiting_for_opponent' &&
    occupancy < 2;
  
  // Gamma 2: Calculate waiting room expiry timestamp
  let expiresAt: number | null = null;
  if (state.phase === 'waiting_for_opponent' && occupancy < 2) {
    expiresAt = state.createdAt + WAITING_ROOM_TTL_MS;
  }
  
  return {
    roomCode: state.roomCode,
    visibility: state.visibility,
    mode: state.mode,
    phase: state.phase,
    occupancy,
    open,
    expiresAt
  };
}

function buildMatchLabelString(state: TicTacToeMatchState): string {
  return JSON.stringify(buildMatchLabel(state));
}

function updateMatchLabel(state: TicTacToeMatchState, dispatcher: nkruntime.MatchDispatcher): void {
  // matchLabelUpdate is exposed on the dispatcher (not nk) in the TS runtime.
  const fn = (dispatcher as any).matchLabelUpdate as undefined | ((label: string) => void);
  if (!fn) return;
  fn(buildMatchLabelString(state));
}

/**
 * Broadcast canonical state to all connected players.
 *
 * In the TS runtime, realtime sends happen via the dispatcher (not nk).
 */
function broadcastState(state: TicTacToeMatchState, dispatcher: nkruntime.MatchDispatcher): void {
  const publicState = getPublicState(state);
  dispatcher.broadcastMessage(OP_CODE_STATE_SYNC, JSON.stringify(publicState));
}

/**
 * Get player symbol from presence
 */
function getPlayerSymbol(state: TicTacToeMatchState, userId: string): 'X' | 'O' | null {
  if (state.playerX && state.playerX.userId === userId) return 'X';
  if (state.playerO && state.playerO.userId === userId) return 'O';
  return null;
}

/**
 * Helper to bump version and update timestamp
 */
function bumpVersion(state: TicTacToeMatchState): void {
  state.version++;
  state.updatedAt = Date.now();
}

/**
 * Track action ID for duplicate detection
 */
function trackActionId(state: TicTacToeMatchState, symbol: 'X' | 'O', actionId: string): void {
  const actionIds = symbol === 'X' ? state.lastActionIdsX : state.lastActionIdsO;
  actionIds.push(actionId);
  
  // Keep bounded history
  if (actionIds.length > MAX_ACTION_HISTORY) {
    actionIds.shift(); // Remove oldest
  }
}

/**
 * Check if action ID is a duplicate
 */
function isDuplicateAction(state: TicTacToeMatchState, symbol: 'X' | 'O', actionId: string): boolean {
  const actionIds = symbol === 'X' ? state.lastActionIdsX : state.lastActionIdsO;
  return actionIds.includes(actionId);
}

/**
 * Set turn deadline for timed mode
 */
function setTurnDeadline(state: TicTacToeMatchState): void {
  if (state.mode === 'timed' && state.phase === 'in_progress' && state.currentTurn) {
    state.turnDeadlineAt = Date.now() + TURN_MS;
    state.remainingTurnMs = null;
  } else {
    state.turnDeadlineAt = null;
    state.remainingTurnMs = null;
  }
}

/**
 * Pause timer during reconnect grace
 */
function pauseTimer(state: TicTacToeMatchState): void {
  if (state.mode === 'timed' && state.turnDeadlineAt) {
    state.remainingTurnMs = Math.max(0, state.turnDeadlineAt - Date.now());
    state.turnDeadlineAt = null;
  }
}

/**
 * Resume timer after reconnect
 */
function resumeTimer(
  state: TicTacToeMatchState,
  nk?: nkruntime.Nakama,
  logger?: nkruntime.Logger
): void {
  if (state.mode === 'timed' && state.remainingTurnMs !== null) {
    if (state.remainingTurnMs <= 0) {
      // Timeout after reconnect grace: finalize with nk/logger when available so stats commit.
      handleTimeoutForfeit(state, nk, logger);
    } else {
      state.turnDeadlineAt = Date.now() + state.remainingTurnMs;
      state.remainingTurnMs = null;
    }
  }
}

/**
 * Handle timeout forfeit
 */
function handleTimeoutForfeit(
  state: TicTacToeMatchState,
  nk?: nkruntime.Nakama,
  logger?: nkruntime.Logger
): void {
  if (state.phase !== 'in_progress' || !state.currentTurn) return;
  
  state.phase = 'completed';
  state.outcomeReason = 'timeout_forfeit';
  state.winner = state.currentTurn === 'X' ? 'O' : 'X';
  state.currentTurn = null;
  state.turnDeadlineAt = null;
  state.remainingTurnMs = null;
  bumpVersion(state);
  
  // Gamma 3: Finalize match completion if nk and logger are provided
  if (nk && logger) {
    finalizeMatchCompletion(state, nk, logger);
  }
}

/**
 * Check if match completion should update leaderboard stats
 */
function isLeaderboardEligibleCompletion(state: TicTacToeMatchState): boolean {
  if (state.phase !== 'completed') return false;
  if (!state.outcomeReason) return false;
  
  // Only real competitive outcomes should affect leaderboard
  const eligibleReasons: OutcomeReason[] = [
    'win_row',
    'win_column', 
    'win_diagonal',
    'draw_full_board',
    'timeout_forfeit',
    'disconnect_forfeit'
  ];
  
  if (!eligibleReasons.includes(state.outcomeReason)) {
    return false;
  }
  
  // Additional checks based on outcome type
  if (state.outcomeReason === 'draw_full_board') {
    // For draws, need both players
    return !!(state.playerX && state.playerX.userId && state.playerO && state.playerO.userId);
  } else {
    // For wins, need a winner and a loser
    if (!state.winner) return false;
    
    if (state.winner === 'X') {
      return !!(state.playerX && state.playerX.userId && state.playerO && state.playerO.userId);
    } else if (state.winner === 'O') {
      return !!(state.playerO && state.playerO.userId && state.playerX && state.playerX.userId);
    }
  }
  
  return false;
}

/**
 * Get player info for leaderboard updates
 */
function getPlayerInfoForLeaderboard(state: TicTacToeMatchState): {
  winnerUserId: string | null;
  winnerNickname: string | null;
  loserUserId: string | null;
  loserNickname: string | null;
  isDraw: boolean;
} {
  const isDraw = state.outcomeReason === 'draw_full_board';
  
  if (isDraw) {
    // For draws, both players are "winners" in the sense they get draw stats
    return {
      winnerUserId: state.playerX?.userId || null,
      winnerNickname: leaderboardNicknameForSeat(state, state.playerX),
      loserUserId: state.playerO?.userId || null,
      loserNickname: leaderboardNicknameForSeat(state, state.playerO),
      isDraw: true
    };
  }
  
  // For wins, determine winner and loser
  if (state.winner === 'X') {
    return {
      winnerUserId: state.playerX?.userId || null,
      winnerNickname: leaderboardNicknameForSeat(state, state.playerX),
      loserUserId: state.playerO?.userId || null,
      loserNickname: leaderboardNicknameForSeat(state, state.playerO),
      isDraw: false
    };
  } else if (state.winner === 'O') {
    return {
      winnerUserId: state.playerO?.userId || null,
      winnerNickname: leaderboardNicknameForSeat(state, state.playerO),
      loserUserId: state.playerX?.userId || null,
      loserNickname: leaderboardNicknameForSeat(state, state.playerX),
      isDraw: false
    };
  }
  
  // No winner determined (shouldn't happen for eligible completions)
  return {
    winnerUserId: null,
    winnerNickname: null,
    loserUserId: null,
    loserNickname: null,
    isDraw: false
  };
}

/**
 * Finalize match completion and update leaderboard stats if needed
 * This wrapper ensures stats are committed exactly once
 */
function finalizeMatchCompletion(
  state: TicTacToeMatchState,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): void {
  if (!isLeaderboardEligibleCompletion(state) || state.statsCommitted) {
    return;
  }

  logger.info('Gamma 3: Committing leaderboard stats for match ' + state.matchId + ', outcome: ' + state.outcomeReason);

  const info = getPlayerInfoForLeaderboard(state);
  const ok = commitMatchLeaderboardToStorage(
    nk,
    logger,
    info.winnerUserId,
    info.winnerNickname,
    info.loserUserId,
    info.loserNickname,
    info.isDraw
  );

  if (ok) {
    state.statsCommitted = true;
    logger.info('Gamma 3: Stats committed for match ' + state.matchId);
  }
}

/**
 * Check if a user can join the match
 */
function canUserJoin(state: TicTacToeMatchState, userId: string): { canJoin: boolean; reason?: string } {
  // Check if user is already in the match (reconnect)
  const existingSymbol = getPlayerSymbol(state, userId);
  if (existingSymbol) {
    // User is reconnecting to their existing seat
    // Allow reconnect even during reconnect_grace phase
    return { canJoin: true };
  }
  
  // Gamma 2: Check waiting room expiry
  if (state.phase === 'waiting_for_opponent') {
    const waitingRoomExpiryAt = state.createdAt + WAITING_ROOM_TTL_MS;
    if (Date.now() > waitingRoomExpiryAt) {
      return { canJoin: false, reason: 'Room has expired' };
    }
  }
  
  // Check if match is joinable
  if (state.phase === 'completed') {
    return { canJoin: false, reason: 'Match is completed' };
  }
  
  if (state.phase === 'reconnect_grace') {
    return { canJoin: false, reason: 'Match is in reconnect grace period' };
  }
  
  // Gamma 2: Check empty room dissolution
  if (state.emptySinceAt !== null) {
    const emptyRoomExpiryAt = state.emptySinceAt + EMPTY_ROOM_DISSOLVE_MS;
    if (Date.now() > emptyRoomExpiryAt) {
      return { canJoin: false, reason: 'Room has been dissolved' };
    }
  }
  
  // Check for empty seats
  if (!state.playerX) {
    return { canJoin: true };
  }
  
  if (!state.playerO) {
    return { canJoin: true };
  }
  
  return { canJoin: false, reason: 'Match is full' };
}

// Match handler implementation.
// Use ES5-friendly function expressions bound to top-level identifiers. Nakama's JS runtime
// extracts hook identifiers from global bindings and can be sensitive to other shapes.
var matchInit = function matchInit(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  params: { [key: string]: string }
): { state: TicTacToeMatchState; tickRate: number; label: string } {
  logger.info('TicTacToe match initializing');
  
  const roomCode = params.roomCode || generateRoomCode();
  const visibility = (params.visibility === 'private' ? 'private' : 'public') as 'public' | 'private';
  
  const creatorUserId = params.creatorUserId || null;
  const creatorNickname = params.creatorNickname || null;

  // Reserve the X seat for the match creator at creation time. This avoids races where:
  // - A room exists but isn't discoverable/joinable by code yet because no one has joined.
  // - A second player joins before the creator and takes X.
  //
  // The creator will mark as connected once they actually join via socket.
  const reservedCreatorSeat: PlayerSeatState | null =
    creatorUserId
      ? { userId: creatorUserId, nickname: creatorNickname || 'Player', connected: false }
      : null;

  const mode = (params.mode === 'timed' ? 'timed' : 'classic') as 'classic' | 'timed';
  logger.info('matchInit: Creating match with mode=' + mode + ', roomCode=' + roomCode);
  
  const state: TicTacToeMatchState = {
    matchId: ctx.matchId,
    roomCode,
    mode,
    phase: 'waiting_for_opponent',
    board: createEmptyBoard(),
    playerX: reservedCreatorSeat,
    playerO: null,
    currentTurn: 'X',
    winner: null,
    outcomeReason: null,
    moveCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    reconnectDeadlineAt: null,
    version: 1,
    turnDeadlineAt: null,
    remainingTurnMs: null,
    visibility,
    creatorUserId,
    creatorNickname,
    lastActionIdsX: [],
    lastActionIdsO: [],
    // Gamma 2: initialize new fields
    rematchRequestedByX: false,
    rematchRequestedByO: false,
    emptySinceAt: null,
    // Gamma 3: leaderboard stats commit guard
    statsCommitted: false
  };

	  // Set initial label via matchInit return contract.
	  return { state, tickRate: 1, label: buildMatchLabelString(state) };
};

var matchJoinAttempt = function matchJoinAttempt(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicTacToeMatchState,
  presence: nkruntime.Presence,
  metadata: { [key: string]: any }
): { state: TicTacToeMatchState; accept: boolean; rejectMessage?: string } {
  const userId = presence.userId;
  const nickname = nicknameFromJoinMetadata(metadata);
  
  const existingSymbol = getPlayerSymbol(state, userId);
  if (state.phase === 'reconnect_grace' && existingSymbol) {
    return { state, accept: true };
  }

  const joinCheck = canUserJoin(state, userId);
  if (!joinCheck.canJoin) {
    return {
      state,
      accept: false,
      rejectMessage: joinCheck.reason || 'Cannot join match'
    };
  }
  
  // User is allowed to join
  return { state, accept: true };
};

var matchJoin = function matchJoin(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicTacToeMatchState,
  presences: nkruntime.Presence[]
): { state: TicTacToeMatchState } {
  const now = Date.now();
  state.updatedAt = now;
  
  logger.info('matchJoin called for match ' + state.matchId + ', presences: ' + presences.length);
  
  for (const presence of presences) {
    const userId = presence.userId;
    logger.info('Processing join for user ' + userId + ', nickname from metadata: ' + (presence.metadata?.nickname || 'none'));
    const md: any = presence.metadata;
    let nickname = nicknameFromJoinMetadata(md);
    
    // Check if user is reconnecting to existing seat
    logger.info('playerX userId: ' + (state.playerX?.userId || 'null') + ', playerO userId: ' + (state.playerO?.userId || 'null'));
    const existingSymbol = getPlayerSymbol(state, userId);
    if (existingSymbol) {
      logger.info('User ' + userId + ' reconnecting to existing seat ' + existingSymbol);
      // Reconnect to existing seat and update nickname from metadata
      if (existingSymbol === 'X' && state.playerX) {
        state.playerX.connected = true;
        state.playerX.nickname = nickname;
        logger.info('Marked X seat as connected for user ' + userId + ' with nickname ' + nickname);
      } else if (existingSymbol === 'O' && state.playerO) {
        state.playerO.connected = true;
        state.playerO.nickname = nickname;
        logger.info('Marked O seat as connected for user ' + userId + ' with nickname ' + nickname);
      }
      
      // Clear reconnect deadline if we're in grace period
      if (state.phase === 'reconnect_grace') {
        state.reconnectDeadlineAt = null;
        state.phase = 'in_progress';
        // Resume timer for timed mode
        resumeTimer(state, nk, logger);
      }
    } else {
      // Gamma 2: Race-hardened seat assignment
      // Re-check joinability at the moment of actual seat assignment
      const joinCheck = canUserJoin(state, userId);
      if (!joinCheck.canJoin) {
        logger.info('Gamma 2: Join race detected - user ' + userId + ' cannot join anymore');
        // Skip this user but continue processing other presences
        continue;
      }
      
      // Assign to empty seat with atomic check
      if (!state.playerX) {
        state.playerX = {
          userId,
          nickname,
          connected: true
        };
        logger.info('Assigned user ' + userId + ' (' + nickname + ') to X seat');
      } else if (!state.playerO) {
        state.playerO = {
          userId,
          nickname,
          connected: true
        };
        logger.info('Assigned user ' + userId + ' (' + nickname + ') to O seat');
      } else {
        logger.info('Gamma 2: No empty seat available for user ' + userId + ' - race condition');
      }
    }
  }
  
  // Update phase based on occupancy
  const playerCount = (state.playerX ? 1 : 0) + (state.playerO ? 1 : 0);
  logger.info('Player count: ' + playerCount + ', current phase: ' + state.phase);
  if (playerCount === 1) {
    state.phase = 'waiting_for_opponent';
  } else if (playerCount === 2) {
    if (state.phase === 'waiting_for_opponent') {
      // Immediately transition to in_progress for simplicity
      state.phase = 'in_progress';
      // X always opens; repair any missing/undefined turn from persisted or edge-case state
      state.currentTurn = 'X';
      // Set initial turn deadline for timed mode
      setTurnDeadline(state);
      bumpVersion(state);
      logger.info('Match now has 2 players, transitioning to in_progress. Mode: ' + state.mode + ', turnDeadlineAt: ' + state.turnDeadlineAt);
    }
  }
  
  updateMatchLabel(state, dispatcher);
  // Broadcast updated state to ALL connected players, not just newly joined ones
  broadcastState(state, dispatcher);
  
  return { state };
};

var matchLeave = function matchLeave(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicTacToeMatchState,
  presences: nkruntime.Presence[]
): { state: TicTacToeMatchState } {
  const now = Date.now();
  state.updatedAt = now;
  
  for (const presence of presences) {
    const userId = presence.userId;
    const symbol = getPlayerSymbol(state, userId);
    
    if (symbol === 'X' && state.playerX) {
      state.playerX.connected = false;
    } else if (symbol === 'O' && state.playerO) {
      state.playerO.connected = false;
    }
  }

  // Gamma 2: Clear rematch flags for leaving players
  for (const presence of presences) {
    const userId = presence.userId;
    const symbol = getPlayerSymbol(state, userId);
    
    if (symbol === 'X' && state.rematchRequestedByX) {
      state.rematchRequestedByX = false;
    } else if (symbol === 'O' && state.rematchRequestedByO) {
      state.rematchRequestedByO = false;
    }
  }
  
  // If match was in progress and a player left, start reconnect grace
  if (state.phase === 'in_progress') {
    state.phase = 'reconnect_grace';
    state.reconnectDeadlineAt = now + GRACE_WINDOW_MS;
    // Pause timer for timed mode
    pauseTimer(state);
    bumpVersion(state);
  }
  // If match was waiting and a player left, keep waiting
  else if (state.phase === 'waiting_for_opponent') {
    // Match remains waiting, no special handling needed
  }
  
  updateMatchLabel(state, dispatcher);
  broadcastState(state, dispatcher);
  
  return { state };
};

var matchLoop = function matchLoop(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicTacToeMatchState,
  messages: nkruntime.MatchMessage[]
): { state: TicTacToeMatchState } {
  const now = Date.now();
  state.updatedAt = now;
  
  // Check for timeout forfeit in timed mode
  if (state.phase === 'in_progress' && state.mode === 'timed' && state.turnDeadlineAt && now >= state.turnDeadlineAt) {
    logger.info('DEBUG matchLoop: Timeout forfeit detected for turn ' + state.currentTurn);
    handleTimeoutForfeit(state, nk, logger);
    updateMatchLabel(state, dispatcher);
    broadcastState(state, dispatcher);
    return { state };
  }
  
  // Check reconnect grace expiry
  if (state.phase === 'reconnect_grace' && state.reconnectDeadlineAt && now > state.reconnectDeadlineAt) {
    // Grace period expired, forfeit the match
    state.phase = 'completed';
    state.outcomeReason = 'disconnect_forfeit';
    state.currentTurn = null;
    state.turnDeadlineAt = null;
    state.remainingTurnMs = null;
    
    // Determine winner (remaining connected player)
    if (state.playerX && state.playerX.connected) {
      state.winner = 'X';
    } else if (state.playerO && state.playerO.connected) {
      state.winner = 'O';
    }
    
    bumpVersion(state);
    
    // Gamma 3: Finalize match completion and update leaderboard stats
    finalizeMatchCompletion(state, nk, logger);
    
    updateMatchLabel(state, dispatcher);
    broadcastState(state, dispatcher);
    return { state };
  }

  // Gamma 2: Check waiting room expiry
  if (state.phase === 'waiting_for_opponent') {
    const waitingRoomExpiryAt = state.createdAt + WAITING_ROOM_TTL_MS;
    if (now > waitingRoomExpiryAt) {
      logger.info('Gamma 2: Waiting room expired for match ' + state.matchId);
      // Mark as completed and non-joinable
      state.phase = 'completed';
      state.outcomeReason = 'disconnect_forfeit';
      state.currentTurn = null;
      state.turnDeadlineAt = null;
      state.remainingTurnMs = null;
      bumpVersion(state);
      // Note: Waiting room expiry does NOT update leaderboard stats
      // because it's not a real competitive match completion
      updateMatchLabel(state, dispatcher);
      broadcastState(state, dispatcher);
      return { state };
    }
  }

  // Gamma 2: Check empty room dissolve
  const hasConnectedPlayers = (state.playerX && state.playerX.connected) || (state.playerO && state.playerO.connected);
  if (!hasConnectedPlayers) {
    // No connected players - check if we should start or continue empty room timer
    if (state.emptySinceAt === null) {
      // First time we see empty room
      state.emptySinceAt = now;
      bumpVersion(state);
    } else if (now > state.emptySinceAt + EMPTY_ROOM_DISSOLVE_MS) {
      // Empty room timer expired - dissolve the match
      logger.info('Gamma 2: Empty room dissolved for match ' + state.matchId);
      // Match will be terminated by Nakama when we return
      state.phase = 'completed';
      state.outcomeReason = 'disconnect_forfeit';
      state.currentTurn = null;
      state.turnDeadlineAt = null;
      state.remainingTurnMs = null;
      bumpVersion(state);
      updateMatchLabel(state, dispatcher);
      broadcastState(state, dispatcher);
      return { state };
    }
  } else {
    // There are connected players - clear empty room timer
    if (state.emptySinceAt !== null) {
      state.emptySinceAt = null;
      bumpVersion(state);
    }
  }

  // Gamma 2: Clear stale rematch flags if player leaves during pending rematch
  if (state.phase === 'completed' && (state.rematchRequestedByX || state.rematchRequestedByO)) {
    const xEligible = state.playerX && state.playerX.userId && state.playerX.connected;
    const oEligible = state.playerO && state.playerO.userId && state.playerO.connected;
    
    if (state.rematchRequestedByX && !xEligible) {
      state.rematchRequestedByX = false;
      bumpVersion(state);
    }
    if (state.rematchRequestedByO && !oEligible) {
      state.rematchRequestedByO = false;
      bumpVersion(state);
    }
  }
  
  // Process incoming messages
  logger.info('DEBUG matchLoop: Processing ' + messages.length + ' messages, match phase: ' + state.phase);
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    logger.info('DEBUG matchLoop: Message ' + i + ', opCode: ' + message.opCode + 
               ', sender: ' + message.sender.userId +
               ', data type: ' + typeof message.data);
    
    if (message.opCode === OP_CODE_MOVE_INTENT) {
      logger.info('DEBUG: Received move intent from user ' + message.sender.userId + 
                 ', match phase: ' + state.phase + 
                 ', currentTurn: ' + state.currentTurn +
                 ', data type: ' + typeof message.data +
                 ', constructor: ' + (message.data?.constructor?.name || 'unknown') +
                 ', data: ' + (typeof message.data === 'string' ? message.data.substring(0, 100) : String(message.data)));
      
      // First check if sender is a player in this match
      const senderSymbol = getPlayerSymbol(state, message.sender.userId);
      if (!senderSymbol) {
        logger.info('DEBUG: Ignoring move intent - sender ' + message.sender.userId + ' is not a player in this match');
        continue; // Skip this message
      }
      
      // Check if data is valid before parsing
      if (message.data === undefined || message.data === null || message.data === '') {
        logger.info('DEBUG: Ignoring move intent - empty or undefined data');
        continue; // Skip this message
      }
      
      try {
        // Handle different data types like frontend does
        let dataStr: string;
        const data = message.data;
        
        logger.info('DEBUG: Raw data inspection - type: ' + typeof data + 
                   ', constructor: ' + (data?.constructor?.name || 'unknown'));
        
        if (typeof data === 'string') {
          dataStr = data;
        } else if ((data as any) instanceof Uint8Array || (data && typeof data === 'object' && (data as any).constructor && (data as any).constructor.name === 'Uint8Array')) {
          // Decode Uint8Array to string manually (TextDecoder not available in Nakama runtime)
          dataStr = decodeUint8ArrayToString(data as any as Uint8Array);
        } else if ((data as any) instanceof ArrayBuffer || (data && typeof data === 'object' && (data as any).constructor && (data as any).constructor.name === 'ArrayBuffer')) {
          // Decode ArrayBuffer to string manually
          dataStr = decodeArrayBufferToString(data as any as ArrayBuffer);
        } else if (data && typeof data === 'object' && 'buffer' in (data as any)) {
          // Handle ArrayBufferView objects (DataView, etc.)
          dataStr = decodeArrayBufferToString((data as any).buffer);
        } else {
          // Last resort: try to convert to string
          dataStr = String(data);
          logger.warn('DEBUG: Using String() fallback for data, result: ' + dataStr.substring(0, 100));
        }
        
        logger.info('DEBUG: Decoded data string: ' + dataStr.substring(0, 100));
        
        logger.info('DEBUG: Decoded data string: ' + dataStr.substring(0, 100));
        const payload: MoveIntentPayload = JSON.parse(dataStr);
        logger.info('DEBUG: Parsed move payload: ' + JSON.stringify(payload) + 
                   ', index type: ' + typeof payload.index + 
                   ', index value: ' + payload.index);
        
        logger.info('DEBUG: Sender symbol: ' + senderSymbol + 
                   ', playerX userId: ' + (state.playerX?.userId || 'null') + 
                   ', playerO userId: ' + (state.playerO?.userId || 'null'));
        
        // Validate required fields in payload with backward compatibility
        if (typeof payload.index !== 'number' || payload.index < 0 || payload.index > 8) {
          logger.info('DEBUG: Rejecting move - invalid index');
          const rejectPayload: ActionRejectPayload = {
            reason: 'invalid_payload',
            message: 'Invalid move payload: missing or invalid index',
            state: getPublicState(state)
          };
          dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
          continue;
        }
        
        // Backward compatibility: generate missing Gamma 1 fields for old clients
        const actionId = typeof payload.actionId === 'string' && payload.actionId.trim() 
          ? payload.actionId 
          : `legacy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const expectedVersion = typeof payload.expectedVersion === 'number' 
          ? payload.expectedVersion 
          : state.version;
        const expectedTurn = typeof payload.expectedTurn === 'string' && (payload.expectedTurn === 'X' || payload.expectedTurn === 'O')
          ? payload.expectedTurn
          : state.currentTurn || 'X';
        
        // 1. Check duplicate actionId
        if (isDuplicateAction(state, senderSymbol, actionId)) {
          logger.info('DEBUG: Rejecting move - duplicate actionId: ' + actionId);
          const rejectPayload: ActionRejectPayload = {
            reason: 'duplicate_action',
            message: 'Duplicate action',
            state: getPublicState(state)
          };
          dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
          continue;
        }
        
        // 2. Check expectedVersion mismatch (stale state)
        if (expectedVersion !== state.version) {
          logger.info('DEBUG: Rejecting move - stale state. Expected: ' + expectedVersion + ', Actual: ' + state.version);
          const rejectPayload: ActionRejectPayload = {
            reason: 'stale_state',
            message: 'State has changed',
            state: getPublicState(state)
          };
          dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
          continue;
        }
        
        // 3. Check expectedTurn mismatch
        if (expectedTurn !== state.currentTurn) {
          logger.info('DEBUG: Rejecting move - not your turn. Expected: ' + expectedTurn + ', Actual: ' + state.currentTurn);
          const rejectPayload: ActionRejectPayload = {
            reason: 'not_your_turn',
            message: 'Not your turn',
            state: getPublicState(state)
          };
          dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
          continue;
        }
        
        // 4. Check phase allows moves
        if (state.phase === 'reconnect_grace') {
          logger.info('DEBUG: Rejecting move - reconnect grace period. Phase: ' + state.phase);
          const rejectPayload: ActionRejectPayload = {
            reason: 'reconnect_in_progress',
            message: 'Game is in reconnect grace period',
            state: getPublicState(state)
          };
          dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
          continue;
        }
        
        if (state.phase !== 'in_progress') {
          logger.info('DEBUG: Rejecting move - game not in progress. Phase: ' + state.phase);
          const rejectPayload: ActionRejectPayload = {
            reason: 'game_not_in_progress',
            message: 'Game is not in progress',
            state: getPublicState(state)
          };
          dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
          continue;
        }
        
        // 5. Check sender is actually the current turn player
        if (senderSymbol !== state.currentTurn) {
          logger.info('DEBUG: Rejecting move - sender symbol mismatch. Sender: ' + senderSymbol + ', currentTurn: ' + state.currentTurn);
          const rejectPayload: ActionRejectPayload = {
            reason: 'not_your_turn',
            message: 'Not your turn',
            state: getPublicState(state)
          };
          dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
          continue;
        }
        
        // 6. Check move legality
        if (!isValidCellIndex(payload.index) || !isCellEmpty(state.board, payload.index)) {
          logger.info('DEBUG: Rejecting move - invalid cell. Index: ' + payload.index + 
                     ', isValid: ' + isValidCellIndex(payload.index) +
                     ', isCellEmpty: ' + isCellEmpty(state.board, payload.index));
          const rejectPayload: ActionRejectPayload = {
            reason: 'cell_taken',
            message: 'Cell is already taken',
            state: getPublicState(state)
          };
          dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
          continue;
        }
        
        // All validation passed - apply move
        logger.info('DEBUG: Applying valid move. Index: ' + payload.index + ', symbol: ' + senderSymbol + ', actionId: ' + actionId);
        
        // Track action ID to prevent duplicates
        trackActionId(state, senderSymbol, actionId);
        
        // Apply move and bump version
        state.board = applyMove(state.board, payload.index, senderSymbol!);
        state.moveCount++;
        bumpVersion(state);
        
        // Check for winner or draw
        const outcome = evaluateBoardOutcome(state.board);
        if (outcome.winner || outcome.outcomeReason === 'draw_full_board') {
          state.phase = 'completed';
          state.winner = outcome.winner;
          state.outcomeReason = outcome.outcomeReason;
          state.currentTurn = null;
          state.turnDeadlineAt = null;
          state.remainingTurnMs = null;
          logger.info('DEBUG: Game completed. Winner: ' + outcome.winner + ', reason: ' + outcome.outcomeReason);
          
          // Gamma 3: Finalize match completion and update leaderboard stats
          finalizeMatchCompletion(state, nk, logger);
        } else {
          // Switch turn
          state.currentTurn = getNextTurn(state.currentTurn!);
          // Set new turn deadline for timed mode
          setTurnDeadline(state);
          logger.info('DEBUG: Turn switched to: ' + state.currentTurn);
        }
        
        updateMatchLabel(state, dispatcher);
        broadcastState(state, dispatcher);
        logger.info('DEBUG: State broadcast after move');
        
      } catch (error) {
        logger.error('DEBUG: Error parsing move payload: ' + error + 
                    ', data type: ' + typeof message.data +
                    ', raw data: ' + (typeof message.data === 'string' ? message.data : String(message.data)));
        const rejectPayload: ActionRejectPayload = {
          reason: 'invalid_payload',
          message: 'Invalid move payload: ' + (error instanceof Error ? error.message : String(error)),
          state: getPublicState(state)
        };
        dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
      }
    } else if (message.opCode === OP_CODE_REMATCH_REQUEST || message.opCode === OP_CODE_REMATCH_ACCEPT) {
      // Gamma 2: Rematch handshake handling
      logger.info('Gamma 2: Received rematch message, opCode: ' + message.opCode + ', from user: ' + message.sender.userId);
      
      // First check if sender is a player in this match
      const senderSymbol = getPlayerSymbol(state, message.sender.userId);
      if (!senderSymbol) {
        logger.info('Gamma 2: Ignoring rematch message - sender ' + message.sender.userId + ' is not a player in this match');
        continue;
      }
      
      // Rematch only allowed in completed phase
      if (state.phase !== 'completed') {
        logger.info('Gamma 2: Ignoring rematch message - match not completed, phase: ' + state.phase);
        continue;
      }
      
      // Check if player is eligible (has a seat and is connected)
      const isEligible = (senderSymbol === 'X' && state.playerX && state.playerX.connected) ||
                         (senderSymbol === 'O' && state.playerO && state.playerO.connected);
      if (!isEligible) {
        logger.info('Gamma 2: Ignoring rematch message - player not eligible or disconnected');
        continue;
      }
      
      // Set rematch flag based on player symbol
      if (senderSymbol === 'X') {
        state.rematchRequestedByX = true;
      } else if (senderSymbol === 'O') {
        state.rematchRequestedByO = true;
      }
      
      bumpVersion(state);
      logger.info('Gamma 2: Rematch flag set for ' + senderSymbol + ', X: ' + state.rematchRequestedByX + ', O: ' + state.rematchRequestedByO);
      
      // Check if both players have requested rematch
      if (state.rematchRequestedByX && state.rematchRequestedByO) {
        logger.info('Gamma 2: Both players agreed to rematch - resetting game');
        
        // Reset game state
        state.board = createEmptyBoard();
        state.winner = null;
        state.outcomeReason = null;
        state.moveCount = 0;
        state.phase = 'in_progress';
        state.currentTurn = 'X';
        state.reconnectDeadlineAt = null;
        state.remainingTurnMs = null;
        
        // Clear rematch flags
        state.rematchRequestedByX = false;
        state.rematchRequestedByO = false;
        state.statsCommitted = false;

        // Set turn deadline for timed mode
        if (state.mode === 'timed') {
          state.turnDeadlineAt = now + TURN_MS;
        } else {
          state.turnDeadlineAt = null;
        }
        
        bumpVersion(state);
        logger.info('Gamma 2: Game reset for rematch, new phase: ' + state.phase + ', mode: ' + state.mode);
      }
      
      // Broadcast updated state
      updateMatchLabel(state, dispatcher);
      broadcastState(state, dispatcher);
    }
  }
  
  return { state };
};

var matchTerminate = function matchTerminate(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicTacToeMatchState,
  graceSeconds: number
): { state: TicTacToeMatchState } {
  logger.info('TicTacToe match terminating: ' + state.matchId);
  return { state };
};

var matchSignal = function matchSignal(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: TicTacToeMatchState,
  data: string
): { state: TicTacToeMatchState; data?: string } {
  // No special signal handling needed
  return { state };
};

const matchHandler: nkruntime.MatchHandler = {
  matchInit,
  matchJoinAttempt,
  matchJoin,
  matchLeave,
  matchLoop,
  matchTerminate,
  matchSignal
};
