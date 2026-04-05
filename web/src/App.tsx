import { useState, useEffect } from 'react';
import './theme.css';
import { nakamaClient } from './nakamaClient';
import { ConnectionState, AppView, PublicMatchState, MatchEvent, BannerMessage, BannerType, GameMode } from './types';
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
  const [pendingRoomMode, setPendingRoomMode] = useState<GameMode>('classic');
  const [banners, setBanners] = useState<BannerMessage[]>([]);

  // Helper functions for banners
  const addBanner = (type: BannerType, message: string, autoDismiss = true) => {
    const id = `banner-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const banner: BannerMessage = {
      id,
      type,
      message,
      timestamp: Date.now(),
      autoDismiss
    };
    
    setBanners(prev => [...prev, banner]);
    
    if (autoDismiss) {
      setTimeout(() => {
        removeBanner(id);
      }, 5000);
    }
    
    return id;
  };

  const removeBanner = (id: string) => {
    setBanners(prev => prev.filter(banner => banner.id !== id));
  };

  const clearBanners = () => {
    setBanners([]);
  };

  // Parse URL for room query parameter
  const parseRoomQueryParam = (): { roomCode: string | null; mode: GameMode } => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    const mode = urlParams.get('mode');
    return {
      roomCode: roomCode ? roomCode.toUpperCase() : null,
      mode: (mode === 'timed' ? 'timed' : 'classic') as GameMode
    };
  };

  // Clear room query parameter from URL
  const clearRoomQueryParam = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
  };

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
          setPendingRoomMode('classic');
          break;
      }
    };

    nakamaClient.addConnectionStateListener(handleConnectionStateChange);
    nakamaClient.addMatchEventListener(handleMatchEvent);

    // Check if we have a stored identity
    const identity = nakamaClient.getIdentity();
    if (identity) {
      setNickname(identity.nickname);

      // Check for room query intent first
      const { roomCode: roomCodeFromUrl, mode: modeFromUrl } = parseRoomQueryParam();
      const roomQueryIntent = nakamaClient.getRoomQueryIntent();
      
      // Determine which flow to follow
      const handleBootFlow = async () => {
        // Priority: Room query intent from URL (if not already consumed)
        if (roomCodeFromUrl && (!roomQueryIntent || !roomQueryIntent.consumed)) {
          console.log('DEBUG App: Room query intent from URL:', roomCodeFromUrl, 'mode:', modeFromUrl);
          nakamaClient.setRoomQueryIntent(roomCodeFromUrl);
          // Ensure connected first
          await nakamaClient.ensureConnected();
          // Try to join the room immediately
          const joinResult = await nakamaClient.joinRoomByCode({ roomCode: roomCodeFromUrl });
          if (joinResult.success && joinResult.data) {
            // Auto-join the match
            await handleJoinMatch(joinResult.data.matchId, joinResult.data.roomCode, joinResult.data.mode);
            return;
          } else {
            // Join failed, go to lobby with room code pre-filled
            setView('lobby');
            // Set pending mode from URL for placeholder
            setPendingRoomMode(modeFromUrl);
            return;
          }
        }
        
        // Check if we have an active match to resume
        const activeMatch = nakamaClient.getActiveMatchContext();
        if (activeMatch?.matchId) {
          // We have an active match, try to reconnect and resume
          setView('match');
          setPendingRoomCode(activeMatch.roomCode);
          const resumeResult = await nakamaClient.attemptResume();
          if (resumeResult.success) {
            addBanner('success', resumeResult.message);
          } else {
            addBanner('error', resumeResult.message);
            // Clear stale context on failure
            nakamaClient.clearStaleActiveMatch();
            setView('lobby');
          }
        } else {
          // No active match, go to lobby
          setView('lobby');
          // If user already has an identity, try to connect automatically.
          await nakamaClient.ensureConnected();
        }
      };

      void handleBootFlow();
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

  const handleJoinMatch = async (matchId: string, roomCode?: string, mode?: GameMode) => {
    setMatchError(null);
    setPendingRoomCode(roomCode || null);
    setPendingRoomMode(mode || 'classic');
    
    // Clear room query intent if this is a successful join
    if (roomCode) {
      const roomQueryIntent = nakamaClient.getRoomQueryIntent();
      if (roomQueryIntent && roomQueryIntent.roomCode === roomCode) {
        nakamaClient.consumeRoomQueryIntent();
        clearRoomQueryParam();
      }
    }
    
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
    setPendingRoomMode('classic');
    setView('lobby');
    clearBanners();
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

  const renderBanners = () => {
    if (banners.length === 0) return null;
    
    return (
      <div className="app-banners">
        {banners.map(banner => (
          <div 
            key={banner.id} 
            className={`app-banner app-banner--${banner.type}`}
            role="alert"
          >
            <span className="app-banner__message">{banner.message}</span>
            <button 
              type="button" 
              className="app-banner__dismiss"
              onClick={() => removeBanner(banner.id)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    );
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
            mode: pendingRoomMode,
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
            version: 1,
            turnDeadlineAt: null,
            remainingTurnMs: null,
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

          {renderBanners()}

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
