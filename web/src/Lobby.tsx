import { useState, useEffect } from 'react';
import { nakamaClient } from './nakamaClient';
import { RoomSummary } from './types';

interface LobbyProps {
  onJoinMatch?: (matchId: string) => void;
}

// Simple inline styles for Gamma 1
const styles = {
  lobby: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '30px',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '10px',
  },
  welcome: {
    fontSize: '1.5rem',
    fontWeight: '600' as const,
    color: '#333',
    margin: '0 0 5px 0',
  },
  subtitle: {
    fontSize: '1rem',
    color: '#666',
    margin: '0',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  actionGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  actionTitle: {
    fontSize: '1.1rem',
    fontWeight: '600' as const,
    color: '#333',
    margin: '0 0 8px 0',
  },
  primaryButton: {
    padding: '16px 24px',
    fontSize: '1.1rem',
    fontWeight: '600' as const,
    backgroundColor: '#4caf50',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    textAlign: 'center' as const,
  },
  primaryButtonHover: {
    backgroundColor: '#388e3c',
  },
  secondaryButton: {
    padding: '14px 20px',
    fontSize: '1rem',
    fontWeight: '500' as const,
    backgroundColor: '#2196f3',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    textAlign: 'center' as const,
  },
  secondaryButtonHover: {
    backgroundColor: '#1976d2',
  },
  joinSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  joinForm: {
    display: 'flex',
    gap: '10px',
  },
  input: {
    flex: '1',
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
  smallButton: {
    padding: '12px 20px',
    fontSize: '1rem',
    fontWeight: '500' as const,
    backgroundColor: '#ff9800',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  smallButtonHover: {
    backgroundColor: '#f57c00',
  },
  discovery: {
    backgroundColor: '#f9f9f9',
    borderRadius: '8px',
    padding: '20px',
    border: '1px solid #eee',
  },
  discoveryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px',
  },
  discoveryTitle: {
    fontSize: '1.1rem',
    fontWeight: '600' as const,
    color: '#333',
    margin: '0',
  },
  refreshButton: {
    padding: '8px 16px',
    fontSize: '0.9rem',
    backgroundColor: 'transparent',
    color: '#2196f3',
    border: '1px solid #2196f3',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  refreshButtonHover: {
    backgroundColor: '#2196f3',
    color: 'white',
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '30px',
    color: '#666',
  },
  statusMessage: {
    padding: '12px 16px',
    borderRadius: '8px',
    backgroundColor: '#f5f5f5',
    color: '#666',
    fontSize: '0.9rem',
    marginTop: '10px',
    borderLeft: '4px solid #2196f3',
  },
  errorMessage: {
    padding: '12px 16px',
    borderRadius: '8px',
    backgroundColor: '#ffebee',
    color: '#c62828',
    fontSize: '0.9rem',
    marginTop: '10px',
    borderLeft: '4px solid #c62828',
  },
  loading: {
    textAlign: 'center' as const,
    padding: '20px',
    color: '#666',
  },
};

function Lobby({ onJoinMatch }: LobbyProps) {
  const [roomCode, setRoomCode] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [isRefreshingRooms, setIsRefreshingRooms] = useState(false);

  const nickname = nakamaClient.getNickname();

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
    if (!nakamaClient.isConnected()) {
      showError('Not connected to multiplayer service');
      return;
    }

    setIsLoading(true);
    clearMessages();

    const result = await nakamaClient.quickPlay({ gameMode: 'classic' });
    
    if (result.success && result.data) {
      showStatus('Match found! Joining...');
      if (onJoinMatch) {
        onJoinMatch(result.data.matchId);
      }
    } else {
      showError(result.message || 'Failed to find match');
    }
    
    setIsLoading(false);
  };

  const handleCreateRoom = async () => {
    if (!nakamaClient.isConnected()) {
      showError('Not connected to multiplayer service');
      return;
    }

    setIsLoading(true);
    clearMessages();

    const result = await nakamaClient.createRoom({});
    
    if (result.success && result.data) {
      showStatus('Room created! Joining...');
      if (onJoinMatch) {
        onJoinMatch(result.data.matchId);
      }
    } else {
      showError(result.message || 'Failed to create room');
    }
    
    setIsLoading(false);
  };

  const handleJoinRoom = async () => {
    if (!nakamaClient.isConnected()) {
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
        onJoinMatch(result.data.matchId);
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
    handleRefreshRooms();
  }, []);

  return (
    <div style={styles.lobby}>
      <div style={styles.header}>
        <h2 style={styles.welcome}>Welcome, {nickname}!</h2>
        <p style={styles.subtitle}>Choose how you want to play</p>
      </div>

      <div style={styles.actions}>
        {/* Quick Play - Primary Action */}
        <div style={styles.actionGroup}>
          <h3 style={styles.actionTitle}>Quick Play</h3>
          <button
            onClick={handleQuickPlay}
            style={styles.primaryButton}
            disabled={isLoading || !nakamaClient.isConnected()}
          >
            Find Match
          </button>
          <p style={{ fontSize: '0.9rem', color: '#666', margin: '0' }}>
            Join a random match with another player
          </p>
        </div>

        {/* Create Room */}
        <div style={styles.actionGroup}>
          <h3 style={styles.actionTitle}>Create Room</h3>
          <button
            onClick={handleCreateRoom}
            style={styles.secondaryButton}
            disabled={isLoading || !nakamaClient.isConnected()}
          >
            Create Private Room
          </button>
          <p style={{ fontSize: '0.9rem', color: '#666', margin: '0' }}>
            Create a private room and share the code with friends
          </p>
        </div>

        {/* Join by Code */}
        <div style={styles.actionGroup}>
          <h3 style={styles.actionTitle}>Join by Code</h3>
          <div style={styles.joinSection}>
            <div style={styles.joinForm}>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Enter room code"
                style={styles.input}
                maxLength={6}
              />
              <button
                onClick={handleJoinRoom}
                style={styles.smallButton}
                disabled={isLoading || !nakamaClient.isConnected()}
              >
                Join
              </button>
            </div>
            <p style={{ fontSize: '0.9rem', color: '#666', margin: '0' }}>
              Enter a room code to join a private room
            </p>
          </div>
        </div>
      </div>

      {/* Available Rooms */}
      <div style={styles.discovery}>
        <div style={styles.discoveryHeader}>
          <h3 style={styles.discoveryTitle}>Available Rooms</h3>
          <button
            onClick={handleRefreshRooms}
            style={styles.refreshButton}
            disabled={isRefreshingRooms || !nakamaClient.isConnected()}
          >
            {isRefreshingRooms ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {isRefreshingRooms ? (
          <div style={styles.loading}>Loading rooms...</div>
        ) : rooms.length > 0 ? (
          <div>
            {rooms.map((room) => (
              <div
                key={room.matchId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  backgroundColor: '#fff',
                  border: '1px solid #dee2e6',
                  borderRadius: '6px',
                  marginBottom: '8px',
                }}
              >
                <div>
                  <div style={{ fontWeight: '600', color: '#333' }}>
                    Room: {room.roomCode}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#666' }}>
                    {room.playerCount}/2 players
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (onJoinMatch) {
                      onJoinMatch(room.matchId);
                    }
                  }}
                  style={{
                    padding: '8px 16px',
                    fontSize: '0.9rem',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#218838';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#28a745';
                  }}
                  disabled={!nakamaClient.isConnected()}
                >
                  Join
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.emptyState}>
            <p>No joinable rooms available yet.</p>
            <p style={{ fontSize: '0.9rem', marginTop: '8px' }}>
              Create a room or try quick play to start a match.
            </p>
          </div>
        )}
      </div>

      {/* Status Messages */}
      {statusMessage && (
        <div style={styles.statusMessage}>
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div style={styles.errorMessage}>
          {errorMessage}
        </div>
      )}

      {/* Connection Status Note */}
      {!nakamaClient.isConnected() && (
        <div style={styles.errorMessage}>
          You are not connected to the multiplayer service. Some features may be unavailable.
        </div>
      )}
    </div>
  );
}

export default Lobby;