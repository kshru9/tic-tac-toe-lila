// src/gameRules.ts
var BOARD_SIZE = 9;
var ROWS = 3;
var COLS = 3;
function createEmptyBoard() {
  return Array(BOARD_SIZE).fill(null);
}
function isValidCellIndex(index) {
  return index >= 0 && index < BOARD_SIZE;
}
function isCellEmpty(board, index) {
  if (!isValidCellIndex(index)) {
    return false;
  }
  return board[index] === null;
}
function getNextTurn(currentTurn) {
  return currentTurn === "X" ? "O" : "X";
}
function applyMove(board, index, symbol) {
  if (!isValidCellIndex(index) || !isCellEmpty(board, index)) {
    throw new Error(`Invalid move: index ${index} is not empty or out of bounds`);
  }
  const newBoard = [...board];
  newBoard[index] = symbol;
  return newBoard;
}
function getWinner(board) {
  for (let row = 0; row < ROWS; row++) {
    const start = row * COLS;
    if (board[start] && board[start] === board[start + 1] && board[start] === board[start + 2]) {
      return board[start];
    }
  }
  for (let col = 0; col < COLS; col++) {
    if (board[col] && board[col] === board[col + COLS] && board[col] === board[col + 2 * COLS]) {
      return board[col];
    }
  }
  if (board[0] && board[0] === board[4] && board[0] === board[8]) {
    return board[0];
  }
  if (board[2] && board[2] === board[4] && board[2] === board[6]) {
    return board[2];
  }
  return null;
}
function getWinReason(board) {
  for (let row = 0; row < ROWS; row++) {
    const start = row * COLS;
    if (board[start] && board[start] === board[start + 1] && board[start] === board[start + 2]) {
      return "win_row";
    }
  }
  for (let col = 0; col < COLS; col++) {
    if (board[col] && board[col] === board[col + COLS] && board[col] === board[col + 2 * COLS]) {
      return "win_column";
    }
  }
  if (board[0] && board[0] === board[4] && board[0] === board[8]) {
    return "win_diagonal";
  }
  if (board[2] && board[2] === board[4] && board[2] === board[6]) {
    return "win_diagonal";
  }
  return null;
}
function isBoardFull(board) {
  return board.every((cell) => cell !== null);
}
function evaluateBoardOutcome(board) {
  const winner = getWinner(board);
  if (winner) {
    const winReason = getWinReason(board);
    return {
      winner,
      outcomeReason: winReason
    };
  }
  if (isBoardFull(board)) {
    return {
      winner: null,
      outcomeReason: "draw_full_board"
    };
  }
  return {
    winner: null,
    outcomeReason: null
  };
}

