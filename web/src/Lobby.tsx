import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { nakamaClient } from './nakamaClient';
import { ConnectionState, RoomSummary, RoomQueryIntent, GameMode } from './types';

interface LobbyProps {
  onJoinMatch?: (matchId: string, roomCode?: string, mode?: GameMode) => void;
  onOpenLeaderboard?: () => void;
  pendingDeepLinkRoomCode?: string | null;
  pendingDeepLinkMode?: GameMode;
  deepLinkJoinError?: string | null;
  isAttemptingDeepLinkJoin?: boolean;
  onRetryDeepLinkJoin?: () => void;
  // Gamma 2: preserve mode when returning from match
  initialMode?: GameMode;
}

function Lobby({ 
  onJoinMatch, 
  onOpenLeaderboard,
  pendingDeepLinkRoomCode,
  pendingDeepLinkMode = 'classic',
  deepLinkJoinError,
  isAttemptingDeepLinkJoin = false,
  onRetryDeepLinkJoin,
  initialMode = 'classic'
}: LobbyProps) {
  const [roomCode, setRoomCode] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [isRefreshingRooms, setIsRefreshingRooms] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(nakamaClient.getConnectionState());
  const [createdRoomInfo, setCreatedRoomInfo] = useState<{ roomCode: string; matchId: string } | null>(null);
  const [roomQueryIntent, setRoomQueryIntent] = useState<RoomQueryIntent | null>(null);
  const [selectedMode, setSelectedMode] = useState<GameMode>(initialMode);
  const [qrSheetOpen, setQrSheetOpen] = useState(false);

  const nickname = nakamaClient.getNickname();
  const isConnected = connectionState === 'connected';

  const clearMessages = () => {
    setStatusMessage('');
    setErrorMessage('');
  };

  const showStatus = (message: string) => {
    clearMessages();
    setStatusMessage(message);
  };

  const showError = (message: string) => {
    clearMessages();
    setErrorMessage(message);
  };

  const handleQuickPlay = async () => {
    if (!isConnected) {
      showError('Not connected to multiplayer service');
      return;
    }

    setIsLoading(true);
    clearMessages();

    const result = await nakamaClient.quickPlay({ gameMode: selectedMode });

    if (result.success && result.data) {
      showStatus(`Match found (${result.data.roomCode})! Joining...`);
      if (onJoinMatch) {
        onJoinMatch(result.data.matchId, result.data.roomCode, result.data.mode);
      }
    } else {
      showError(result.message || 'Failed to find match');
    }

    setIsLoading(false);
  };

  const handleCreateRoom = async () => {
    if (!isConnected) {
      showError('Not connected to multiplayer service');
      return;
    }

    setIsLoading(true);
    clearMessages();

    const result = await nakamaClient.createRoom({ isPrivate: true, mode: selectedMode });

    if (result.success && result.data) {
      setCreatedRoomInfo({
        roomCode: result.data.roomCode,
        matchId: result.data.matchId
      });
      showStatus(`Room ${result.data.roomCode} created!`);
      // Don't auto-join, let user share the room first
    } else {
      showError(result.message || 'Failed to create room');
    }

    setIsLoading(false);
  };

  const handleJoinCreatedRoom = () => {
      if (createdRoomInfo && onJoinMatch) {
        onJoinMatch(createdRoomInfo.matchId, createdRoomInfo.roomCode, selectedMode);
      }
  };

  const getShareableUrl = (roomCode: string, mode: GameMode): string => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomCode);
    url.searchParams.set('mode', mode);
    return url.toString();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showStatus('Copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
      showError('Failed to copy to clipboard');
    }
  };

  const handleJoinRoom = async () => {
    if (!isConnected) {
      showError('Not connected to multiplayer service');
      return;
    }

    if (!roomCode.trim()) {
      showError('Please enter a room code');
      return;
    }

    setIsLoading(true);
    clearMessages();

    const result = await nakamaClient.joinRoomByCode({ roomCode: roomCode.trim() });

    if (result.success && result.data) {
      showStatus('Joined room!');
      setRoomCode('');
      // Clear room query intent if this was from a link
      if (roomQueryIntent && roomQueryIntent.roomCode === roomCode.trim()) {
        nakamaClient.consumeRoomQueryIntent();
        setRoomQueryIntent(null);
      }
      if (onJoinMatch) {
        onJoinMatch(result.data.matchId, roomCode.trim(), result.data.mode);
      }
    } else {
      showError(result.message || 'Failed to join room');
      // If this was a room query intent that failed, mark it as consumed to avoid loops
      if (roomQueryIntent && roomQueryIntent.roomCode === roomCode.trim()) {
        nakamaClient.consumeRoomQueryIntent();
        setRoomQueryIntent(null);
        showError(`${result.message}. The room link has been cleared.`);
      }
    }

    setIsLoading(false);
  };

  const handleRefreshRooms = async () => {
    if (!nakamaClient.isConnected()) {
      showError('Not connected to multiplayer service');
      return;
    }

    setIsRefreshingRooms(true);
    clearMessages();

    const result = await nakamaClient.listJoinableRooms();

    if (result.success) {
      setRooms(result.data || []);
      if (result.data?.length === 0) {
        showStatus(result.message);
      }
    } else {
      showError(result.message);
    }

    setIsRefreshingRooms(false);
  };

  // Load rooms on initial mount
  useEffect(() => {
    if (isConnected) {
      handleRefreshRooms();
    }
  }, []);

  // Check for room query intent on mount
  useEffect(() => {
    const intent = nakamaClient.getRoomQueryIntent();
    if (intent && !intent.consumed) {
      setRoomQueryIntent(intent);
      // Auto-fill the room code
      setRoomCode(intent.roomCode);
      showStatus(`Room ${intent.roomCode} detected from link. Click Join to enter.`);
    }
  }, []);

  // React to connection state changes and refresh rooms when we connect.
  useEffect(() => {
    const listener = (state: ConnectionState) => {
      setConnectionState(state);
      if (state === 'connected') {
        void handleRefreshRooms();
      }
    };
    nakamaClient.addConnectionStateListener(listener);
    return () => {
      nakamaClient.removeConnectionStateListener(listener);
    };
  }, []);

  return (
    <div className="lobby">
      <div className="lobby__header">
        <div className="lobby__header-row">
          <div>
            <h2 className="lobby__welcome">Welcome, {nickname}!</h2>
            <p className="lobby__tagline">Choose how you want to play</p>
          </div>
          {onOpenLeaderboard && (
            <button
              type="button"
              className="btn btn--tertiary lobby__leaderboard-btn"
              onClick={onOpenLeaderboard}
            >
              Leaderboard
            </button>
          )}
        </div>
      </div>

      {/* Deep link join status */}
      {pendingDeepLinkRoomCode && (
        <div className="lobby-deep-link-status">
          <div className="lobby-banner lobby-banner--info">
            <div className="lobby-deep-link-status__content">
              <span>
                Joining room <strong>{pendingDeepLinkRoomCode}</strong> ({pendingDeepLinkMode} mode)
              </span>
              {deepLinkJoinError && (
                <div className="lobby-deep-link-status__error">
                  <span>{deepLinkJoinError}</span>
                  {onRetryDeepLinkJoin && (
                    <button
                      type="button"
                      className="btn btn--tertiary btn--small"
                      onClick={onRetryDeepLinkJoin}
                      disabled={isAttemptingDeepLinkJoin || !isConnected}
                    >
                      {isAttemptingDeepLinkJoin ? 'Retrying...' : 'Retry'}
                    </button>
                  )}
                </div>
              )}
              {isAttemptingDeepLinkJoin && !deepLinkJoinError && (
                <div className="lobby-deep-link-status__loading">Joining...</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="lobby-mode-selector">
        <div className="lobby-mode-selector__label">Game Mode:</div>
        <div className="lobby-mode-selector__options">
          <button
            type="button"
            className={`lobby-mode-option ${selectedMode === 'classic' ? 'lobby-mode-option--active' : ''}`}
            onClick={() => setSelectedMode('classic')}
          >
            <span className="lobby-mode-option__name">Classic</span>
            <span className="lobby-mode-option__desc">No time limit</span>
          </button>
          <button
            type="button"
            className={`lobby-mode-option ${selectedMode === 'timed' ? 'lobby-mode-option--active' : ''}`}
            onClick={() => setSelectedMode('timed')}
          >
            <span className="lobby-mode-option__name">Timed</span>
            <span className="lobby-mode-option__desc">30 seconds per turn</span>
          </button>
        </div>
      </div>

      <div className="lobby__actions">
        <div className="lobby-action-card lobby-action-card--hero">
          <h3 className="lobby-action-card__title">Quick Play</h3>
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={handleQuickPlay}
            disabled={isLoading || !isConnected}
          >
            Find Match
          </button>
          <p className="helper-text">Join a random match with another player</p>
        </div>

        <div className="lobby-action-card lobby-action-card--secondary">
          <h3 className="lobby-action-card__title">Create Room</h3>
          {!createdRoomInfo ? (
            <>
              <button
                type="button"
                className="btn btn--secondary btn--block"
                onClick={handleCreateRoom}
                disabled={isLoading || !isConnected}
              >
                Create Private Room
              </button>
              <p className="helper-text">Create a private room and share the code with friends</p>
            </>
          ) : (
            <div className="lobby-room-created">
              <div className="lobby-room-created__code">
                <span className="lobby-room-created__label">Room Code:</span>
                <span className="lobby-room-created__value">{createdRoomInfo.roomCode}</span>
              </div>
              <div className="lobby-room-created__share">
                <span className="lobby-room-created__label">Share Link:</span>
                <div className="lobby-room-created__url">
                  <input
                    type="text"
                    readOnly
                    value={getShareableUrl(createdRoomInfo.roomCode, selectedMode)}
                    className="input input--code"
                  />
                  <button
                    type="button"
                    className="btn btn--tertiary"
                    onClick={() => copyToClipboard(getShareableUrl(createdRoomInfo.roomCode, selectedMode))}
                  >
                    Copy
                  </button>
                </div>
                <div className="lobby-room-created__qr-row">
                  <button
                    type="button"
                    className="btn btn--secondary btn--block"
                    onClick={() => setQrSheetOpen(true)}
                  >
                    Show QR
                  </button>
                </div>
              </div>
              <div className="lobby-room-created__actions">
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  onClick={handleJoinCreatedRoom}
                  disabled={!isConnected}
                >
                  Join Room
                </button>
                <button
                  type="button"
                  className="btn btn--muted btn--block"
                  onClick={() => setCreatedRoomInfo(null)}
                >
                  Create Another
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="lobby-action-card">
          <h3 className="lobby-action-card__title">Join by Code</h3>
          <div className="input-row">
            <input
              type="text"
              className="input input--code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              maxLength={6}
              inputMode="text"
              autoCapitalize="characters"
              aria-label="Room code"
            />
            <button
              type="button"
              className="btn btn--accent"
              onClick={handleJoinRoom}
              disabled={isLoading || !isConnected}
            >
              Join
            </button>
          </div>
          <p className="helper-text">Enter a room code to join a private room</p>
        </div>
      </div>

      <div className="lobby-discovery">
        <div className="lobby-discovery__head">
          <h3 className="lobby-discovery__title">Available Rooms</h3>
          <button
            type="button"
            className="btn btn--tertiary"
            onClick={handleRefreshRooms}
            disabled={isRefreshingRooms || !isConnected}
          >
            {isRefreshingRooms ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {isRefreshingRooms ? (
          <div className="lobby-loading">Loading rooms...</div>
        ) : rooms.length > 0 ? (
          <div className="lobby-room-list">
            {rooms.map((room) => (
              <div key={room.matchId} className="lobby-room-row">
                <div>
                  <div className="lobby-room-row__code">{room.roomCode}</div>
                  <div className="lobby-room-row__meta">
                    <span className="lobby-room-row__mode">{room.mode === 'timed' ? '⏱️ Timed' : '♟️ Classic'}</span>
                    <span className="lobby-room-row__players">{room.playerCount}/2 players</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    if (onJoinMatch) {
                      onJoinMatch(room.matchId, room.roomCode, room.mode);
                    }
                  }}
                  disabled={!isConnected}
                >
                  Join
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="lobby-empty">
            <p>No joinable rooms available yet.</p>
            <p>Create a room or try quick play to start a match.</p>
          </div>
        )}
      </div>

      {statusMessage && (
        <div className="lobby-banner lobby-banner--info">{statusMessage}</div>
      )}

      {errorMessage && (
        <div className="lobby-banner lobby-banner--error">{errorMessage}</div>
      )}

      {!isConnected && (
        <div className="lobby-banner lobby-banner--error">
          You are not connected to the multiplayer service. Some features may be unavailable.
        </div>
      )}

      {qrSheetOpen && createdRoomInfo && (
        <div
          className="lobby-qr-sheet-backdrop"
          role="presentation"
          onClick={() => setQrSheetOpen(false)}
        >
          <div
            className="lobby-qr-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Room invite QR code"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lobby-qr-sheet__head">
              <span className="lobby-qr-sheet__title">Scan to join</span>
              <button
                type="button"
                className="lobby-qr-sheet__close"
                onClick={() => setQrSheetOpen(false)}
                aria-label="Close QR"
              >
                ×
              </button>
            </div>
            <p className="lobby-qr-sheet__room">Room {createdRoomInfo.roomCode}</p>
            <div className="lobby-qr-sheet__qr">
              <QRCode
                value={getShareableUrl(createdRoomInfo.roomCode, selectedMode)}
                size={200}
                style={{ width: '100%', height: 'auto', maxWidth: 200 }}
              />
            </div>
            <p className="lobby-qr-sheet__hint">
              Opens the same link as above ({selectedMode} mode).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default Lobby;
