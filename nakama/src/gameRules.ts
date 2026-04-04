/**
 * Pure side-effect-free gameplay rules module for classic Tic-Tac-Toe.
 * Does not know about Nakama presences, RPCs, sockets, or rooming.
 */

type CellValue = "X" | "O" | null;
type BoardState = CellValue[];
type WinningSymbol = "X" | "O";
type OutcomeReason = "win_row" | "win_column" | "win_diagonal" | "draw_full_board" | "disconnect_forfeit";

const BOARD_SIZE = 9;
const ROWS = 3;
const COLS = 3;

/**
 * Create an empty 3x3 Tic-Tac-Toe board
 */
function createEmptyBoard(): BoardState {
  const board: BoardState = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    board.push(null);
  }
  return board;
}

/**
 * Check if a cell index is valid (0-8)
 */
function isValidCellIndex(index: number): boolean {
  return index >= 0 && index < BOARD_SIZE;
}

/**
 * Check if a cell is empty
 */
function isCellEmpty(board: BoardState, index: number): boolean {
  if (!isValidCellIndex(index)) {
    return false;
  }
  return board[index] === null;
}

/**
 * Get the next turn symbol
 */
function getNextTurn(currentTurn: "X" | "O"): "X" | "O" {
  return currentTurn === "X" ? "O" : "X";
}

/**
 * Apply a move to the board, returning a new board without mutating the input
 */
function applyMove(board: BoardState, index: number, symbol: "X" | "O"): BoardState {
  if (!isValidCellIndex(index) || !isCellEmpty(board, index)) {
    throw new Error("Invalid move: index " + index + " is not empty or out of bounds");
  }
  
  const newBoard = board.slice(0);
  newBoard[index] = symbol;
  return newBoard;
}

/**
 * Get the winning symbol if there is one, otherwise null
 */
function getWinner(board: BoardState): WinningSymbol | null {
  // Check rows
  for (let row = 0; row < ROWS; row++) {
    const start = row * COLS;
    if (board[start] && board[start] === board[start + 1] && board[start] === board[start + 2]) {
      return board[start] as WinningSymbol;
    }
  }
  
  // Check columns
  for (let col = 0; col < COLS; col++) {
    if (board[col] && board[col] === board[col + COLS] && board[col] === board[col + 2 * COLS]) {
      return board[col] as WinningSymbol;
    }
  }
  
  // Check diagonals
  if (board[0] && board[0] === board[4] && board[0] === board[8]) {
    return board[0] as WinningSymbol;
  }
  if (board[2] && board[2] === board[4] && board[2] === board[6]) {
    return board[2] as WinningSymbol;
  }
  
  return null;
}

/**
 * Get the reason for a win (row, column, or diagonal)
 */
function getWinReason(board: BoardState): "win_row" | "win_column" | "win_diagonal" | null {
  // Check rows
  for (let row = 0; row < ROWS; row++) {
    const start = row * COLS;
    if (board[start] && board[start] === board[start + 1] && board[start] === board[start + 2]) {
      return "win_row";
    }
  }
  
  // Check columns
  for (let col = 0; col < COLS; col++) {
    if (board[col] && board[col] === board[col + COLS] && board[col] === board[col + 2 * COLS]) {
      return "win_column";
    }
  }
  
  // Check diagonals
  if (board[0] && board[0] === board[4] && board[0] === board[8]) {
    return "win_diagonal";
  }
  if (board[2] && board[2] === board[4] && board[2] === board[6]) {
    return "win_diagonal";
  }
  
  return null;
}

/**
 * Check if the board is completely full
 */
function isBoardFull(board: BoardState): boolean {
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) return false;
  }
  return true;
}

/**
 * Evaluate the board outcome
 */
function evaluateBoardOutcome(board: BoardState): {
  winner: "X" | "O" | null;
  outcomeReason: "win_row" | "win_column" | "win_diagonal" | "draw_full_board" | null;
} {
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
