import { useState, useEffect } from 'react';
import { 
  PublicMatchState, 
  PlayerSymbol,
  ConnectionState 
} from './types';
import Board from './Board';
import { nakamaClient } from './nakamaClient';

interface MatchViewProps {
  matchState: PublicMatchState;
  connectionState: ConnectionState;
  onLeaveMatch?: () => void;
}

// Simple inline styles matching the repo's styling approach
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
    maxWidth: '600px',
    margin: '0 auto',
    padding: '20px',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '10px',
  },
  roomCode: {
    fontSize: '1.2rem',
    fontWeight: '600' as const,
    color: '#333',
    backgroundColor: '#f8f9fa',
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid #dee2e6',
    display: 'inline-block',
    marginBottom: '16px',
  },
  players: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '20px',
    marginBottom: '20px',
  },
  playerCard: {
    flex: '1',
    padding: '16px',
    borderRadius: '8px',
    border: '2px solid #dee2e6',
    textAlign: 'center' as const,
    backgroundColor: '#fff',
  },
  playerCardCurrent: {
    borderColor: '#007bff',
    backgroundColor: '#f0f8ff',
  },
  playerCardYou: {
    borderColor: '#28a745',
    backgroundColor: '#f0fff4',
  },
  playerName: {
    fontSize: '1.1rem',
    fontWeight: '600' as const,
    margin: '0 0 8px 0',
  },
  playerSymbol: {
    fontSize: '1.5rem',
    fontWeight: 'bold' as const,
    margin: '0 0 8px 0',
  },
  playerStatus: {
    fontSize: '0.9rem',
    color: '#666',
    margin: '0',
  },
  statusArea: {
    textAlign: 'center' as const,
    padding: '16px',
    borderRadius: '8px',
    backgroundColor: '#f8f9fa',
    border: '1px solid #dee2e6',
    marginBottom: '20px',
  },
  statusText: {
    fontSize: '1.1rem',
    fontWeight: '600' as const,
    margin: '0',
    color: '#333',
  },
  statusSubtext: {
    fontSize: '0.9rem',
    color: '#666',
    margin: '8px 0 0 0',
  },
  outcomeArea: {
    textAlign: 'center' as const,
    padding: '20px',
    borderRadius: '8px',
    backgroundColor: '#fff3cd',
    border: '1px solid #ffeaa7',
    marginBottom: '20px',
  },
  outcomeText: {
    fontSize: '1.3rem',
    fontWeight: 'bold' as const,
    margin: '0 0 8px 0',
    color: '#856404',
  },
  outcomeSubtext: {
    fontSize: '1rem',
    color: '#856404',
    margin: '0',
  },
  connectionStatus: {
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '0.9rem',
    fontWeight: '500' as const,
    textAlign: 'center' as const,
    marginBottom: '16px',
  },
  connecting: {
    backgroundColor: '#fff3e0',
    color: '#f57c00',
    border: '1px solid #ffe0b2',
  },
  reconnecting: {
    backgroundColor: '#fff3e0',
    color: '#f57c00',
    border: '1px solid #ffe0b2',
  },
  disconnected: {
    backgroundColor: '#ffebee',
    color: '#c62828',
    border: '1px solid #ffcdd2',
  },
  actionButton: {
    padding: '14px 24px',
    fontSize: '1rem',
    fontWeight: '600' as const,
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    marginTop: '10px',
  },
  actionButtonHover: {
    backgroundColor: '#5a6268',
  },
};

