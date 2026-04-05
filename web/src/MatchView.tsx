import { useState, useEffect } from 'react';
import {
  PublicMatchState,
  PlayerSymbol,
  ConnectionState,
  UserFacingMoveRejectReason,
  UserFacingOutcomeReason,
} from './types';
import Board from './Board';
import { nakamaClient } from './nakamaClient';

interface MatchViewProps {
  matchState: PublicMatchState;
  connectionState: ConnectionState;
  onLeaveMatch?: () => void;
  debugEnabled?: boolean;
  onOpenLeaderboard?: () => void;
}

function connectionMatchClass(state: ConnectionState): string {
  const base = 'match-connection';
  switch (state) {
    case 'connecting':
    case 'reconnecting':
      return `${base} match-connection--warn`;
    case 'disconnected':
      return `${base} match-connection--danger`;
    default:
      return base;
  }
}

function MatchView({
  matchState,
  connectionState,
  onLeaveMatch,
  debugEnabled = false,
  onOpenLeaderboard,
}: MatchViewProps) {
  console.log('DEBUG MatchView: Component rendering', {
    matchId: matchState.matchId,
    phase: matchState.phase,
    currentTurn: matchState.currentTurn,
  });

  const [isSubmittingMove, setIsSubmittingMove] = useState(false);
  const [lastActionRejection, setLastActionRejection] = useState<string | null>(null);
  const [pendingMoveIndex, setPendingMoveIndex] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  // Gamma 2: rematch state
  const [isSubmittingRematch, setIsSubmittingRematch] = useState(false);
  const [debugOverlayDismissed, setDebugOverlayDismissed] = useState(false);

  // Clear rejection when match state changes significantly (e.g., new match)
  useEffect(() => {
    console.log('DEBUG MatchView: matchId changed or component mounted', matchState.matchId);
    setLastActionRejection(null);
    
    // Check for pending move from storage
    const pendingMove = nakamaClient.getPendingMove();
    if (pendingMove) {
      setPendingMoveIndex(pendingMove.index);
    } else {
      setPendingMoveIndex(null);
    }
  }, [matchState.matchId]);

  useEffect(() => {
    setDebugOverlayDismissed(false);
  }, [matchState.matchId]);

  // Log when component mounts/unmounts
  useEffect(() => {
    console.log('DEBUG MatchView: Component mounted');
    return () => {
      console.log('DEBUG MatchView: Component unmounted');
    };
  }, []);

  const userId = nakamaClient.getUserId();
  const playerSymbol = getPlayerSymbol();
  const isYourTurn = matchState.currentTurn === playerSymbol;
  const isGameActive = matchState.phase === 'in_progress';
  const isGameCompleted = matchState.phase === 'completed';
  const isWaitingForOpponent = matchState.phase === 'waiting_for_opponent';
  const isReconnectGrace = matchState.phase === 'reconnect_grace';

  // Get winning line indices for visual highlighting
  const winningLine = getWinningLine(matchState);

  // Listen for action rejections and state sync
  useEffect(() => {
    const handleMatchEvent = (event: any) => {
      console.log('DEBUG MatchView handleMatchEvent:', event.type, event.data);
      if (event.type === 'action_rejected') {
        console.log('DEBUG MatchView: Setting lastActionRejection to:', event.data.message);
        // Map rejection reason to user-friendly message
        const rejectionMessage = getRejectionMessage(event.data.reason);
        setLastActionRejection(rejectionMessage);
        // Clear pending move on rejection
        setPendingMoveIndex(null);
        // Clear rejection after 3 seconds
        setTimeout(() => {
          console.log('DEBUG MatchView: Clearing lastActionRejection after timeout');
          setLastActionRejection(null);
        }, 3000);
      } else if (event.type === 'state_sync') {
        console.log('DEBUG MatchView: Clearing lastActionRejection on state_sync');
        // Clear any stale rejection errors when we receive fresh state
        setLastActionRejection(null);
        // Update pending move index from client
        const pendingMove = nakamaClient.getPendingMove();
        if (pendingMove) {
          setPendingMoveIndex(pendingMove.index);
        } else {
          setPendingMoveIndex(null);
        }
      }
    };

    console.log('DEBUG MatchView: Adding match event listener');
    nakamaClient.addMatchEventListener(handleMatchEvent);
    return () => {
      console.log('DEBUG MatchView: Removing match event listener');
      nakamaClient.removeMatchEventListener(handleMatchEvent);
    };
  }, []); // Empty dependency array to run once

  // Timer effect for timed mode
  useEffect(() => {
    console.log('DEBUG Timer effect: mode=', matchState.mode, 
                'phase=', matchState.phase, 
                'turnDeadlineAt=', matchState.turnDeadlineAt,
                'remainingTurnMs=', matchState.remainingTurnMs,
                'currentTurn=', matchState.currentTurn,
                'version=', matchState.version,
                'full state=', matchState);
    
    if (matchState.mode === 'timed' && 
        matchState.phase === 'in_progress' && 
        matchState.turnDeadlineAt) {
      
      const updateTimer = () => {
        const now = Date.now();
        const remaining = Math.max(0, matchState.turnDeadlineAt! - now);
        setTimeRemaining(Math.floor(remaining / 1000));
      };
      
      // Update immediately
      updateTimer();
      
      // Update every second
      const interval = setInterval(updateTimer, 1000);
      
      return () => clearInterval(interval);
    } else {
      setTimeRemaining(null);
    }
  }, [matchState.mode, matchState.phase, matchState.turnDeadlineAt]);

  function getPlayerSymbol(): PlayerSymbol | null {
    console.log('DEBUG getPlayerSymbol: called', {
      userId,
      matchStatePlayerX: matchState.playerX?.userId,
      matchStatePlayerO: matchState.playerO?.userId,
      matchStatePhase: matchState.phase,
    });

    if (!userId) {
      console.log('DEBUG getPlayerSymbol: No userId');
      return null;
    }

    // First check matchState (authoritative)
    if (matchState.playerX?.userId === userId) {
      console.log('DEBUG getPlayerSymbol: Found X in matchState');
      return 'X';
    }
    if (matchState.playerO?.userId === userId) {
      console.log('DEBUG getPlayerSymbol: Found O in matchState');
      return 'O';
    }

    // If matchState doesn't have user info yet (placeholder state),
    // check active match context which gets updated from state_sync
    const ctx = nakamaClient.getActiveMatchContext();
    console.log('DEBUG getPlayerSymbol: Checking active context', {
      ctx,
      playerSymbol: ctx?.playerSymbol,
    });
    return ctx?.playerSymbol || null;
  }

  function getWinningLine(matchState: PublicMatchState): number[] | null {
    if (!matchState.winner || !matchState.outcomeReason) return null;

    // Simple implementation - in a real app, you'd compute the actual winning line
    // For Gamma 3, we'll just highlight all cells of the winner
    const winnerSymbol = matchState.winner;
    const line: number[] = [];

    matchState.board.forEach((cell, index) => {
      if (cell === winnerSymbol) {
        line.push(index);
      }
    });

    return line.length >= 3 ? line : null;
  }

  function getPlayerDisplayName(player: typeof matchState.playerX, isYou: boolean): string {
    if (!player) return 'Waiting...';
    const nickname = player.nickname?.trim() || 'Player';
    return isYou ? `${nickname} (You)` : nickname;
  }

  function getStatusText(): string {
    if (isGameCompleted) {
      if (matchState.winner === playerSymbol) return 'You win!';
      if (matchState.winner && matchState.winner !== playerSymbol) return 'You lose!';
      if (matchState.outcomeReason === 'draw_full_board') return 'Game ended in a draw!';
      if (matchState.outcomeReason === 'disconnect_forfeit') {
        return matchState.winner === playerSymbol
          ? 'Opponent disconnected. You win by forfeit!'
          : 'You disconnected. Opponent wins by forfeit!';
      }
      return 'Game completed';
    }

    if (isReconnectGrace) {
      const opponentDisconnected =
        playerSymbol === 'X' ? !matchState.playerX?.connected : !matchState.playerO?.connected;

      if (opponentDisconnected) return 'Opponent reconnecting...';
      return 'You reconnected. Waiting for opponent...';
    }

    if (isWaitingForOpponent) return 'Waiting for opponent...';

    if (isGameActive) {
      if (pendingMoveIndex !== null) {
        return 'Waiting for server confirmation...';
      }
      if (isYourTurn) return 'Your turn!';
      return "Opponent's turn";
    }

    return 'Ready to start';
  }

  // Helper function to get user-friendly rejection messages
  function getRejectionMessage(reason: UserFacingMoveRejectReason): string {
    switch (reason) {
      case 'not_your_turn':
        return 'Move rejected: not your turn';
      case 'cell_taken':
        return 'Move rejected: that cell is already taken';
      case 'game_not_in_progress':
      case 'reconnect_in_progress':
        return 'Move rejected: the game is not accepting moves right now';
      case 'invalid_payload':
        return 'Move rejected: invalid move';
      case 'stale_state':
        return 'State changed - please try again';
      case 'duplicate_action':
        return 'Move already processed';
      default:
        return 'Move rejected';
    }
  }

  // Helper function to get user-friendly outcome explanations
  function getOutcomeExplanation(reason: UserFacingOutcomeReason, isWinner: boolean): string {
    if (isWinner) {
      switch (reason) {
        case 'win_row':
          return 'You won by row!';
        case 'win_column':
          return 'You won by column!';
        case 'win_diagonal':
          return 'You won by diagonal!';
        case 'draw_full_board':
          return 'Draw after 9 moves';
        case 'disconnect_forfeit':
          return 'Opponent disconnected and did not return';
        case 'timeout_forfeit':
          return 'Opponent timed out';
        default:
          return 'You win!';
      }
    } else {
      switch (reason) {
        case 'win_row':
          return 'Opponent won by row';
        case 'win_column':
          return 'Opponent won by column';
        case 'win_diagonal':
          return 'Opponent won by diagonal';
        case 'draw_full_board':
          return 'Draw after 9 moves';
        case 'disconnect_forfeit':
          return 'You disconnected and did not return';
        case 'timeout_forfeit':
          return 'You lost on time';
        default:
          return 'You lose!';
      }
    }
  }

  function getStatusSubtext(): string | null {
    if (lastActionRejection) return lastActionRejection;

    if (isGameCompleted && matchState.outcomeReason) {
      const isWinner = matchState.winner === playerSymbol;
      if (matchState.outcomeReason === 'timeout_forfeit') {
        return isWinner ? 'Opponent timed out' : 'You lost on time';
      }
      return getOutcomeExplanation(matchState.outcomeReason, isWinner);
    }

    if (isReconnectGrace) {
      if (matchState.reconnectDeadlineAt) {
        const timeLeft = Math.max(0, Math.floor((matchState.reconnectDeadlineAt - Date.now()) / 1000));
        if (matchState.mode === 'timed' && matchState.remainingTurnMs !== null) {
          return `Timer paused · Reconnect: ${timeLeft}s`;
        }
        return `Reconnect window: ${timeLeft}s`;
      }
      if (matchState.mode === 'timed') {
        return 'Timer paused while opponent reconnects';
      }
    }

    // Timer display for timed mode
    if (matchState.mode === 'timed' && timeRemaining !== null) {
      if (matchState.phase === 'in_progress') {
        return `${timeRemaining}s remaining`;
      }
    }

    return null;
  }

  function getOutcomeVariant(): 'win' | 'lose' | 'draw' | 'neutral' {
    if (!isGameCompleted) return 'neutral';
    if (matchState.winner === playerSymbol) return 'win';
    if (matchState.winner && matchState.winner !== playerSymbol) return 'lose';
    if (matchState.outcomeReason === 'draw_full_board') return 'draw';
    return 'neutral';
  }

  function getConnectionStatusText() {
    switch (connectionState) {
      case 'connecting':
        return 'Connecting to multiplayer service...';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'disconnected':
        return 'Disconnected from multiplayer service';
      default:
        return null;
    }
  }

  async function handleCellClick(index: number) {
    console.log('DEBUG handleCellClick: called', {
      index,
      isGameActive,
      isYourTurn,
      isSubmittingMove,
      connectionState,
      playerSymbol: getPlayerSymbol(),
      currentTurn: matchState.currentTurn,
      phase: matchState.phase,
      pendingMoveIndex,
    });

    // Validate index
    if (typeof index !== 'number' || index < 0 || index > 8) {
      console.error('DEBUG handleCellClick: Invalid index', index);
      return;
    }

    // Check for locally knowable invalid states and show rejection messages
    if (connectionState !== 'connected') {
      console.log('DEBUG handleCellClick: Not connected');
      setLastActionRejection('Move rejected: not connected to multiplayer service');
      setTimeout(() => setLastActionRejection(null), 3000);
      return;
    }

    if (pendingMoveIndex !== null) {
      console.log('DEBUG handleCellClick: Already has pending move');
      setLastActionRejection('Waiting for server confirmation on previous move');
      setTimeout(() => setLastActionRejection(null), 3000);
      return;
    }

    if (isSubmittingMove) {
      console.log('DEBUG handleCellClick: Already submitting move');
      setLastActionRejection('Move already in progress');
      setTimeout(() => setLastActionRejection(null), 3000);
      return;
    }

    if (!isGameActive) {
      console.log('DEBUG handleCellClick: Game not active');
      const rejectionReason = matchState.phase === 'reconnect_grace' 
        ? 'reconnect_in_progress' 
        : 'game_not_in_progress';
      const rejectionMessage = getRejectionMessage(rejectionReason);
      setLastActionRejection(rejectionMessage);
      setTimeout(() => setLastActionRejection(null), 3000);
      return;
    }

    if (!isYourTurn) {
      console.log('DEBUG handleCellClick: Not your turn');
      const rejectionMessage = getRejectionMessage('not_your_turn');
      setLastActionRejection(rejectionMessage);
      setTimeout(() => setLastActionRejection(null), 3000);
      return;
    }

    // Check if cell is already occupied
    if (matchState.board[index] !== null) {
      console.log('DEBUG handleCellClick: Cell already taken');
      const rejectionMessage = getRejectionMessage('cell_taken');
      setLastActionRejection(rejectionMessage);
      setTimeout(() => setLastActionRejection(null), 3000);
      return;
    }

    // All local checks passed, send move to server
    console.log('DEBUG handleCellClick: Sending move');
    setIsSubmittingMove(true);
    setLastActionRejection(null);
    setPendingMoveIndex(index); // Set pending move visually

    const result = await nakamaClient.sendMoveIntent(index);

    if (!result.success) {
      console.log('DEBUG handleCellClick: Move failed', result.message);
      setLastActionRejection(result.message);
      setPendingMoveIndex(null); // Clear pending move on failure
    } else {
      console.log('DEBUG handleCellClick: Move sent successfully');
      // Pending move will be cleared by state_sync or action_rejected events
    }

    setIsSubmittingMove(false);
  }

  // Gamma 2: rematch helpers
  function getRematchState() {
    if (!isGameCompleted || !playerSymbol) {
      return null;
    }

    const currentUserRequestedRematch = playerSymbol === 'X' 
      ? matchState.rematchRequestedByX 
      : matchState.rematchRequestedByO;
    const opponentRequestedRematch = playerSymbol === 'X'
      ? matchState.rematchRequestedByO
      : matchState.rematchRequestedByX;

    const currentUserFlag = currentUserRequestedRematch || false;
    const opponentFlag = opponentRequestedRematch || false;
    
    return {
      currentUserRequestedRematch: currentUserFlag,
      opponentRequestedRematch: opponentFlag,
      bothRequested: currentUserFlag && opponentFlag
    };
  }

  async function handleRematchClick() {
    if (!isGameCompleted || isSubmittingRematch || !playerSymbol) {
      return;
    }

    const rematchState = getRematchState();
    if (!rematchState) return;

    setIsSubmittingRematch(true);
    setLastActionRejection(null);

    // Determine which opcode to send based on whether opponent has already requested
    let result;
    if (rematchState.opponentRequestedRematch) {
      // Opponent already requested, we're accepting
      result = await nakamaClient.acceptRematch();
    } else {
      // We're initiating the request
      result = await nakamaClient.requestRematch();
    }

    if (!result.success) {
      setLastActionRejection(result.message);
      // Clear rejection after 3 seconds
      setTimeout(() => setLastActionRejection(null), 3000);
    }

    setIsSubmittingRematch(false);
  }

  function handleLeaveMatch() {
    if (onLeaveMatch) {
      onLeaveMatch();
    }
  }

  const connectionStatusText = getConnectionStatusText();
  const statusText = getStatusText();
  const statusSubtext = getStatusSubtext();
  const outcomeVariant = getOutcomeVariant();

  const storedPending = nakamaClient.getPendingMove();
  const pendingDebug =
    storedPending != null
      ? `cell ${storedPending.index} (sent ${Math.max(0, Math.round((Date.now() - storedPending.timestamp) / 1000))}s ago)`
      : pendingMoveIndex != null
        ? `cell ${pendingMoveIndex} (local)`
        : '—';

  function playerCardClass(symbol: 'X' | 'O'): string {
    const parts = ['match-player-card', symbol === 'X' ? 'match-player-card--x' : 'match-player-card--o'];
    if (matchState.currentTurn === symbol) parts.push('match-player-card--turn');
    if (playerSymbol === symbol) parts.push('match-player-card--you');
    return parts.join(' ');
  }

  function seatStatusClass(connected: boolean | undefined): string {
    const base = 'match-player-card__status';
    if (connected) return `${base} match-player-card__status--live`;
    return `${base} match-player-card__status--gone`;
  }

  return (
    <div className="match-view">
      <div className="match-topbar">
        <div className="match-room-chip" aria-label={`Room code ${matchState.roomCode}`}>
          <span className="match-room-chip__label">Room</span>
          <span>{matchState.roomCode}</span>
        </div>
      </div>

      {connectionStatusText && (
        <div className={connectionMatchClass(connectionState)} role="status">
          {connectionStatusText}
        </div>
      )}

      <div className="match-player-strip">
        <div className={playerCardClass('X')}>
          <div className="match-player-card__mark" aria-hidden="true">
            X
          </div>
          <div className="match-player-card__name">
            {getPlayerDisplayName(matchState.playerX, playerSymbol === 'X')}
          </div>
          <p className={seatStatusClass(matchState.playerX?.connected)}>
            {matchState.playerX?.connected ? 'Connected' : 'Disconnected'}
          </p>
        </div>

        <div className={playerCardClass('O')}>
          <div className="match-player-card__mark" aria-hidden="true">
            O
          </div>
          <div className="match-player-card__name">
            {getPlayerDisplayName(matchState.playerO, playerSymbol === 'O')}
          </div>
          <p className={seatStatusClass(matchState.playerO?.connected)}>
            {matchState.playerO?.connected ? 'Connected' : 'Disconnected'}
          </p>
        </div>
      </div>

      {isGameCompleted ? (
        <div className={`match-outcome match-outcome--${outcomeVariant}`}>
          <div className="match-outcome__title">{statusText}</div>
          {statusSubtext && <div className="match-outcome__sub">{statusSubtext}</div>}
        </div>
      ) : (
        <div className="match-status-panel">
          <div className="match-status-panel__title">{statusText}</div>
          {statusSubtext && (
            <div className={`match-status-panel__sub ${
              matchState.mode === 'timed' && timeRemaining !== null && timeRemaining <= 5 ? 'match-status-panel__sub--urgent' : ''
            }`}>
              {statusSubtext}
            </div>
          )}
        </div>
      )}

      <div className="match-board-wrap">
        <Board
          board={matchState.board}
          disabled={!isGameActive || !isYourTurn || isSubmittingMove || connectionState !== 'connected' || pendingMoveIndex !== null}
          onCellClick={handleCellClick}
          winningLine={winningLine}
          pendingCellIndex={pendingMoveIndex}
        />
      </div>

      {isGameCompleted && (
        <div className="match-actions">
          {/* Gamma 2: rematch handshake panel */}
          {playerSymbol && (
            <div className="match-rematch-panel">
              {(() => {
                const rematchState = getRematchState();
                if (!rematchState) return null;

                if (rematchState.bothRequested) {
                  return (
                    <div className="match-rematch-status">
                      <p className="match-rematch-status__text">Rematch accepted! Waiting for server...</p>
                    </div>
                  );
                } else if (rematchState.currentUserRequestedRematch) {
                  return (
                    <div className="match-rematch-status">
                      <p className="match-rematch-status__text">Waiting for opponent to accept rematch…</p>
                      <button
                        type="button"
                        className="btn btn--muted btn--block"
                        disabled={true}
                      >
                        Rematch Requested
                      </button>
                    </div>
                  );
                } else if (rematchState.opponentRequestedRematch) {
                  return (
                    <>
                      <div className="match-rematch-status">
                        <p className="match-rematch-status__text">Opponent wants a rematch.</p>
                      </div>
                      <button
                        type="button"
                        className="btn btn--primary btn--block"
                        onClick={handleRematchClick}
                        disabled={isSubmittingRematch}
                      >
                        {isSubmittingRematch ? 'Accepting...' : 'Accept rematch'}
                      </button>
                    </>
                  );
                } else {
                  return (
                    <button
                      type="button"
                      className="btn btn--primary btn--block"
                      onClick={handleRematchClick}
                      disabled={isSubmittingRematch}
                    >
                      {isSubmittingRematch ? 'Requesting...' : 'Rematch'}
                    </button>
                  );
                }
              })()}
            </div>
          )}

          {/* Gamma 2: requeue calmness */}
          {onOpenLeaderboard && (
            <button
              type="button"
              className="btn btn--secondary btn--block"
              onClick={onOpenLeaderboard}
            >
              Leaderboard
            </button>
          )}

          {onLeaveMatch && (
            <button 
              type="button" 
              className="btn btn--muted btn--block" 
              onClick={handleLeaveMatch}
            >
              Find another match
            </button>
          )}
        </div>
      )}

      {debugEnabled && !debugOverlayDismissed && (
        <div className="match-debug-overlay" aria-label="Debug panel">
          <div className="match-debug-overlay__head">
            <span className="match-debug-overlay__title">Debug</span>
            <button
              type="button"
              className="match-debug-overlay__dismiss"
              onClick={() => setDebugOverlayDismissed(true)}
              aria-label="Dismiss debug panel"
            >
              ×
            </button>
          </div>
          <div className="match-debug-overlay__body">
            <div className="match-debug-row">
              <span className="match-debug-row__k">matchId</span>
              <span className="match-debug-row__v">{matchState.matchId ?? '—'}</span>
            </div>
            <div className="match-debug-row">
              <span className="match-debug-row__k">roomCode</span>
              <span className="match-debug-row__v">{matchState.roomCode ?? '—'}</span>
            </div>
            <div className="match-debug-row">
              <span className="match-debug-row__k">mode</span>
              <span className="match-debug-row__v">{matchState.mode ?? '—'}</span>
            </div>
            <div className="match-debug-row">
              <span className="match-debug-row__k">userId</span>
              <span className="match-debug-row__v">{userId ?? '—'}</span>
            </div>
            <div className="match-debug-row">
              <span className="match-debug-row__k">nickname</span>
              <span className="match-debug-row__v">{nakamaClient.getNickname() || '—'}</span>
            </div>
            <div className="match-debug-row">
              <span className="match-debug-row__k">symbol</span>
              <span className="match-debug-row__v">{playerSymbol ?? '—'}</span>
            </div>
            <div className="match-debug-row">
              <span className="match-debug-row__k">phase</span>
              <span className="match-debug-row__v">{matchState.phase ?? '—'}</span>
            </div>
            <div className="match-debug-row">
              <span className="match-debug-row__k">version</span>
              <span className="match-debug-row__v">{matchState.version ?? '—'}</span>
            </div>
            <div className="match-debug-row">
              <span className="match-debug-row__k">connectionState</span>
              <span className="match-debug-row__v">{connectionState}</span>
            </div>
            <div className="match-debug-row">
              <span className="match-debug-row__k">lastStateSync</span>
              <span className="match-debug-row__v">
                {matchState.updatedAt != null ? String(matchState.updatedAt) : '—'}
              </span>
            </div>
            <div className="match-debug-row">
              <span className="match-debug-row__k">turnDeadlineAt</span>
              <span className="match-debug-row__v">
                {matchState.turnDeadlineAt != null ? String(matchState.turnDeadlineAt) : '—'}
              </span>
            </div>
            <div className="match-debug-row">
              <span className="match-debug-row__k">remainingTurnMs</span>
              <span className="match-debug-row__v">
                {matchState.remainingTurnMs != null ? String(matchState.remainingTurnMs) : '—'}
              </span>
            </div>
            <div className="match-debug-row">
              <span className="match-debug-row__k">reconnectDeadlineAt</span>
              <span className="match-debug-row__v">
                {matchState.reconnectDeadlineAt != null ? String(matchState.reconnectDeadlineAt) : '—'}
              </span>
            </div>
            <div className="match-debug-row">
              <span className="match-debug-row__k">statsCommitted</span>
              <span className="match-debug-row__v">
                {matchState.statsCommitted === undefined ? '—' : String(matchState.statsCommitted)}
              </span>
            </div>
            <div className="match-debug-row">
              <span className="match-debug-row__k">pendingMove</span>
              <span className="match-debug-row__v">{pendingDebug}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MatchView;
