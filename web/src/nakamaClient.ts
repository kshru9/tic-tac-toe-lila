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
  ActionRejectPayload,
  PendingMove,
  RoomQueryIntent,
  ResumeAttemptResult
} from './types';

// Configuration from environment
const config = {
  host: (import.meta as any).env.VITE_NAKAMA_HOST,
  port: parseInt((import.meta as any).env.VITE_NAKAMA_PORT || '7350'),
  serverKey: (import.meta as any).env.VITE_NAKAMA_SERVER_KEY || 'defaultkey',
  useSSL: (import.meta as any).env.VITE_NAKAMA_USE_SSL === 'true',
  websocketPort: parseInt((import.meta as any).env.VITE_NAKAMA_WEBSOCKET_PORT || '7350'),
};

// Storage keys
const STORAGE_KEYS = {
  CLIENT_SESSION: 'lila_tictactoe_client_session',
  DEVICE_ID: 'lila_tictactoe_device_id',
  ACTIVE_MATCH: 'lila_tictactoe_active_match',
  ROOM_QUERY_INTENT: 'lila_tictactoe_room_query_intent',
  PENDING_MOVE: 'lila_tictactoe_pending_move',
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

// Convert string to Uint8Array with fallback for older browsers
function stringToUint8Array(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    const encoder = new TextEncoder();
    return encoder.encode(str);
  } else {
    // Fallback for older browsers
    const arr = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      arr[i] = str.charCodeAt(i);
    }
    return arr;
  }
}

// Decode Uint8Array to string with fallback
function decodeUint8ArrayToString(uint8Array: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(uint8Array);
  } else {
    // Fallback for older browsers
    let result = '';
    for (let i = 0; i < uint8Array.length; i++) {
      result += String.fromCharCode(uint8Array[i]);
    }
    return result;
  }
}

// Decode ArrayBuffer to string with fallback
function decodeArrayBufferToString(arrayBuffer: ArrayBuffer): string {
  return decodeUint8ArrayToString(new Uint8Array(arrayBuffer));
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

// Load active match from storage
function loadActiveMatch(): ActiveMatchContext | null {
  const stored = localStorage.getItem(STORAGE_KEYS.ACTIVE_MATCH);
  if (!stored) return null;
  
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

// Save active match to storage
function saveActiveMatch(match: ActiveMatchContext | null): void {
  if (match) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_MATCH, JSON.stringify(match));
  } else {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_MATCH);
  }
}

