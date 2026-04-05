/**
 * Room creation, joining, and discovery RPC layer for Tic-Tac-Toe
 */

// Room code generation
const RPC_ROOM_CODE_LENGTH = 6;
const RPC_ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

type RpcMatchPhase =
  | 'waiting_for_opponent'
  | 'ready'
  | 'in_progress'
  | 'reconnect_grace'
  | 'completed';

interface MatchLabel {
  roomCode: string;
  visibility: 'public' | 'private';
  mode: 'classic' | 'timed';
  phase: RpcMatchPhase;
  occupancy: 0 | 1 | 2;
  open: boolean;
}

function generateRoomCodeRpc(): string {
  let code = '';
  for (let i = 0; i < RPC_ROOM_CODE_LENGTH; i++) {
    code += RPC_ALPHANUMERIC[Math.floor(Math.random() * RPC_ALPHANUMERIC.length)];
  }
  return code;
}

// Nickname validation
function sanitizeNickname(nickname: string): string {
  return nickname.trim().slice(0, 20) || 'Player';
}

// Parse match label
function parseMatchLabel(labelString: string): MatchLabel | null {
  try {
    return JSON.parse(labelString);
  } catch (e) {
    return null;
  }
}

function listMatches(nk: nkruntime.Nakama, limit: number, authoritative?: boolean, label?: string, minSize?: number, maxSize?: number, query?: string): nkruntime.MatchList.Match[] {
  // Nakama runtime returns either `Match[]` or `{ matches: Match[] }` depending on the runtime/typings.
  const result: any = nk.matchList(limit, authoritative, label, minSize, maxSize, query);
  if (Array.isArray(result)) return result as nkruntime.MatchList.Match[];
  if (result && Array.isArray(result.matches)) return result.matches as nkruntime.MatchList.Match[];
  return [];
}

// Find room by room code
function findRoomByCode(nk: nkruntime.Nakama, roomCode: string): nkruntime.MatchList.Match | null {
  // Include size 0 matches so a newly-created private room can be found even before the creator
  // socket-joins (creator seat is reserved at matchInit and label includes roomCode).
  const matches = listMatches(nk, 100, true, undefined, 0, 2, undefined);
  
  for (const match of matches) {
    const label = parseMatchLabel(match.label || '{}');
    if (label && label.roomCode === roomCode) {
      return match;
    }
  }
  
  return null;
}

// Get joinable public waiting rooms
function getJoinablePublicRooms(nk: nkruntime.Nakama, mode?: 'classic' | 'timed'): nkruntime.MatchList.Match[] {
  // Public discovery/quick-play should only consider rooms with exactly one seated player.
  const matches = listMatches(nk, 100, true, undefined, 1, 1, undefined);
  const joinableRooms: nkruntime.MatchList.Match[] = [];
  
  for (const match of matches) {
    const label = parseMatchLabel(match.label || '{}');
    if (label && label.visibility === 'public' && label.open && label.phase === 'waiting_for_opponent') {
      if (!mode || label.mode === mode) {
        joinableRooms.push(match);
      }
    }
  }
  
  return joinableRooms;
}

// RPC: Create room
function createRoomRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    const params = payload ? JSON.parse(payload) : {};
    const nickname = sanitizeNickname(params.nickname || 'Player');
    const isPrivate = params.isPrivate === true;
    const mode = params.mode === 'timed' ? 'timed' : 'classic';
    
    logger.info('createRoomRpc: Creating room with mode=' + mode + ', isPrivate=' + isPrivate);
    
    const roomCode = generateRoomCodeRpc();
    const visibility = isPrivate ? 'private' : 'public';
    
    // Create match
    const matchId = nk.matchCreate('tic_tac_toe', {
      roomCode,
      visibility,
      creatorUserId: ctx.userId,
      creatorNickname: nickname,
      mode
    });
    
    logger.info('createRoomRpc: Created match ' + matchId + ' with mode=' + mode);
    
    return JSON.stringify({
      success: true,
      matchId,
      roomCode,
      isPrivate,
      mode
    });
    
  } catch (error) {
    logger.error('createRoomRpc error: ' + error);
    return JSON.stringify({
      success: false,
      error: 'failed_to_create_room',
      message: 'Failed to create room'
    });
  }
}

