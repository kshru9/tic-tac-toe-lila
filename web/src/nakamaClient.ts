import { Client, Session, Socket } from '@heroiclabs/nakama-js';
import { 
  ConnectionState, 
  PlayerIdentity, 
  ShellActionResult, 
  ClientSession,
  QuickPlayOptions,
  CreateRoomOptions,
  JoinRoomOptions,
  CreateRoomRpcResult,
  JoinRoomRpcResult,
  QuickPlayRpcResult,
  ListRoomsRpcResult,
  RoomSummary,
  PublicMatchState,
  MatchEvent,
  MatchEventType,
  ActiveMatchContext,
  MoveIntentPayload,
  ActionRejectPayload
} from './types';

// Configuration from environment
const config = {
  host: (import.meta as any).env.VITE_NAKAMA_HOST || '[private-ip-redacted]',
  port: parseInt((import.meta as any).env.VITE_NAKAMA_PORT || '7350'),
  serverKey: (import.meta as any).env.VITE_NAKAMA_SERVER_KEY || 'defaultkey',
  useSSL: (import.meta as any).env.VITE_NAKAMA_USE_SSL === 'true',
  websocketPort: parseInt((import.meta as any).env.VITE_NAKAMA_WEBSOCKET_PORT || '7350'),
};

// Storage keys
const STORAGE_KEYS = {
  CLIENT_SESSION: 'lila_tictactoe_client_session',
  DEVICE_ID: 'lila_tictactoe_device_id',
};

// Generate or retrieve device ID
function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
  }
  return deviceId;
}