// Load room query intent from storage
function loadRoomQueryIntent(): RoomQueryIntent | null {
  const stored = localStorage.getItem(STORAGE_KEYS.ROOM_QUERY_INTENT);
  if (!stored) return null;
  
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

// Save room query intent to storage
function saveRoomQueryIntent(intent: RoomQueryIntent | null): void {
  if (intent) {
    localStorage.setItem(STORAGE_KEYS.ROOM_QUERY_INTENT, JSON.stringify(intent));
  } else {
    localStorage.removeItem(STORAGE_KEYS.ROOM_QUERY_INTENT);
  }
}

// Load pending move from storage
function loadPendingMove(): PendingMove | null {
  const stored = localStorage.getItem(STORAGE_KEYS.PENDING_MOVE);
  if (!stored) return null;
  
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

// Save pending move to storage
function savePendingMove(pendingMove: PendingMove | null): void {
  if (pendingMove) {
    localStorage.setItem(STORAGE_KEYS.PENDING_MOVE, JSON.stringify(pendingMove));
  } else {
    localStorage.removeItem(STORAGE_KEYS.PENDING_MOVE);
  }
}

// Clear pending move (convenience function)
function clearPendingMove(): void {
  localStorage.removeItem(STORAGE_KEYS.PENDING_MOVE);
}


class NakamaClient {
  private client: Client;
  private session: Session | null = null;
  private socket: Socket | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private connectionStateListeners: ((state: ConnectionState) => void)[] = [];
  private identity: PlayerIdentity | null = null;
  private lastConnectionError: string | null = null;
  private matchEventListeners: ((event: MatchEvent) => void)[] = [];
  private activeMatchContext: ActiveMatchContext | null = null;
  private pendingMove: PendingMove | null = null;
  private roomQueryIntent: RoomQueryIntent | null = null;

  constructor() {
    this.client = new Client(
      config.serverKey,
      config.host,
      config.port.toString(),
      config.useSSL
    );
    
    // Try to restore session from storage
    const storedSession = loadClientSession();
    if (storedSession?.identity) {
      this.identity = storedSession.identity;
    }
    
    // Try to restore active match from storage
    const storedMatch = loadActiveMatch();
    if (storedMatch) {
      this.activeMatchContext = storedMatch;
    }
    
    // Try to restore pending move from storage
    const storedPendingMove = loadPendingMove();
    if (storedPendingMove) {
      this.pendingMove = storedPendingMove;
    }
    
    // Try to restore room query intent from storage
    const storedRoomQueryIntent = loadRoomQueryIntent();
    if (storedRoomQueryIntent) {
      this.roomQueryIntent = storedRoomQueryIntent;
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

  getLastConnectionError(): string | null {
    return this.lastConnectionError;
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
    console.log('DEBUG emitMatchEvent: Emitting', { type, data, listenerCount: this.matchEventListeners.length });
    const event: MatchEvent = { type, data };
    this.matchEventListeners.forEach(listener => listener(event));
  }

  getActiveMatchContext(): ActiveMatchContext | null {
    return this.activeMatchContext;
  }

  getPendingMove(): PendingMove | null {
    return this.pendingMove;
  }

  setPendingMove(index: number): void {
    this.pendingMove = {
      index,
      timestamp: Date.now()
    };
    savePendingMove(this.pendingMove);
  }

  clearPendingMove(): void {
    this.pendingMove = null;
    clearPendingMove();
  }

  getRoomQueryIntent(): RoomQueryIntent | null {
    return this.roomQueryIntent;
  }

  setRoomQueryIntent(roomCode: string): void {
    this.roomQueryIntent = {
      roomCode,
      consumed: false
    };
    saveRoomQueryIntent(this.roomQueryIntent);
  }

  consumeRoomQueryIntent(): void {
    if (this.roomQueryIntent) {
      this.roomQueryIntent.consumed = true;
      this.roomQueryIntent.attemptedAt = Date.now();
      saveRoomQueryIntent(this.roomQueryIntent);
    }
  }

  clearRoomQueryIntent(): void {
    this.roomQueryIntent = null;
    saveRoomQueryIntent(null);
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
    return this.connectInternal();
  }

  async ensureConnected(): Promise<ShellActionResult<PlayerIdentity>> {
    if (this.connectionState === 'connected') {
      return { success: true, message: 'Already connected.', data: this.identity || undefined };
    }
    if (this.connectionState === 'connecting' || this.connectionState === 'reconnecting') {
      return { success: true, message: 'Connection in progress.', data: this.identity || undefined };
    }
    return this.connectInternal();
  }

  private async connectInternal(): Promise<ShellActionResult<PlayerIdentity>> {
    if (!this.identity) {
      return {
        success: false,
        message: 'No identity set',
      };
    }

    this.setConnectionState('connecting');
    this.lastConnectionError = null;

    try {
      // Try to restore session from storage first
      const storedSession = loadClientSession();
      if (storedSession?.sessionToken && storedSession?.refreshToken) {
        try {
          // Try to restore existing session
          this.session = Session.restore(storedSession.sessionToken, storedSession.refreshToken);
          // Check if session is expired or about to expire
          const now = Math.floor(Date.now() / 1000);
          if (this.session.isexpired(now)) {
            // Session expired, refresh it
            this.session = await this.client.sessionRefresh(this.session);
            console.log('DEBUG: Successfully refreshed expired session');
          } else {
            console.log('DEBUG: Successfully restored valid session');
          }
        } catch (restoreError) {
          console.log('DEBUG: Failed to restore session, creating new one:', restoreError);
          // Fall back to device authentication
          this.session = await this.client.authenticateDevice(this.identity.deviceId, true);
        }
      } else {
        // No stored session, create new one
        this.session = await this.client.authenticateDevice(this.identity.deviceId, true);
      }
      
      // Create socket connection
      this.socket = this.client.createSocket(config.useSSL, false);
      
      // Set up socket handlers
      this.socket.ondisconnect = (_evt) => {
        this.lastConnectionError = 'Socket disconnected';
        this.setConnectionState('disconnected');
      };
      this.socket.onerror = (_evt) => {
        this.lastConnectionError = 'Socket error';
        this.setConnectionState('disconnected');
      };
      this.socket.onmatchdata = (matchData) => {
        this.handleMatchData(matchData);
      };
      
      this.socket.onmatchpresence = (matchPresence) => {
        this.handleMatchPresence(matchPresence);
      };
      
      await this.socket.connect(this.session, false);
      
      this.setConnectionState('connected');
      this.lastConnectionError = null;
      
      // Update session storage with fresh tokens
      const updatedSession = loadClientSession() || { identity: this.identity };
      updatedSession.sessionToken = this.session.token;
      updatedSession.refreshToken = this.session.refresh_token;
      updatedSession.lastConnectedAt = Date.now();
      saveClientSession(updatedSession);

      return {
        success: true,
        message: 'Multiplayer foundation connected.',
        data: this.identity,
      };
    } catch (error) {
      this.setConnectionState('disconnected');
      this.lastConnectionError = error instanceof Error ? error.message : 'Unknown error';
      console.error('Connection error:', error);
      
      return {
        success: false,
        message: `Connection failed: ${this.lastConnectionError}`,
      };
    }
  }

  private handleMatchData(matchData: any): void {
    // matchData should have match_id, op_code, data properties from Nakama JS SDK
    const matchId = matchData.match_id;
    const opCode = matchData.op_code;
    const data = matchData.data;
    
    console.log('DEBUG handleMatchData: Received match data', {
      matchId,
      opCode,
      dataType: typeof data,
      dataPreview: typeof data === 'string' ? data.substring(0, 100) : String(data),
      activeMatchId: this.activeMatchContext?.matchId,
      hasActiveContext: !!this.activeMatchContext
    });
    
    // If we don't have an active match context for this match, create one
    // This handles the race condition where state_sync arrives before joinMatch completes
    if (!this.activeMatchContext || this.activeMatchContext.matchId !== matchId) {
      console.log('DEBUG handleMatchData: Creating/updating activeMatchContext for match', matchId);
      this.activeMatchContext = {
        matchId,
        roomCode: '', // Will be updated from state_sync
        playerSymbol: null
      };
    }

    try {
      const decoded =
        typeof data === 'string'
          ? data
          : data instanceof Uint8Array
            ? decodeUint8ArrayToString(data)
            : data instanceof ArrayBuffer
              ? decodeArrayBufferToString(data)
              : data && typeof data === 'object' && 'buffer' in data
                ? decodeArrayBufferToString((data as any).buffer)
                : String(data);
      
      console.log('DEBUG handleMatchData: Decoded data', {
        decoded,
        decodedType: typeof decoded,
        length: decoded.length
      });
      
      const parsedData = JSON.parse(decoded);
      console.log('DEBUG handleMatchData: Parsed data', { parsedData });
      
      switch (opCode) {
        case 2: // OP_CODE_STATE_SYNC
          console.log('DEBUG handleMatchData: STATE_SYNC for match', matchId, 'state:', parsedData);
          const matchState = parsedData as PublicMatchState;
          this.updateMatchContextFromState(matchState);
          
          // Clear pending move on state sync if it matches the pending move index
          if (this.pendingMove && this.activeMatchContext?.matchId === matchId) {
            // Check if the pending move index is now occupied in the board
            if (matchState.board[this.pendingMove.index] !== null) {
              console.log('DEBUG handleMatchData: Clearing pending move - move accepted', this.pendingMove);
              this.clearPendingMove();
            } else if (matchState.phase === 'completed' || matchState.phase === 'reconnect_grace') {
              // Clear pending move if game ended or is in reconnect grace
              console.log('DEBUG handleMatchData: Clearing pending move - game state changed', this.pendingMove);
              this.clearPendingMove();
            }
          }
          
          this.emitMatchEvent('state_sync', matchState);
          break;
          
        case 3: // OP_CODE_ACTION_REJECTED
          console.log('DEBUG handleMatchData: ACTION_REJECTED for match', matchId, 'reason:', parsedData.reason, 'message:', parsedData.message);
          // Clear pending move on rejection
          if (this.pendingMove && this.activeMatchContext?.matchId === matchId) {
            console.log('DEBUG handleMatchData: Clearing pending move - action rejected', this.pendingMove);
            this.clearPendingMove();
          }
          this.emitMatchEvent('action_rejected', parsedData as ActionRejectPayload);
          break;
          
        default:
          console.warn(`DEBUG handleMatchData: Unknown opCode received: ${opCode}`);
      }
    } catch (error) {
      console.error('DEBUG handleMatchData: Error parsing match data:', error, {
        data,
        dataType: typeof data
      });
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

  private parseRpcPayload<T>(payload: unknown, rpcName: string): T {
    // nakama-js already JSON.parses ApiRpc.payload into an object. However, be tolerant
    // if we ever receive a string payload (e.g. different client version).
    if (payload == null) {
      throw new Error(`${rpcName} returned empty payload`);
    }
    if (typeof payload === 'string') {
      return JSON.parse(payload) as T;
    }
    if (typeof payload === 'object') {
      return payload as T;
    }
    throw new Error(`${rpcName} returned non-JSON payload type: ${typeof payload}`);
  }

  private formatErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message || 'Unknown error';
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object') {
      const maybeMessage = (error as any).message;
      if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage;
      try {
        return JSON.stringify(error);
      } catch {
        return 'Unknown error';
      }
    }
    return 'Unknown error';
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
      const rpcResult: QuickPlayRpcResult = this.parseRpcPayload(result.payload, 'quick_play');
      
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
      const rpcResult: CreateRoomRpcResult = this.parseRpcPayload(result.payload, 'create_room');
      
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
      const rpcResult: JoinRoomRpcResult = this.parseRpcPayload(result.payload, 'join_room');
      
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
      const rpcResult: ListRoomsRpcResult = this.parseRpcPayload(result.payload, 'list_rooms');
      
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
  async joinMatch(matchId: string, roomCode?: string): Promise<ShellActionResult> {
    console.log('DEBUG joinMatch: called', { matchId, roomCode, connectionState: this.connectionState });
    
    if (this.connectionState !== 'connected') {
      console.log('DEBUG joinMatch: Not connected');
      return {
        success: false,
        message: 'Not connected to multiplayer service',
      };
    }

    if (!this.socket) {
      console.log('DEBUG joinMatch: Socket not available');
      return {
        success: false,
        message: 'Socket not available',
      };
    }

    try {
      // Join the match with metadata (nickname for backend)
      const metadata = {
        nickname: this.identity?.nickname || 'Player'
      };
      console.log('DEBUG joinMatch: Joining with metadata', metadata);
      const match = await this.socket.joinMatch(matchId, undefined, metadata as any);
      console.log('DEBUG joinMatch: Successfully joined match', { 
        matchId: match.match_id,
        roomCode 
      });
      
      // Determine player symbol from match presence
      // playerSymbol will be set from state_sync
      // We'll determine symbol from state_sync after joining.
      this.activeMatchContext = {
        matchId: match.match_id,
        roomCode: roomCode || '', // Will be updated from state_sync if empty
        playerSymbol: null
      };
      // Save to storage for reconnect/resume
      saveActiveMatch(this.activeMatchContext);
      console.log('DEBUG joinMatch: Set activeMatchContext', this.activeMatchContext);
      this.emitMatchEvent('match_joined', { matchId: match.match_id });
      
      return {
        success: true,
        message: 'Joined match',
      };
    } catch (error) {
      console.error('DEBUG joinMatch: Error joining match:', error);
      return {
        success: false,
        message: `Failed to join match: ${this.formatErrorMessage(error)}`,
      };
    }
  }

  async sendMoveIntent(index: number): Promise<ShellActionResult> {
    console.log('DEBUG sendMoveIntent: called with index=', index, 'type=', typeof index);
    
    // Validate index is a valid number between 0-8
    if (typeof index !== 'number' || index < 0 || index > 8 || !Number.isInteger(index)) {
      console.error('DEBUG sendMoveIntent: Invalid index', { index, type: typeof index });
      return {
        success: false,
        message: 'Invalid cell index',
      };
    }

    if (this.connectionState !== 'connected') {
      console.log('DEBUG sendMoveIntent: Not connected, state=', this.connectionState);
      return {
        success: false,
        message: 'Not connected to multiplayer service',
      };
    }

    if (!this.socket) {
      console.log('DEBUG sendMoveIntent: Socket not available');
      return {
        success: false,
        message: 'Socket not available',
      };
    }

    if (!this.activeMatchContext?.matchId) {
      console.log('DEBUG sendMoveIntent: No active match context', { activeMatchContext: this.activeMatchContext });
      return {
        success: false,
        message: 'Not in a match',
      };
    }

    // Check if there's already a pending move
    if (this.pendingMove) {
      console.log('DEBUG sendMoveIntent: Already has pending move', this.pendingMove);
      return {
        success: false,
        message: 'Waiting for server confirmation on previous move',
      };
    }

    try {
      // Set pending move before sending
      this.setPendingMove(index);
      
      const payload: MoveIntentPayload = { index };
      const payloadStr = JSON.stringify(payload);
      console.log('DEBUG sendMoveIntent: Sending move', {
        matchId: this.activeMatchContext.matchId,
        opCode: 1,
        payload: payloadStr,
        payloadObj: payload
      });
      
      // Convert string to Uint8Array for reliable transmission
      const data = stringToUint8Array(payloadStr);
      
      await this.socket.sendMatchState(
        this.activeMatchContext.matchId,
        1, // OP_CODE_MOVE_INTENT
        data // Send as Uint8Array instead of string
      );
      
      console.log('DEBUG sendMoveIntent: Move sent successfully');
      return {
        success: true,
        message: 'Move sent',
      };
    } catch (error) {
      // Clear pending move on error
      this.clearPendingMove();
      console.error('DEBUG sendMoveIntent: Error sending move:', error);
      return {
        success: false,
        message: `Failed to send move: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  leaveMatch(): void {
    console.log('DEBUG leaveMatch: called', { 
      activeMatchContext: this.activeMatchContext,
      hasSocket: !!this.socket 
    });
    
    if (this.activeMatchContext?.matchId && this.socket) {
      try {
        console.log('DEBUG leaveMatch: Leaving match', this.activeMatchContext.matchId);
        this.socket.leaveMatch(this.activeMatchContext.matchId);
      } catch (error) {
        console.error('DEBUG leaveMatch: Error leaving match:', error);
      }
    }
    
    console.log('DEBUG leaveMatch: Clearing activeMatchContext and pending move');
    this.activeMatchContext = null;
    saveActiveMatch(null); // Clear from storage
    this.clearPendingMove(); // Clear any pending move
    this.emitMatchEvent('match_left', {});
  }

  // Update match context from state sync
  updateMatchContextFromState(state: PublicMatchState): void {
    console.log('DEBUG updateMatchContextFromState: called', { 
      stateMatchId: state.matchId,
      activeMatchId: this.activeMatchContext?.matchId,
      userId: this.session?.user_id,
      playerXUserId: state.playerX?.userId,
      playerOUserId: state.playerO?.userId
    });
    
    // If we don't have an active match context for this match, create one
    // This handles the race condition where state_sync arrives before joinMatch completes
    if (!this.activeMatchContext || this.activeMatchContext.matchId !== state.matchId) {
      console.log('DEBUG updateMatchContextFromState: Creating/updating activeMatchContext for match', state.matchId);
      this.activeMatchContext = {
        matchId: state.matchId,
        roomCode: state.roomCode,
        playerSymbol: null
      };
    }

    // Update room code
    this.activeMatchContext.roomCode = state.roomCode;
    
    // Determine player symbol
    const userId = this.session?.user_id;
    if (userId) {
      if (state.playerX?.userId === userId) {
        this.activeMatchContext.playerSymbol = 'X';
        console.log('DEBUG updateMatchContextFromState: Set playerSymbol to X');
      } else if (state.playerO?.userId === userId) {
        this.activeMatchContext.playerSymbol = 'O';
        console.log('DEBUG updateMatchContextFromState: Set playerSymbol to O');
      } else {
        this.activeMatchContext.playerSymbol = null;
        console.log('DEBUG updateMatchContextFromState: Set playerSymbol to null (user not found in match)');
      }
    } else {
      console.log('DEBUG updateMatchContextFromState: No userId available');
    }
    
    // Save to storage for reconnect/resume
    saveActiveMatch(this.activeMatchContext);
    
    console.log('DEBUG updateMatchContextFromState: Updated context', this.activeMatchContext);
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

  // Attempt to resume a match from stored context
  async attemptResume(): Promise<ResumeAttemptResult> {
    if (!this.activeMatchContext?.matchId) {
      return {
        success: false,
        reason: 'could_not_rejoin',
        message: 'No active match to resume'
      };
    }

    if (this.connectionState !== 'connected') {
      const connectResult = await this.ensureConnected();
      if (!connectResult.success) {
        return {
          success: false,
          reason: 'could_not_rejoin',
          message: 'Failed to connect to multiplayer service'
        };
      }
    }

    try {
      const result = await this.joinMatch(this.activeMatchContext.matchId, this.activeMatchContext.roomCode);
      if (result.success) {
        return {
          success: true,
          message: 'Rejoined your match'
          // matchState will be populated by state_sync
        };
      } else {
        // If join fails, clear the stale context
        this.activeMatchContext = null;
        saveActiveMatch(null);
        return {
          success: false,
          reason: 'room_no_longer_exists',
          message: 'Could not rejoin the previous match'
        };
      }
    } catch (error) {
      console.error('Resume attempt error:', error);
      this.activeMatchContext = null;
      saveActiveMatch(null);
      return {
        success: false,
        reason: 'could_not_rejoin',
        message: 'Failed to rejoin match'
      };
    }
  }

  // Clear stale active match context (e.g., when resume fails deterministically)
  clearStaleActiveMatch(): void {
    this.activeMatchContext = null;
    saveActiveMatch(null);
    this.clearPendingMove();
  }
}

// Create and export singleton instance
export const nakamaClient = new NakamaClient();
