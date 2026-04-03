/**
 * Authoritative Nakama match handler for classic Tic-Tac-Toe
 */

import * as gameRules from './gameRules';

// Constants
const GRACE_WINDOW_MS = 30000; // 30 seconds for reconnect grace
const ROOM_CODE_LENGTH = 6;
const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// Match op-codes
export const OP_CODE_MOVE_INTENT = 1;
export const OP_CODE_STATE_SYNC = 2;
export const OP_CODE_ACTION_REJECTED = 3;

// Match phases
export type MatchPhase = 
  | 'waiting_for_opponent' 
  | 'ready' 
  | 'in_progress' 
  | 'reconnect_grace' 
  | 'completed';

// Player seat state
export interface PlayerSeatState {
  userId: string;
  nickname: string;
  connected: boolean;
}

// Internal match state
export interface TicTacToeMatchState {
  // Public fields
  matchId: string;
  roomCode: string;
  mode: 'classic';
  phase: MatchPhase;
  board: gameRules.BoardState;
  playerX: PlayerSeatState | null;
  playerO: PlayerSeatState | null;
  currentTurn: 'X' | 'O' | null;
  winner: 'X' | 'O' | null;
  outcomeReason: gameRules.OutcomeReason | null;
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
export interface MoveIntentPayload {
  index: number;
}

// Action rejection payload
export interface ActionRejectPayload {
  reason: 'not_your_turn' | 'cell_taken' | 'game_not_in_progress' | 'invalid_payload';
  message?: string;
}

// Match label structure
export interface MatchLabel {
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
function updateMatchLabel(state: TicTacToeMatchState, nk: nkruntime.Nakama): void {
  const occupancy: 0 | 1 | 2 = 
    (state.playerX ? 1 : 0) + (state.playerO ? 1 : 0) as 0 | 1 | 2;
  
  const open = 
    state.phase === 'waiting_for_opponent' && 
    state.visibility === 'public' && 
    occupancy < 2;
  
  const label: MatchLabel = {
    roomCode: state.roomCode,
    visibility: state.visibility,
    mode: state.mode,
    phase: state.phase,
    occupancy,
    open
  };
  
  nk.matchLabelUpdate(state.matchId, JSON.stringify(label));
}

/**
 * Broadcast canonical state to all connected players
 */
function broadcastState(state: TicTacToeMatchState, nk: nkruntime.Nakama): void {
  const publicState = getPublicState(state);
  nk.matchSendData(state.matchId, OP_CODE_STATE_SYNC, JSON.stringify(publicState), null, null, true);
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

// Match handler implementation
const matchHandler: nkruntime.MatchHandler = {
  matchInit: function(
    ctx: nkruntime.Context,
    logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    params: { [key: string]: string }
  ): { state: TicTacToeMatchState } {
    logger.info('TicTacToe match initializing');
    
    const roomCode = params.roomCode || generateRoomCode();
    const visibility = (params.visibility === 'private' ? 'private' : 'public') as 'public' | 'private';
    
    const state: TicTacToeMatchState = {
      matchId: ctx.matchId,
      roomCode,
      mode: 'classic',
      phase: 'waiting_for_opponent',
      board: gameRules.createEmptyBoard(),
      playerX: null,
      playerO: null,
      currentTurn: 'X',
      winner: null,
      outcomeReason: null,
      moveCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      reconnectDeadlineAt: null,
      visibility,
      creatorUserId: params.creatorUserId || null,
      creatorNickname: params.creatorNickname || null
    };
    
    updateMatchLabel(state, nk);
    return { state };
  },
  
  matchJoinAttempt: function(
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
  },
  
  matchJoin: function(
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
      const nickname = presence.metadata?.nickname || 'Player';
      
      // Check if user is reconnecting to existing seat
      const existingSymbol = getPlayerSymbol(state, userId);
      if (existingSymbol) {
        // Reconnect to existing seat
        if (existingSymbol === 'X' && state.playerX) {
          state.playerX.connected = true;
        } else if (existingSymbol === 'O' && state.playerO) {
          state.playerO.connected = true;
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
        } else if (!state.playerO) {
          state.playerO = {
            userId,
            nickname,
            connected: true
          };
        }
      }
    }
    
    // Update phase based on occupancy
    const playerCount = (state.playerX ? 1 : 0) + (state.playerO ? 1 : 0);
    if (playerCount === 1) {
      state.phase = 'waiting_for_opponent';
    } else if (playerCount === 2) {
      if (state.phase === 'waiting_for_opponent') {
        state.phase = 'ready';
        // Immediately transition to in_progress for simplicity
        state.phase = 'in_progress';
      }
    }
    
    updateMatchLabel(state, nk);
    broadcastState(state, nk);
    
    return { state };
  },
  
  matchLeave: function(
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
    
    updateMatchLabel(state, nk);
    broadcastState(state, nk);
    
    return { state };
  },
  
  matchLoop: function(
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
      
      updateMatchLabel(state, nk);
      broadcastState(state, nk);
      return { state };
    }
    
    // Process incoming messages
    for (const message of messages) {
      if (message.opCode === OP_CODE_MOVE_INTENT) {
        try {
          const payload: MoveIntentPayload = JSON.parse(message.data);
          const senderSymbol = getPlayerSymbol(state, message.sender.userId);
          
          // Validate move
          if (state.phase !== 'in_progress') {
            const rejectPayload: ActionRejectPayload = {
              reason: 'game_not_in_progress',
              message: 'Game is not in progress'
            };
            dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
            continue;
          }
          
          if (senderSymbol !== state.currentTurn) {
            const rejectPayload: ActionRejectPayload = {
              reason: 'not_your_turn',
              message: `It's ${state.currentTurn}'s turn`
            };
            dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
            continue;
          }
          
          if (!gameRules.isValidCellIndex(payload.index) || !gameRules.isCellEmpty(state.board, payload.index)) {
            const rejectPayload: ActionRejectPayload = {
              reason: 'cell_taken',
              message: 'Cell is already taken or invalid'
            };
            dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
            continue;
          }
          
          // Apply valid move
          state.board = gameRules.applyMove(state.board, payload.index, senderSymbol!);
          state.moveCount++;
          
          // Check for winner or draw
          const outcome = gameRules.evaluateBoardOutcome(state.board);
          if (outcome.winner || outcome.outcomeReason === 'draw_full_board') {
            state.phase = 'completed';
            state.winner = outcome.winner;
            state.outcomeReason = outcome.outcomeReason;
            state.currentTurn = null;
          } else {
            // Switch turn
            state.currentTurn = gameRules.getNextTurn(state.currentTurn!);
          }
          
          updateMatchLabel(state, nk);
          broadcastState(state, nk);
          
        } catch (error) {
          const rejectPayload: ActionRejectPayload = {
            reason: 'invalid_payload',
            message: 'Invalid move payload'
          };
          dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
        }
      }
    }
    
    return { state };
  },
  
  matchTerminate: function(
    ctx: nkruntime.Context,
    logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    dispatcher: nkruntime.MatchDispatcher,
    tick: number,
    state: TicTacToeMatchState,
    graceSeconds: number
  ): { state: TicTacToeMatchState } {
    logger.info(`TicTacToe match terminating: ${state.matchId}`);
    return { state };
  },
  
  matchSignal: function(
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
  }
};

export default matchHandler;