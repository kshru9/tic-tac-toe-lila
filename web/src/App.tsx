import { useState, useEffect } from 'react';
import './theme.css';
import { nakamaClient } from './nakamaClient';
import { ConnectionState, AppView, PublicMatchState, MatchEvent } from './types';
import Lobby from './Lobby';
import MatchView from './MatchView';

function connectionBannerClass(state: ConnectionState): string {
  const base = 'app-connection-banner';
  switch (state) {
    case 'connected':
      return `${base} app-connection-banner--connected`;
    case 'connecting':
    case 'reconnecting':
      return `${base} app-connection-banner--pending`;
    case 'disconnected':
      return `${base} app-connection-banner--disconnected`;
  }
}

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

      // Check if we have an active match to resume
      const activeMatch = nakamaClient.getActiveMatchContext();
      if (activeMatch?.matchId) {
        // We have an active match, try to reconnect and resume
        setView('match');
        setPendingRoomCode(activeMatch.roomCode);
        void nakamaClient.ensureConnected().then(() => {
          // After connection, try to rejoin the match
          if (nakamaClient.getConnectionState() === 'connected') {
            void nakamaClient.joinMatch(activeMatch.matchId, activeMatch.roomCode);
          }
        });
      } else {
        // No active match, go to lobby
        setView('lobby');
        // If user already has an identity, try to connect automatically.
        void nakamaClient.ensureConnected();
      }
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
          <div className="app-loading">
            <p>Loading...</p>
          </div>
        );

      case 'nickname_entry':
        return (
          <form onSubmit={handleNicknameSubmit} className="app-form-stack">
            <div className="app-field">
              <label htmlFor="nickname" className="app-field__label">
                Enter your nickname
              </label>
              <input
                id="nickname"
                type="text"
                className="input"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Player123"
                maxLength={20}
                autoFocus
              />
              {nicknameError && <div className="app-field__error">{nicknameError}</div>}
            </div>
            <button
              type="submit"
              className="btn btn--primary btn--block"
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
              <div className="app-loading">
                <p>Joining match...</p>
                {matchError && <div className="app-field__error">{matchError}</div>}
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
    <div className="app-root">
      <div className="app-background" aria-hidden="true" />
      <div className="app-shell">
        <header className="app-brand">
          <h1 className="app-brand__title">LILA Tic-Tac-Toe</h1>
          <p className="app-brand__subtitle">Server-authoritative multiplayer</p>
        </header>

        <main className="app-stage">
          <div className="app-card">
            {view !== 'loading' && (
              <div className={connectionBannerClass(connectionState)} role="status">
                {getConnectionMessage()}
              </div>
            )}

            {matchError && view !== 'match' && (
              <div className="app-connection-banner app-connection-banner--error app-connection-banner--spaced">
                {matchError}
              </div>
            )}

            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