// src/ticTacToeMatch.ts
var GRACE_WINDOW_MS = 3e4;
var ROOM_CODE_LENGTH = 6;
var ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
var OP_CODE_MOVE_INTENT = 1;
var OP_CODE_STATE_SYNC = 2;
var OP_CODE_ACTION_REJECTED = 3;
function generateRoomCode() {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ALPHANUMERIC[Math.floor(Math.random() * ALPHANUMERIC.length)];
  }
  return code;
}
function getPublicState(state) {
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
function updateMatchLabel(state, nk) {
  const occupancy = (state.playerX ? 1 : 0) + (state.playerO ? 1 : 0);
  const open = state.phase === "waiting_for_opponent" && state.visibility === "public" && occupancy < 2;
  const label = {
    roomCode: state.roomCode,
    visibility: state.visibility,
    mode: state.mode,
    phase: state.phase,
    occupancy,
    open
  };
  nk.matchLabelUpdate(state.matchId, JSON.stringify(label));
}
function broadcastState(state, nk) {
  const publicState = getPublicState(state);
  nk.matchSendData(state.matchId, OP_CODE_STATE_SYNC, JSON.stringify(publicState), null, null, true);
}
function getPlayerSymbol(state, userId) {
  if (state.playerX && state.playerX.userId === userId) return "X";
  if (state.playerO && state.playerO.userId === userId) return "O";
  return null;
}
function canUserJoin(state, userId) {
  const existingSymbol = getPlayerSymbol(state, userId);
  if (existingSymbol) {
    return { canJoin: true };
  }
  if (state.phase === "completed") {
    return { canJoin: false, reason: "Match is completed" };
  }
  if (state.phase === "reconnect_grace") {
    return { canJoin: false, reason: "Match is in reconnect grace period" };
  }
  if (!state.playerX) {
    return { canJoin: true };
  }
  if (!state.playerO) {
    return { canJoin: true };
  }
  return { canJoin: false, reason: "Match is full" };
}
var matchHandler = {
  matchInit: function(ctx, logger, nk, params) {
    logger.info("TicTacToe match initializing");
    const roomCode = params.roomCode || generateRoomCode();
    const visibility = params.visibility === "private" ? "private" : "public";
    const state = {
      matchId: ctx.matchId,
      roomCode,
      mode: "classic",
      phase: "waiting_for_opponent",
      board: createEmptyBoard(),
      playerX: null,
      playerO: null,
      currentTurn: "X",
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
  matchJoinAttempt: function(ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
    const userId = presence.userId;
    const nickname = metadata.nickname || "Player";
    const existingSymbol = getPlayerSymbol(state, userId);
    if (state.phase === "reconnect_grace" && existingSymbol) {
      return { state, accept: true };
    }
    const joinCheck = canUserJoin(state, userId);
    if (!joinCheck.canJoin) {
      return {
        state,
        accept: false,
        rejectMessage: joinCheck.reason || "Cannot join match"
      };
    }
    return { state, accept: true };
  },
  matchJoin: function(ctx, logger, nk, dispatcher, tick, state, presences) {
    const now = Date.now();
    state.updatedAt = now;
    for (const presence of presences) {
      const userId = presence.userId;
      const nickname = presence.metadata?.nickname || "Player";
      const existingSymbol = getPlayerSymbol(state, userId);
      if (existingSymbol) {
        if (existingSymbol === "X" && state.playerX) {
          state.playerX.connected = true;
        } else if (existingSymbol === "O" && state.playerO) {
          state.playerO.connected = true;
        }
        if (state.phase === "reconnect_grace") {
          state.reconnectDeadlineAt = null;
          state.phase = "in_progress";
        }
      } else {
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
    const playerCount = (state.playerX ? 1 : 0) + (state.playerO ? 1 : 0);
    if (playerCount === 1) {
      state.phase = "waiting_for_opponent";
    } else if (playerCount === 2) {
      if (state.phase === "waiting_for_opponent") {
        state.phase = "ready";
        state.phase = "in_progress";
      }
    }
    updateMatchLabel(state, nk);
    broadcastState(state, nk);
    return { state };
  },
  matchLeave: function(ctx, logger, nk, dispatcher, tick, state, presences) {
    const now = Date.now();
    state.updatedAt = now;
    for (const presence of presences) {
      const userId = presence.userId;
      const symbol = getPlayerSymbol(state, userId);
      if (symbol === "X" && state.playerX) {
        state.playerX.connected = false;
      } else if (symbol === "O" && state.playerO) {
        state.playerO.connected = false;
      }
    }
    if (state.phase === "in_progress") {
      state.phase = "reconnect_grace";
      state.reconnectDeadlineAt = now + GRACE_WINDOW_MS;
    } else if (state.phase === "waiting_for_opponent") {
    }
    updateMatchLabel(state, nk);
    broadcastState(state, nk);
    return { state };
  },
  matchLoop: function(ctx, logger, nk, dispatcher, tick, state, messages) {
    const now = Date.now();
    state.updatedAt = now;
    if (state.phase === "reconnect_grace" && state.reconnectDeadlineAt && now > state.reconnectDeadlineAt) {
      state.phase = "completed";
      state.outcomeReason = "disconnect_forfeit";
      state.currentTurn = null;
      if (state.playerX && state.playerX.connected) {
        state.winner = "X";
      } else if (state.playerO && state.playerO.connected) {
        state.winner = "O";
      }
      updateMatchLabel(state, nk);
      broadcastState(state, nk);
      return { state };
    }
    for (const message of messages) {
      if (message.opCode === OP_CODE_MOVE_INTENT) {
        try {
          const payload = JSON.parse(message.data);
          const senderSymbol = getPlayerSymbol(state, message.sender.userId);
          if (state.phase !== "in_progress") {
            const rejectPayload = {
              reason: "game_not_in_progress",
              message: "Game is not in progress"
            };
            dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
            continue;
          }
          if (senderSymbol !== state.currentTurn) {
            const rejectPayload = {
              reason: "not_your_turn",
              message: `It's ${state.currentTurn}'s turn`
            };
            dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
            continue;
          }
          if (!isValidCellIndex(payload.index) || !isCellEmpty(state.board, payload.index)) {
            const rejectPayload = {
              reason: "cell_taken",
              message: "Cell is already taken or invalid"
            };
            dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
            continue;
          }
          state.board = applyMove(state.board, payload.index, senderSymbol);
          state.moveCount++;
          const outcome = evaluateBoardOutcome(state.board);
          if (outcome.winner || outcome.outcomeReason === "draw_full_board") {
            state.phase = "completed";
            state.winner = outcome.winner;
            state.outcomeReason = outcome.outcomeReason;
            state.currentTurn = null;
          } else {
            state.currentTurn = getNextTurn(state.currentTurn);
          }
          updateMatchLabel(state, nk);
          broadcastState(state, nk);
        } catch (error) {
          const rejectPayload = {
            reason: "invalid_payload",
            message: "Invalid move payload"
          };
          dispatcher.broadcastMessage(OP_CODE_ACTION_REJECTED, JSON.stringify(rejectPayload), [message.sender]);
        }
      }
    }
    return { state };
  },
  matchTerminate: function(ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
    logger.info(`TicTacToe match terminating: ${state.matchId}`);
    return { state };
  },
  matchSignal: function(ctx, logger, nk, dispatcher, tick, state, data) {
    return { state };
  }
};
var ticTacToeMatch_default = matchHandler;

// src/rpc.ts
var ROOM_CODE_LENGTH2 = 6;
var ALPHANUMERIC2 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function generateRoomCode2() {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH2; i++) {
    code += ALPHANUMERIC2[Math.floor(Math.random() * ALPHANUMERIC2.length)];
  }
  return code;
}
function sanitizeNickname(nickname) {
  return nickname.trim().slice(0, 20) || "Player";
}
function parseMatchLabel(labelString) {
  try {
    return JSON.parse(labelString);
  } catch {
    return null;
  }
}
function findRoomByCode(nk, roomCode) {
  const matches = nk.matchList(100, true, void 0, void 0, 1, void 0);
  for (const match of matches.matches) {
    const label = parseMatchLabel(match.label || "{}");
    if (label && label.roomCode === roomCode) {
      return match;
    }
  }
  return null;
}
function getJoinablePublicRooms(nk) {
  const matches = nk.matchList(100, true, void 0, void 0, 1, void 0);
  const joinableRooms = [];
  for (const match of matches.matches) {
    const label = parseMatchLabel(match.label || "{}");
    if (label && label.visibility === "public" && label.open && label.phase === "waiting_for_opponent") {
      joinableRooms.push(match);
    }
  }
  return joinableRooms;
}
function createRoomRpc(ctx, logger, nk, payload) {
  try {
    const params = payload ? JSON.parse(payload) : {};
    const nickname = sanitizeNickname(params.nickname || "Player");
    const isPrivate = params.isPrivate === true;
    const roomCode = generateRoomCode2();
    const visibility = isPrivate ? "private" : "public";
    const matchId = nk.matchCreate("tic_tac_toe", {
      roomCode,
      visibility,
      creatorUserId: ctx.userId,
      creatorNickname: nickname
    });
    return JSON.stringify({
      success: true,
      matchId,
      roomCode,
      isPrivate,
      mode: "classic"
    });
  } catch (error) {
    logger.error(`createRoomRpc error: ${error}`);
    return JSON.stringify({
      success: false,
      error: "failed_to_create_room",
      message: "Failed to create room"
    });
  }
}
function joinRoomRpc(ctx, logger, nk, payload) {
  try {
    const params = payload ? JSON.parse(payload) : {};
    const roomCode = params.roomCode;
    if (!roomCode || typeof roomCode !== "string" || roomCode.length !== ROOM_CODE_LENGTH2) {
      return JSON.stringify({
        success: false,
        error: "invalid_room_code",
        message: "Invalid room code format"
      });
    }
    const match = findRoomByCode(nk, roomCode);
    if (!match) {
      return JSON.stringify({
        success: false,
        error: "room_not_found",
        message: "Room not found"
      });
    }
    const label = parseMatchLabel(match.label || "{}");
    if (!label || !label.open) {
      return JSON.stringify({
        success: false,
        error: "room_not_joinable",
        message: "Room is not joinable"
      });
    }
    return JSON.stringify({
      success: true,
      matchId: match.matchId,
      roomCode,
      mode: "classic"
    });
  } catch (error) {
    logger.error(`joinRoomRpc error: ${error}`);
    return JSON.stringify({
      success: false,
      error: "failed_to_join_room",
      message: "Failed to join room"
    });
  }
}
function listRoomsRpc(ctx, logger, nk, payload) {
  try {
    const joinableRooms = getJoinablePublicRooms(nk);
    const rooms = joinableRooms.map((match) => {
      const label = parseMatchLabel(match.label || "{}");
      return {
        matchId: match.matchId,
        roomCode: label?.roomCode || "UNKNOWN",
        mode: "classic",
        playerCount: label?.occupancy || 0,
        maxPlayers: 2
      };
    });
    return JSON.stringify({
      success: true,
      rooms
    });
  } catch (error) {
    logger.error(`listRoomsRpc error: ${error}`);
    return JSON.stringify({
      success: false,
      error: "failed_to_list_rooms",
      message: "Failed to list rooms",
      rooms: []
    });
  }
}
function quickPlayRpc(ctx, logger, nk, payload) {
  try {
    const params = payload ? JSON.parse(payload) : {};
    const nickname = sanitizeNickname(params.nickname || "Player");
    const joinableRooms = getJoinablePublicRooms(nk);
    if (joinableRooms.length > 0) {
      const match = joinableRooms[0];
      const label = parseMatchLabel(match.label || "{}");
      return JSON.stringify({
        success: true,
        matchId: match.matchId,
        roomCode: label?.roomCode || "UNKNOWN",
        mode: "classic",
        joinedExisting: true
      });
    }
    const roomCode = generateRoomCode2();
    const matchId = nk.matchCreate("tic_tac_toe", {
      roomCode,
      visibility: "public",
      creatorUserId: ctx.userId,
      creatorNickname: nickname
    });
    return JSON.stringify({
      success: true,
      matchId,
      roomCode,
      mode: "classic",
      joinedExisting: false
    });
  } catch (error) {
    logger.error(`quickPlayRpc error: ${error}`);
    return JSON.stringify({
      success: false,
      error: "failed_to_quick_play",
      message: "Failed to quick play"
    });
  }
}

// src/index.ts
var InitModule = function(ctx, logger, nk, initializer) {
  logger.info("Tic-Tac-Toe runtime module initializing (Gamma 2)");
  initializer.registerRpc("health", healthRpc);
  initializer.registerRpc("create_room", createRoomRpc);
  initializer.registerRpc("join_room", joinRoomRpc);
  initializer.registerRpc("list_rooms", listRoomsRpc);
  initializer.registerRpc("quick_play", quickPlayRpc);
  initializer.registerMatch("tic_tac_toe", ticTacToeMatch_default);
  logger.info("Tic-Tac-Toe runtime module initialized (Gamma 2 multiplayer core)");
};
var runtimeGlobal = (() => {
  if (typeof globalThis !== "undefined") return globalThis;
  if (typeof global !== "undefined") return global;
  if (typeof self !== "undefined") return self;
  return Function("return this")();
})();
runtimeGlobal.InitModule = InitModule;
function healthRpc(ctx, logger, nk, payload) {
  return JSON.stringify({
    status: "healthy",
    service: "tic-tac-toe",
    stage: "gamma-2-multiplayer-core",
    timestamp: Date.now()
  });
}
export {
  InitModule
};