// Load client session from storage
function loadClientSession(): ClientSession | null {
  const stored = localStorage.getItem(STORAGE_KEYS.CLIENT_SESSION);
  if (!stored) return null;
  
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

// Save client session to storage
function saveClientSession(session: ClientSession): void {
  localStorage.setItem(STORAGE_KEYS.CLIENT_SESSION, JSON.stringify(session));
}


class NakamaClient {
  private client: Client;
  private session: Session | null = null;
  private socket: Socket | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private connectionStateListeners: ((state: ConnectionState) => void)[] = [];
  private identity: PlayerIdentity | null = null;
  private matchEventListeners: ((event: MatchEvent) => void)[] = [];
  private activeMatchContext: ActiveMatchContext | null = null;

  constructor() {
    const scheme = config.useSSL ? 'https' : 'http';
    const wsScheme = config.useSSL ? 'wss' : 'ws';
    
    this.client = new Client(
      config.serverKey,
      `${scheme}://${config.host}:${config.port}`,
      `${wsScheme}://${config.host}:${config.websocketPort}`
    );
    
    // Try to restore session from storage
    const storedSession = loadClientSession();
    if (storedSession?.identity) {
      this.identity = storedSession.identity;
    }
  }

  // Connection state management
  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.connectionStateListeners.forEach(listener => listener(state));
    }
  }

  addConnectionStateListener(listener: (state: ConnectionState) => void): void {
    this.connectionStateListeners.push(listener);
  }

  removeConnectionStateListener(listener: (state: ConnectionState) => void): void {
    const index = this.connectionStateListeners.indexOf(listener);
    if (index > -1) {
      this.connectionStateListeners.splice(index, 1);
    }
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  getIdentity(): PlayerIdentity | null {
    return this.identity;
  }

  // Match event management
  addMatchEventListener(listener: (event: MatchEvent) => void): void {
    this.matchEventListeners.push(listener);
  }

  removeMatchEventListener(listener: (event: MatchEvent) => void): void {
    const index = this.matchEventListeners.indexOf(listener);
    if (index > -1) {
      this.matchEventListeners.splice(index, 1);
    }
  }

  private emitMatchEvent(type: MatchEventType, data: any): void {
    const event: MatchEvent = { type, data };
    this.matchEventListeners.forEach(listener => listener(event));
  }

  getActiveMatchContext(): ActiveMatchContext | null {
    return this.activeMatchContext;
  }

  // Bootstrap and authentication
  async bootstrapWithNickname(nickname: string): Promise<ShellActionResult<PlayerIdentity>> {
    if (!nickname.trim()) {
      return {
        success: false,
        message: 'Please enter a nickname',
      };
    }

    const deviceId = getOrCreateDeviceId();
    this.identity = {
      nickname: nickname.trim(),
      deviceId,
      joinedAt: Date.now(),
    };

    // Save identity to storage
    saveClientSession({
      identity: this.identity,
    });

    // Connect to Nakama
    return this.connect();
  }

  private async connect(): Promise<ShellActionResult<PlayerIdentity>> {
    if (!this.identity) {
      return {
        success: false,
        message: 'No identity set',
      };
    }

    this.setConnectionState('connecting');

    try {
      // Authenticate with device ID
      this.session = await this.client.authenticateDevice(this.identity.deviceId, true, this.identity.nickname);
      
      // Create socket connection
      this.socket = this.client.createSocket(false, false);
      
      // Set up socket handlers
      this.socket.onmatchdata = (matchData) => {
        this.handleMatchData(matchData);
      };
      
      this.socket.onmatchpresence = (matchPresence) => {
        this.handleMatchPresence(matchPresence);
      };
      
      await this.socket.connect(this.session, false);
      
      this.setConnectionState('connected');
      
      // Update session storage
      const storedSession = loadClientSession();
      if (storedSession) {
        storedSession.sessionToken = this.session.token;
        storedSession.refreshToken = this.session.refresh_token;
        storedSession.lastConnectedAt = Date.now();
        saveClientSession(storedSession);
      }

      return {
        success: true,
        message: 'Multiplayer foundation connected.',
        data: this.identity,
      };
    } catch (error) {
      this.setConnectionState('disconnected');
      console.error('Connection error:', error);
      
      return {
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private handleMatchData(matchData: any): void {
    // matchData should have match_id, op_code, data properties from Nakama JS SDK
    const matchId = matchData.match_id;
    const opCode = matchData.op_code;
    const data = matchData.data;
    
    // Only process if this is our active match
    if (this.activeMatchContext?.matchId !== matchId) {
      return;
    }

    try {
      const parsedData = JSON.parse(data);
      
      switch (opCode) {
        case 2: // OP_CODE_STATE_SYNC
          const matchState = parsedData as PublicMatchState;
          this.updateMatchContextFromState(matchState);
          this.emitMatchEvent('state_sync', matchState);
          break;
          
        case 3: // OP_CODE_ACTION_REJECTED
          this.emitMatchEvent('action_rejected', parsedData as ActionRejectPayload);
          break;
          
        default:
          console.warn(`Unknown opCode received: ${opCode}`);
      }
    } catch (error) {
      console.error('Error parsing match data:', error);
    }
  }

  private handleMatchPresence(_matchPresence: any): void {
    // Handle presence events (joins/leaves) if needed
    // For now, we rely on state_sync for player connection status
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect(false);
      this.socket = null;
    }
    this.session = null;
    this.setConnectionState('disconnected');
  }

  // Real RPC methods
  async quickPlay(_options: QuickPlayOptions): Promise<ShellActionResult<{ matchId: string; roomCode: string }>> {
    if (this.connectionState !== 'connected') {
      return {
        success: false,
        message: 'Not connected to multiplayer service',
      };
    }

    if (!this.session) {
      return {
        success: false,
        message: 'Not authenticated',
      };
    }

    try {
      const payload = {
        nickname: this.identity?.nickname || 'Player'
      };
      
      const result = await this.client.rpc(this.session, 'quick_play', payload as any);
      const rpcResult: QuickPlayRpcResult = JSON.parse(result.payload as unknown as string);
      
      if (rpcResult.success) {
        return {
          success: true,
          message: 'Match found!',
          data: {
            matchId: rpcResult.matchId,
            roomCode: rpcResult.roomCode
          }
        };
      } else {
        return {
          success: false,
          message: rpcResult.message || 'Failed to find match',
        };
      }
    } catch (error) {
      console.error('Quick play error:', error);
      return {
        success: false,
        message: `Quick play failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async createRoom(options: CreateRoomOptions): Promise<ShellActionResult<{ matchId: string; roomCode: string }>> {
    if (this.connectionState !== 'connected') {
      return {
        success: false,
        message: 'Not connected to multiplayer service',
      };
    }

    if (!this.session) {
      return {
        success: false,
        message: 'Not authenticated',
      };
    }

    try {
      const payload = {
        nickname: this.identity?.nickname || 'Player',
        isPrivate: options.isPrivate || false
      };
      
      const result = await this.client.rpc(this.session, 'create_room', payload as any);
      const rpcResult: CreateRoomRpcResult = JSON.parse(result.payload as unknown as string);
      
      if (rpcResult.success) {
        return {
          success: true,
          message: 'Room created!',
          data: {
            matchId: rpcResult.matchId,
            roomCode: rpcResult.roomCode
          }
        };
      } else {
        return {
          success: false,
          message: rpcResult.message || 'Failed to create room',
        };
      }
    } catch (error) {
      console.error('Create room error:', error);
      return {
        success: false,
        message: `Create room failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async joinRoomByCode(options: JoinRoomOptions): Promise<ShellActionResult<{ matchId: string; roomCode: string }>> {
    if (this.connectionState !== 'connected') {
      return {
        success: false,
        message: 'Not connected to multiplayer service',
      };
    }

    if (!this.session) {
      return {
        success: false,
        message: 'Not authenticated',
      };
    }

    if (!options.roomCode.trim()) {
      return {
        success: false,
        message: 'Please enter a room code',
      };
    }

    try {
      const payload = {
        roomCode: options.roomCode.trim()
      };
      
      const result = await this.client.rpc(this.session, 'join_room', payload as any);
      const rpcResult: JoinRoomRpcResult = JSON.parse(result.payload as unknown as string);
      
      if (rpcResult.success) {
        return {
          success: true,
          message: 'Joined room!',
          data: {
            matchId: rpcResult.matchId,
            roomCode: rpcResult.roomCode
          }
        };
      } else {
        return {
          success: false,
          message: rpcResult.message || 'Failed to join room',
        };
      }
    } catch (error) {
      console.error('Join room error:', error);
      return {
        success: false,
        message: `Join room failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async listJoinableRooms(): Promise<ShellActionResult<RoomSummary[]>> {
    if (this.connectionState !== 'connected') {
      return {
        success: false,
        message: 'Not connected to multiplayer service',
      };
    }

    if (!this.session) {
      return {
        success: false,
        message: 'Not authenticated',
      };
    }

    try {
      const result = await this.client.rpc(this.session, 'list_rooms', {} as any);
      const rpcResult: ListRoomsRpcResult = JSON.parse(result.payload as unknown as string);
      
      if (rpcResult.success) {
        return {
          success: true,
          message: rpcResult.rooms.length > 0 ? 'Rooms loaded' : 'No joinable rooms available',
          data: rpcResult.rooms
        };
      } else {
        return {
          success: false,
          message: rpcResult.message || 'Failed to list rooms',
          data: []
        };
      }
    } catch (error) {
      console.error('List rooms error:', error);
      return {
        success: false,
        message: `Failed to list rooms: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: []
      };
    }
  }

  // Match join and gameplay methods
  async joinMatch(matchId: string): Promise<ShellActionResult> {
    if (this.connectionState !== 'connected') {
      return {
        success: false,
        message: 'Not connected to multiplayer service',
      };
    }

    if (!this.socket) {
      return {
        success: false,
        message: 'Socket not available',
      };
    }

    try {
      // Join the match with metadata (nickname for backend)
      const metadata = JSON.stringify({
        nickname: this.identity?.nickname || 'Player'
      });
      const match = await this.socket.joinMatch(matchId, metadata);
      
      // Determine player symbol from match presence
      // playerSymbol will be set from state_sync
      if (match.presences) {
        // We'll determine symbol from state_sync after joining
        // For now, set context with null symbol
        this.activeMatchContext = {
          matchId: match.match_id,
          roomCode: '', // Will be updated from state_sync
          playerSymbol: null
        };
        
        this.emitMatchEvent('match_joined', { matchId: match.match_id });
      }
      
      return {
        success: true,
        message: 'Joined match',
      };
    } catch (error) {
      console.error('Join match error:', error);
      return {
        success: false,
        message: `Failed to join match: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async sendMoveIntent(index: number): Promise<ShellActionResult> {
    if (this.connectionState !== 'connected') {
      return {
        success: false,
        message: 'Not connected to multiplayer service',
      };
    }

    if (!this.socket) {
      return {
        success: false,
        message: 'Socket not available',
      };
    }

    if (!this.activeMatchContext?.matchId) {
      return {
        success: false,
        message: 'Not in a match',
      };
    }

    try {
      const payload: MoveIntentPayload = { index };
      await this.socket.sendMatchState(
        this.activeMatchContext.matchId,
        1, // OP_CODE_MOVE_INTENT
        JSON.stringify(payload)
      );
      
      return {
        success: true,
        message: 'Move sent',
      };
    } catch (error) {
      console.error('Send move error:', error);
      return {
        success: false,
        message: `Failed to send move: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  leaveMatch(): void {
    if (this.activeMatchContext?.matchId && this.socket) {
      try {
        this.socket.leaveMatch(this.activeMatchContext.matchId);
      } catch (error) {
        console.error('Leave match error:', error);
      }
    }
    
    this.activeMatchContext = null;
    this.emitMatchEvent('match_left', {});
  }

  // Update match context from state sync
  updateMatchContextFromState(state: PublicMatchState): void {
    if (!this.activeMatchContext || this.activeMatchContext.matchId !== state.matchId) {
      return;
    }

    // Update room code
    this.activeMatchContext.roomCode = state.roomCode;
    
    // Determine player symbol
    const userId = this.session?.user_id;
    if (userId) {
      if (state.playerX?.userId === userId) {
        this.activeMatchContext.playerSymbol = 'X';
      } else if (state.playerO?.userId === userId) {
        this.activeMatchContext.playerSymbol = 'O';
      } else {
        this.activeMatchContext.playerSymbol = null;
      }
    }
  }

  // Utility methods
  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  getNickname(): string {
    return this.identity?.nickname || '';
  }

  getUserId(): string | null {
    return this.session?.user_id || null;
  }
}

// Create and export singleton instance
export const nakamaClient = new NakamaClient();