function MatchView({ matchState, connectionState, onLeaveMatch }: MatchViewProps) {
  console.log('DEBUG MatchView: Component rendering', { 
    matchId: matchState.matchId,
    phase: matchState.phase,
    currentTurn: matchState.currentTurn
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
      matchStatePhase: matchState.phase
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
      playerSymbol: ctx?.playerSymbol 
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
      const opponentDisconnected = playerSymbol === 'X' 
        ? !matchState.playerX?.connected 
        : !matchState.playerO?.connected;
      
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
        case 'win_row': return 'Winning row!';
        case 'win_column': return 'Winning column!';
        case 'win_diagonal': return 'Winning diagonal!';
        case 'draw_full_board': return 'Board is full';
        case 'disconnect_forfeit': return 'Disconnect forfeit';
      }
    }

    if (isReconnectGrace && matchState.reconnectDeadlineAt) {
      const timeLeft = Math.max(0, Math.floor((matchState.reconnectDeadlineAt - Date.now()) / 1000));
      return `Reconnect window: ${timeLeft}s`;
    }

    return null;
  }

  function getConnectionStatusStyle() {
    const base = styles.connectionStatus;
    
    switch (connectionState) {
      case 'connecting':
      case 'reconnecting':
        return { ...base, ...styles.connecting };
      case 'disconnected':
        return { ...base, ...styles.disconnected };
      default:
        return base;
    }
  }

  function getConnectionStatusText() {
    switch (connectionState) {
      case 'connecting': return 'Connecting to multiplayer service...';
      case 'reconnecting': return 'Reconnecting...';
      case 'disconnected': return 'Disconnected from multiplayer service';
      default: return null;
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
      phase: matchState.phase
    });
    
    // Double-check conditions before sending move
    if (!isGameActive || !isYourTurn || isSubmittingMove || connectionState !== 'connected') {
      console.log('DEBUG handleCellClick: Move blocked', { 
        isGameActive, 
        isYourTurn, 
        isSubmittingMove, 
        connectionState,
        reason: !isGameActive ? 'Game not active' : 
                !isYourTurn ? 'Not your turn' :
                isSubmittingMove ? 'Already submitting' :
                connectionState !== 'connected' ? 'Not connected' : 'Unknown'
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

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.roomCode}>
          Room: {matchState.roomCode}
        </div>
      </div>

      {connectionStatusText && (
        <div style={getConnectionStatusStyle()}>
          {connectionStatusText}
        </div>
      )}

      <div style={styles.players}>
        {/* Player X */}
        <div style={{
          ...styles.playerCard,
          ...(matchState.currentTurn === 'X' ? styles.playerCardCurrent : {}),
          ...(playerSymbol === 'X' ? styles.playerCardYou : {})
        }}>
          <div style={styles.playerSymbol}>X</div>
          <div style={styles.playerName}>
            {getPlayerDisplayName(matchState.playerX, playerSymbol === 'X')}
          </div>
          <div style={styles.playerStatus}>
            {matchState.playerX?.connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>

        {/* Player O */}
        <div style={{
          ...styles.playerCard,
          ...(matchState.currentTurn === 'O' ? styles.playerCardCurrent : {}),
          ...(playerSymbol === 'O' ? styles.playerCardYou : {})
        }}>
          <div style={styles.playerSymbol}>O</div>
          <div style={styles.playerName}>
            {getPlayerDisplayName(matchState.playerO, playerSymbol === 'O')}
          </div>
          <div style={styles.playerStatus}>
            {matchState.playerO?.connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </div>

      {isGameCompleted ? (
        <div style={styles.outcomeArea}>
          <div style={styles.outcomeText}>{statusText}</div>
          {statusSubtext && (
            <div style={styles.outcomeSubtext}>{statusSubtext}</div>
          )}
        </div>
      ) : (
        <div style={styles.statusArea}>
          <div style={styles.statusText}>{statusText}</div>
          {statusSubtext && (
            <div style={styles.statusSubtext}>{statusSubtext}</div>
          )}
        </div>
      )}

      <Board
        board={matchState.board}
        disabled={!isGameActive || !isYourTurn || isSubmittingMove || connectionState !== 'connected'}
        onCellClick={handleCellClick}
        winningLine={winningLine}
      />

      {isGameCompleted && onLeaveMatch && (
        <button
          style={styles.actionButton}
          onClick={handleLeaveMatch}
          onMouseEnter={(e) => {
            Object.assign(e.currentTarget.style, styles.actionButtonHover);
          }}
          onMouseLeave={(e) => {
            Object.assign(e.currentTarget.style, {
              backgroundColor: styles.actionButton.backgroundColor,
            });
          }}
        >
          Back to Lobby
        </button>
      )}
    </div>
  );
}

export default MatchView;