import { useState, useEffect } from 'react';
import { nakamaClient } from './nakamaClient';
import { ConnectionState, AppView, PublicMatchState, MatchEvent } from './types';
import Lobby from './Lobby';
import MatchView from './MatchView';

// Simple inline styles for Gamma 1
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '20px',
    boxSizing: 'border-box' as const,
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '40px',
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: 'bold' as const,
    color: '#333',
    margin: '0 0 10px 0',
  },
  subtitle: {
    fontSize: '1.1rem',
    color: '#666',
    margin: '0',
  },
  content: {
    maxWidth: '600px',
    margin: '0 auto',
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '30px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
  },
  loading: {
    textAlign: 'center' as const,
    padding: '40px',
    color: '#666',
  },
  connectionBanner: {
    padding: '12px 20px',
    borderRadius: '8px',
    marginBottom: '20px',
    textAlign: 'center' as const,
    fontSize: '0.9rem',
    fontWeight: '500' as const,
  },
  connected: {
    backgroundColor: '#e8f5e9',
    color: '#2e7d32',
    border: '1px solid #c8e6c9',
  },
  connecting: {
    backgroundColor: '#fff3e0',
    color: '#f57c00',
    border: '1px solid #ffe0b2',
  },
  disconnected: {
    backgroundColor: '#ffebee',
    color: '#c62828',
    border: '1px solid #ffcdd2',
  },
  nicknameForm: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  label: {
    fontSize: '1rem',
    fontWeight: '500' as const,
    color: '#333',
  },
  input: {
    padding: '12px 16px',
    fontSize: '1rem',
    border: '2px solid #ddd',
    borderRadius: '8px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  inputFocus: {
    borderColor: '#2196f3',
  },
  button: {
    padding: '14px 24px',
    fontSize: '1rem',
    fontWeight: '600' as const,
    backgroundColor: '#2196f3',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  buttonHover: {
    backgroundColor: '#1976d2',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    cursor: 'not-allowed',
  },
  error: {
    color: '#c62828',
    fontSize: '0.9rem',
    marginTop: '8px',
  },
};

