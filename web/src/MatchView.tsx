import { useState, useEffect } from 'react';
import {
  PublicMatchState,
  PlayerSymbol,
  ConnectionState,
} from './types';
import Board from './Board';
import { nakamaClient } from './nakamaClient';

interface MatchViewProps {
  matchState: PublicMatchState;
  connectionState: ConnectionState;
  onLeaveMatch?: () => void;
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

function MatchView({ matchState, connectionState, onLeaveMatch }: MatchViewProps) {
  console.log('DEBUG MatchView: Component rendering', {
    matchId: matchState.matchId,
    phase: matchState.phase,
    currentTurn: matchState.currentTurn,
  });

  const [isSubmittingMove, setIsSubmittingMove] = useState(false);
  const [lastActionRejection, setLastActionRejection] = useState<string | null>(null);

  // Clear rejection when match state changes significantly (e.g., new match)
  useEffect(() => {
    console.log('DEBUG MatchView: matchId changed or component mounted', matchState.matchId);
    setLastActionRejection(null);
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
        setLastActionRejection(event.data.message || 'Action rejected');
        // Clear rejection after 3 seconds
        setTimeout(() => {
          console.log('DEBUG MatchView: Clearing lastActionRejection after timeout');
          setLastActionRejection(null);
        }, 3000);
      } else if (event.type === 'state_sync') {
        console.log('DEBUG MatchView: Clearing lastActionRejection on state_sync');
        // Clear any stale rejection errors when we receive fresh state
        setLastActionRejection(null);
      }
    };

    console.log('DEBUG MatchView: Adding match event listener');
    nakamaClient.addMatchEventListener(handleMatchEvent);
    return () => {
      console.log('DEBUG MatchView: Removing match event listener');
      nakamaClient.removeMatchEventListener(handleMatchEvent);
    };
  }, []); // Empty dependency array to run once

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
      if (isYourTurn) return 'Your turn!';
      return "Opponent's turn";
    }

    return 'Ready to start';
  }

  function getStatusSubtext(): string | null {
    if (lastActionRejection) return lastActionRejection;

    if (isGameCompleted && matchState.outcomeReason) {
      switch (matchState.outcomeReason) {
        case 'win_row':
          return 'Winning row!';
        case 'win_column':
          return 'Winning column!';
        case 'win_diagonal':
          return 'Winning diagonal!';
        case 'draw_full_board':
          return 'Board is full';
        case 'disconnect_forfeit':
          return 'Disconnect forfeit';
      }
    }

    if (isReconnectGrace && matchState.reconnectDeadlineAt) {
      const timeLeft = Math.max(0, Math.floor((matchState.reconnectDeadlineAt - Date.now()) / 1000));
      return `Reconnect window: ${timeLeft}s`;
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
    });

    // Double-check conditions before sending move
    if (!isGameActive || !isYourTurn || isSubmittingMove || connectionState !== 'connected') {
      console.log('DEBUG handleCellClick: Move blocked', {
        isGameActive,
        isYourTurn,
        isSubmittingMove,
        connectionState,
        reason: !isGameActive
          ? 'Game not active'
          : !isYourTurn
            ? 'Not your turn'
            : isSubmittingMove
              ? 'Already submitting'
              : connectionState !== 'connected'
                ? 'Not connected'
                : 'Unknown',
      });
      return;
    }

    // Validate index
    if (typeof index !== 'number' || index < 0 || index > 8) {
      console.error('DEBUG handleCellClick: Invalid index', index);
      return;
    }

    console.log('DEBUG handleCellClick: Sending move');
    setIsSubmittingMove(true);
    setLastActionRejection(null);

    const result = await nakamaClient.sendMoveIntent(index);

    if (!result.success) {
      console.log('DEBUG handleCellClick: Move failed', result.message);
      setLastActionRejection(result.message);
    } else {
      console.log('DEBUG handleCellClick: Move sent successfully');
    }

    setIsSubmittingMove(false);
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
          {statusSubtext && <div className="match-status-panel__sub">{statusSubtext}</div>}
        </div>
      )}

      <div className="match-board-wrap">
        <Board
          board={matchState.board}
          disabled={!isGameActive || !isYourTurn || isSubmittingMove || connectionState !== 'connected'}
          onCellClick={handleCellClick}
          winningLine={winningLine}
        />
      </div>

      {isGameCompleted && onLeaveMatch && (
        <div className="match-actions">
          <button type="button" className="btn btn--muted btn--block" onClick={handleLeaveMatch}>
            Back to Lobby
          </button>
        </div>
      )}
    </div>
  );
}

export default MatchView;
