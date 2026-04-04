import { useState, useEffect } from 'react';
import { nakamaClient } from './nakamaClient';
import { ConnectionState, RoomSummary } from './types';

interface LobbyProps {
  onJoinMatch?: (matchId: string, roomCode?: string) => void;
}

function Lobby({ onJoinMatch }: LobbyProps) {
  const [roomCode, setRoomCode] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [isRefreshingRooms, setIsRefreshingRooms] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(nakamaClient.getConnectionState());

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

    const result = await nakamaClient.quickPlay({ gameMode: 'classic' });

    if (result.success && result.data) {
      showStatus(`Match found (${result.data.roomCode})! Joining...`);
      if (onJoinMatch) {
        onJoinMatch(result.data.matchId, result.data.roomCode);
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

    const result = await nakamaClient.createRoom({ isPrivate: true });

    if (result.success && result.data) {
      showStatus(`Room ${result.data.roomCode} created! Joining...`);
      if (onJoinMatch) {
        onJoinMatch(result.data.matchId, result.data.roomCode);
      }
    } else {
      showError(result.message || 'Failed to create room');
    }

    setIsLoading(false);
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
      if (onJoinMatch) {
        onJoinMatch(result.data.matchId, roomCode.trim());
      }
    } else {
      showError(result.message || 'Failed to join room');
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
        <h2 className="lobby__welcome">Welcome, {nickname}!</h2>
        <p className="lobby__tagline">Choose how you want to play</p>
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
          <button
            type="button"
            className="btn btn--secondary btn--block"
            onClick={handleCreateRoom}
            disabled={isLoading || !isConnected}
          >
            Create Private Room
          </button>
          <p className="helper-text">Create a private room and share the code with friends</p>
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
                  <div className="lobby-room-row__meta">{room.playerCount}/2 players</div>
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    if (onJoinMatch) {
                      onJoinMatch(room.matchId, room.roomCode);
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
    </div>
  );
}

export default Lobby;