function App() {
  const [view, setView] = useState<AppView>('loading');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [nickname, setNickname] = useState('');
  const [nicknameError, setNicknameError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [matchState, setMatchState] = useState<PublicMatchState | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [pendingRoomCode, setPendingRoomCode] = useState<string | null>(null);

  // Subscribe to connection state changes and match events
  useEffect(() => {
    const handleConnectionStateChange = (state: ConnectionState) => {
      setConnectionState(state);
    };

    const handleMatchEvent = (event: MatchEvent) => {
      console.log('DEBUG App handleMatchEvent:', event.type, event.data);
      switch (event.type) {
        case 'state_sync':
          console.log('DEBUG App: state_sync received', event.data);
          setMatchState(event.data as PublicMatchState);
          setMatchError(null);
          break;
          
        case 'action_rejected':
          console.log('DEBUG App: action_rejected received', event.data);
          setMatchError(event.data.message || 'Action rejected');
          break;
          
        case 'match_joined':
          console.log('DEBUG App: match_joined received', event.data);
          setView('match');
          setMatchError(null);
          break;
          
        case 'match_left':
          console.log('DEBUG App: match_left received');
          // Always return to lobby when leaving a match.
          setView('lobby');
          setMatchState(null);
          setPendingRoomCode(null);
          break;
      }
    };

    nakamaClient.addConnectionStateListener(handleConnectionStateChange);
    nakamaClient.addMatchEventListener(handleMatchEvent);
    
    // Check if we have a stored identity
    const identity = nakamaClient.getIdentity();
    if (identity) {
      setNickname(identity.nickname);
      setView('lobby');
      // If user already has an identity, try to connect automatically.
      void nakamaClient.ensureConnected();
    } else {
      setView('nickname_entry');
    }

    return () => {
      nakamaClient.removeConnectionStateListener(handleConnectionStateChange);
      nakamaClient.removeMatchEventListener(handleMatchEvent);
    };
  }, []);

  const handleNicknameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nickname.trim()) {
      setNicknameError('Please enter a nickname');
      return;
    }

    setIsSubmitting(true);
    setNicknameError('');

    const result = await nakamaClient.bootstrapWithNickname(nickname);
    
    if (result.success) {
      setView('lobby');
    } else {
      setNicknameError(result.message);
    }
    
    setIsSubmitting(false);
  };

  const handleJoinMatch = async (matchId: string, roomCode?: string) => {
    setMatchError(null);
    setPendingRoomCode(roomCode || null);
    const result = await nakamaClient.joinMatch(matchId, roomCode);
    
    if (!result.success) {
      setMatchError(result.message);
      setView('lobby');
      setPendingRoomCode(null);
    } else {
      // Ensure we transition even if the match_joined event is missed.
      setView('match');
    }
  };

  const handleLeaveMatch = () => {
    nakamaClient.leaveMatch();
    setMatchState(null);
    setMatchError(null);
    setPendingRoomCode(null);
    setView('lobby');
  };

  const getConnectionBannerStyle = () => {
    switch (connectionState) {
      case 'connected':
        return { ...styles.connectionBanner, ...styles.connected };
      case 'connecting':
      case 'reconnecting':
        return { ...styles.connectionBanner, ...styles.connecting };
      case 'disconnected':
        return { ...styles.connectionBanner, ...styles.disconnected };
    }
  };

  const getConnectionMessage = () => {
    const lastError = nakamaClient.getLastConnectionError();
    switch (connectionState) {
      case 'connected':
        return '✓ Connected to multiplayer service';
      case 'connecting':
        return 'Connecting to multiplayer service...';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'disconnected':
        return lastError
          ? `Disconnected from multiplayer service (${lastError})`
          : 'Disconnected from multiplayer service';
    }
  };

  const renderContent = () => {
    switch (view) {
      case 'loading':
        return (
          <div style={styles.loading}>
            <p>Loading...</p>
          </div>
        );

      case 'nickname_entry':
        return (
          <form onSubmit={handleNicknameSubmit} style={styles.nicknameForm}>
            <div style={styles.inputGroup}>
              <label htmlFor="nickname" style={styles.label}>
                Enter your nickname
              </label>
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Player123"
                style={styles.input}
                maxLength={20}
                autoFocus
              />
              {nicknameError && <div style={styles.error}>{nicknameError}</div>}
            </div>
            <button
              type="submit"
              style={{
                ...styles.button,
                ...(isSubmitting ? styles.buttonDisabled : {}),
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Connecting...' : 'Continue to Lobby'}
            </button>
          </form>
        );

      case 'lobby':
        return <Lobby onJoinMatch={handleJoinMatch} />;

      case 'match':
        if (!matchState) {
          const ctx = nakamaClient.getActiveMatchContext();
          if (!ctx?.matchId) {
            return (
              <div style={styles.loading}>
                <p>Joining match...</p>
                {matchError && <div style={styles.error}>{matchError}</div>}
              </div>
            );
          }

          // Allow rendering a "waiting room" view before the first authoritative state sync arrives.
          const roomCode = pendingRoomCode || ctx.roomCode || '...';
          const placeholderState: PublicMatchState = {
            matchId: ctx.matchId,
            roomCode,
            mode: 'classic',
            phase: 'waiting_for_opponent',
            board: Array(9).fill(null),
            playerX: null,
            playerO: null,
            currentTurn: 'X', // Backend initializes with X as currentTurn
            winner: null,
            outcomeReason: null,
            moveCount: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            reconnectDeadlineAt: null,
          };

          return (
            <MatchView
              matchState={placeholderState}
              connectionState={connectionState}
              onLeaveMatch={handleLeaveMatch}
            />
          );
        }
        return (
          <MatchView
            matchState={matchState}
            connectionState={connectionState}
            onLeaveMatch={handleLeaveMatch}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>LILA Tic-Tac-Toe</h1>
        <p style={styles.subtitle}>Server-authoritative multiplayer</p>
      </header>

      <div style={styles.content}>
        {view !== 'loading' && (
          <div style={getConnectionBannerStyle()}>
            {getConnectionMessage()}
          </div>
        )}
        
        {matchError && view !== 'match' && (
          <div style={{ ...styles.connectionBanner, ...styles.disconnected, marginBottom: '20px' }}>
            {matchError}
          </div>
        )}
        
        {renderContent()}
      </div>
    </div>
  );
}

export default App;