// RPC: Join room by code
function joinRoomRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    const params = payload ? JSON.parse(payload) : {};
    const roomCode = params.roomCode;
    
    if (!roomCode || typeof roomCode !== 'string' || roomCode.length !== RPC_ROOM_CODE_LENGTH) {
      return JSON.stringify({
        success: false,
        error: 'invalid_room_code',
        message: 'Invalid room code'
      });
    }
    
    const match = findRoomByCode(nk, roomCode);
    if (!match) {
      return JSON.stringify({
        success: false,
        error: 'room_not_found',
        message: 'Room not found'
      });
    }
    
    // Check if room is joinable by parsing label
    const label = parseMatchLabel(match.label || '{}');
    const isJoinable =
      !!label &&
      label.occupancy < 2 &&
      label.phase === 'waiting_for_opponent' &&
      label.open;
    if (!isJoinable) {
      // Provide more specific error messages based on label state
      if (label && label.occupancy >= 2) {
        return JSON.stringify({
          success: false,
          error: 'room_not_joinable',
          message: 'Room is full'
        });
      } else if (label && label.phase !== 'waiting_for_opponent') {
        return JSON.stringify({
          success: false,
          error: 'room_not_joinable',
          message: 'Room is no longer available'
        });
      } else {
        return JSON.stringify({
          success: false,
          error: 'room_not_joinable',
          message: 'Room is not joinable'
        });
      }
    }
    
    return JSON.stringify({
      success: true,
      matchId: match.matchId,
      roomCode,
      mode: label ? label.mode : 'classic'
    });
    
  } catch (error) {
    logger.error('joinRoomRpc error: ' + error);
    return JSON.stringify({
      success: false,
      error: 'failed_to_join_room',
      message: 'Failed to join room'
    });
  }
}

// RPC: List joinable rooms
function listRoomsRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    const joinableRooms = getJoinablePublicRooms(nk); // No mode filter for discovery list
    
    const rooms = joinableRooms.map(match => {
      const label = parseMatchLabel(match.label || '{}');
      return {
        matchId: match.matchId,
        roomCode: (label && label.roomCode) ? label.roomCode : 'UNKNOWN',
        mode: (label && label.mode) ? label.mode : 'classic',
        playerCount: (label && label.occupancy) ? label.occupancy : 0,
        maxPlayers: 2
      };
    });
    
    return JSON.stringify({
      success: true,
      rooms
    });
    
  } catch (error) {
    logger.error('listRoomsRpc error: ' + error);
    return JSON.stringify({
      success: false,
      error: 'failed_to_list_rooms',
      message: 'Failed to list rooms',
      rooms: []
    });
  }
}

// RPC: Quick play
function quickPlayRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    const params = payload ? JSON.parse(payload) : {};
    const nickname = sanitizeNickname(params.nickname || 'Player');
    const mode = params.mode === 'timed' ? 'timed' : 'classic';
    
    // Look for existing joinable public room with matching mode
    const joinableRooms = getJoinablePublicRooms(nk, mode);
    
    if (joinableRooms.length > 0) {
      // Join the first available room
      const match = joinableRooms[0];
      const label = parseMatchLabel(match.label || '{}');
      
      return JSON.stringify({
        success: true,
        matchId: match.matchId,
        roomCode: (label && label.roomCode) ? label.roomCode : 'UNKNOWN',
        mode: label ? label.mode : mode,
        joinedExisting: true
      });
    }
    
    // No existing room, create a new public one
    const roomCode = generateRoomCodeRpc();
    const matchId = nk.matchCreate('tic_tac_toe', {
      roomCode,
      visibility: 'public',
      creatorUserId: ctx.userId,
      creatorNickname: nickname,
      mode
    });
    
    return JSON.stringify({
      success: true,
      matchId,
      roomCode,
      mode,
      joinedExisting: false
    });
    
  } catch (error) {
    logger.error('quickPlayRpc error: ' + error);
    return JSON.stringify({
      success: false,
      error: 'failed_to_quick_play',
      message: 'Failed to quick play'
    });
  }
}
