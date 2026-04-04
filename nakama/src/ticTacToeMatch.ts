/**
 * Authoritative Nakama match handler for classic Tic-Tac-Toe
 */

// Constants
const GRACE_WINDOW_MS = 30000; // 30 seconds for reconnect grace
const ROOM_CODE_LENGTH = 6;
const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// Match op-codes
const OP_CODE_MOVE_INTENT = 1;
const OP_CODE_STATE_SYNC = 2;
const OP_CODE_ACTION_REJECTED = 3;

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
  mode: 'classic';
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
  
  // Internal fields
  visibility: 'public' | 'private';
  creatorUserId: string | null;
  creatorNickname: string | null;
}

// Move intent payload
interface MoveIntentPayload {
  index: number;
}

// Action rejection payload
interface ActionRejectPayload {
  reason: 'not_your_turn' | 'cell_taken' | 'game_not_in_progress' | 'invalid_payload';
  message?: string;
}

// Match label structure
interface MatchLabel {
  roomCode: string;
  visibility: 'public' | 'private';
  mode: 'classic';
  phase: MatchPhase;
  occupancy: 0 | 1 | 2;
  open: boolean;
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
  return {
    matchId: state.matchId,
    roomCode: state.roomCode,
    mode: state.mode,
    phase: state.phase,
    board: state.board,
    playerX: state.playerX,
    playerO: state.playerO,
    currentTurn: state.currentTurn,
    winner: state.winner,
    outcomeReason: state.outcomeReason,
    moveCount: state.moveCount,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    reconnectDeadlineAt: state.reconnectDeadlineAt
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
  
  return {
    roomCode: state.roomCode,
    visibility: state.visibility,
    mode: state.mode,
    phase: state.phase,
    occupancy,
    open
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
 * Check if a user can join the match
 */
function canUserJoin(state: TicTacToeMatchState, userId: string): { canJoin: boolean; reason?: string } {
  // Check if user is already in the match (reconnect)
  const existingSymbol = getPlayerSymbol(state, userId);
  if (existingSymbol) {
    // User is reconnecting to their existing seat
    return { canJoin: true };
  }
  
  // Check if match is joinable
  if (state.phase === 'completed') {
    return { canJoin: false, reason: 'Match is completed' };
  }
  
  if (state.phase === 'reconnect_grace') {
    return { canJoin: false, reason: 'Match is in reconnect grace period' };
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

  const state: TicTacToeMatchState = {
    matchId: ctx.matchId,
      roomCode,
      mode: 'classic',
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
    visibility,
	    creatorUserId,
	    creatorNickname
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
  const nickname = metadata.nickname || 'Player';
  
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
    let nickname = (md && md.nickname) ? String(md.nickname) : 'Player';
    if (!nickname.trim()) nickname = 'Player';
    
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
      }
    } else {
      // Assign to empty seat
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
      state.phase = 'ready';
      // Immediately transition to in_progress for simplicity
      state.phase = 'in_progress';
      logger.info('Match now has 2 players, transitioning to in_progress');
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
  
  // If match was in progress and a player left, start reconnect grace
  if (state.phase === 'in_progress') {
    state.phase = 'reconnect_grace';
    state.reconnectDeadlineAt = now + GRACE_WINDOW_MS;
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
  
  // Check reconnect grace expiry
  if (state.phase === 'reconnect_grace' && state.reconnectDeadlineAt && now > state.reconnectDeadlineAt) {
    // Grace period expired, forfeit the match
    state.phase = 'completed';
    state.outcomeReason = 'disconnect_forfeit';
    state.currentTurn = null;
    
    // Determine winner (remaining connected player)
    if (state.playerX && state.playerX.connected) {
      state.winner = 'X';
    } else if (state.playerO && state.playerO.connected) {
      state.winner = 'O';
    }
    
	    updateMatchLabel(state, dispatcher);
	    broadcastState(state, dispatcher);
	    return { state };
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
        
        // Validate move
        if (state.phase !== 'in_progress') {
          logger.info('DEBUG: Rejecting move - game not in progress. Phase: ' + state.phase);
          const rejectPayload: ActionRejectPayload = {
            reason: 'game_not_in_progress',
            message: 'Game is not in progress'
          };
          dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
          continue;
        }

        if (senderSymbol !== state.currentTurn) {
          logger.info('DEBUG: Rejecting move - not sender\'s turn. Sender: ' + senderSymbol + ', currentTurn: ' + state.currentTurn);
          const rejectPayload: ActionRejectPayload = {
            reason: 'not_your_turn',
            message: "It's " + state.currentTurn + "'s turn"
          };
          dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
          continue;
        }

        if (!isValidCellIndex(payload.index) || !isCellEmpty(state.board, payload.index)) {
          logger.info('DEBUG: Rejecting move - invalid cell. Index: ' + payload.index + 
                     ', isValid: ' + isValidCellIndex(payload.index) +
                     ', isCellEmpty: ' + isCellEmpty(state.board, payload.index));
          const rejectPayload: ActionRejectPayload = {
            reason: 'cell_taken',
            message: 'Cell is already taken or invalid'
          };
          dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
          continue;
        }

        logger.info('DEBUG: Applying valid move. Index: ' + payload.index + ', symbol: ' + senderSymbol);
        // Apply valid move
        state.board = applyMove(state.board, payload.index, senderSymbol!);
        state.moveCount++;
        
        // Check for winner or draw
        const outcome = evaluateBoardOutcome(state.board);
        if (outcome.winner || outcome.outcomeReason === 'draw_full_board') {
          state.phase = 'completed';
          state.winner = outcome.winner;
          state.outcomeReason = outcome.outcomeReason;
          state.currentTurn = null;
          logger.info('DEBUG: Game completed. Winner: ' + outcome.winner + ', reason: ' + outcome.outcomeReason);
        } else {
          // Switch turn
          state.currentTurn = getNextTurn(state.currentTurn!);
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
          message: 'Invalid move payload: ' + (error instanceof Error ? error.message : String(error))
        };
        dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
      }
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
