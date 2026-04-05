/**
 * Leaderboard persistence: single authoritative index object (system user) + RPC read.
 * Writes only from authoritative match completion via commitMatchLeaderboardToStorage.
 *
 * Per-user storage + storageList("", ...) is unreliable for cross-user aggregation in Nakama;
 * the index record lists all stats rows in one place.
 */

var LEADERBOARD_COLLECTION = 'leaderboard';
/** Global index: one object owned by the system user */
var LEADERBOARD_INDEX_KEY = 'stats_index';
var LEADERBOARD_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

interface LeaderboardStatsRow {
  userId: string;
  nickname: string;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  bestStreak: number;
  gamesPlayed: number;
  updatedAt: number;
}

interface LeaderboardIndexValue {
  entries: LeaderboardStatsRow[];
}

function leaderboardSanitizeNickname(nickname: string | null | undefined): string {
  var n = nickname != null ? String(nickname).trim() : '';
  return n.length > 0 ? n : 'Player';
}

function leaderboardReadIndexEntries(nk: nkruntime.Nakama): LeaderboardStatsRow[] {
  try {
    var objects = nk.storageRead([
      { collection: LEADERBOARD_COLLECTION, key: LEADERBOARD_INDEX_KEY, userId: LEADERBOARD_SYSTEM_USER_ID }
    ]);
    if (!objects || objects.length === 0) return [];
    var raw = objects[0].value as LeaderboardIndexValue;
    if (!raw || !raw.entries || !Array.isArray(raw.entries)) return [];
    var out: LeaderboardStatsRow[] = [];
    for (var i = 0; i < raw.entries.length; i++) {
      var e = raw.entries[i];
      if (e && e.userId) out.push(e);
    }
    return out;
  } catch (_e) {
    return [];
  }
}

function leaderboardFindEntry(entries: LeaderboardStatsRow[], userId: string): LeaderboardStatsRow | null {
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].userId === userId) return entries[i];
  }
  return null;
}

function leaderboardEmptyRow(userId: string, nickname: string): LeaderboardStatsRow {
  return {
    userId: userId,
    nickname: nickname,
    wins: 0,
    losses: 0,
    draws: 0,
    streak: 0,
    bestStreak: 0,
    gamesPlayed: 0,
    updatedAt: Date.now()
  };
}

/**
 * Apply one competitive match outcome. Updates global index only.
 * Returns true if write succeeded.
 */
function commitMatchLeaderboardToStorage(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  winnerUserId: string | null,
  winnerNickname: string | null,
  loserUserId: string | null,
  loserNickname: string | null,
  isDraw: boolean
): boolean {
  if (!winnerUserId || !loserUserId) {
    logger.error('leaderboard: commit skipped — missing seat user id');
    return false;
  }

  var now = Date.now();
  var nickW = leaderboardSanitizeNickname(winnerNickname);
  var nickL = leaderboardSanitizeNickname(loserNickname);

  var entries = leaderboardReadIndexEntries(nk);
  var rowW = leaderboardFindEntry(entries, winnerUserId) || leaderboardEmptyRow(winnerUserId, nickW);
  var rowL = leaderboardFindEntry(entries, loserUserId) || leaderboardEmptyRow(loserUserId, nickL);

  rowW.nickname = nickW;
  rowL.nickname = nickL;
  rowW.updatedAt = now;
  rowL.updatedAt = now;
  rowW.gamesPlayed += 1;
  rowL.gamesPlayed += 1;

  if (isDraw) {
    rowW.draws += 1;
    rowL.draws += 1;
    rowW.streak = 0;
    rowL.streak = 0;
  } else {
    rowW.wins += 1;
    rowW.streak += 1;
    rowW.bestStreak = rowW.bestStreak > rowW.streak ? rowW.bestStreak : rowW.streak;
    rowL.losses += 1;
    rowL.streak = 0;
  }

  var next: LeaderboardStatsRow[] = [];
  for (var j = 0; j < entries.length; j++) {
    var e = entries[j];
    if (e.userId !== winnerUserId && e.userId !== loserUserId) {
      next.push(e);
    }
  }
  next.push(rowW);
  next.push(rowL);

  try {
    nk.storageWrite([
      {
        collection: LEADERBOARD_COLLECTION,
        key: LEADERBOARD_INDEX_KEY,
        userId: LEADERBOARD_SYSTEM_USER_ID,
        value: { entries: next } as LeaderboardIndexValue,
        permissionRead: 2,
        permissionWrite: 0
      }
    ]);
    return true;
  } catch (err) {
    logger.error('leaderboard: storageWrite failed: ' + (err != null ? String(err) : 'unknown'));
    return false;
  }
}

function leaderboardRankRows(rows: LeaderboardStatsRow[]): LeaderboardStatsRow[] {
  var copy = rows.slice();
  copy.sort(function (a, b) {
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.streak !== b.streak) return b.streak - a.streak;
    if (a.losses !== b.losses) return a.losses - b.losses;
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    if (a.userId < b.userId) return -1;
    if (a.userId > b.userId) return 1;
    return 0;
  });
  return copy;
}

/**
 * RPC helper: ranked slice + self row with rank.
 */
function leaderboardBuildResponse(
  nk: nkruntime.Nakama,
  currentUserId: string | null,
  limit: number,
  offset: number
): { top: any[]; self: any | null; updatedAt: number } {
  var safeLimit = limit;
  if (safeLimit < 1) safeLimit = 1;
  if (safeLimit > 100) safeLimit = 100;
  var safeOffset = offset < 0 ? 0 : offset;

  var ranked = leaderboardRankRows(leaderboardReadIndexEntries(nk));
  var withRank: any[] = [];
  for (var r = 0; r < ranked.length; r++) {
    var row = ranked[r];
    withRank.push({
      userId: row.userId,
      nickname: leaderboardSanitizeNickname(row.nickname),
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      streak: row.streak,
      bestStreak: row.bestStreak,
      gamesPlayed: row.gamesPlayed,
      updatedAt: row.updatedAt,
      rank: r + 1
    });
  }

  var top = withRank.slice(safeOffset, safeOffset + safeLimit);
  var self: any | null = null;
  if (currentUserId) {
    for (var s = 0; s < withRank.length; s++) {
      if (withRank[s].userId === currentUserId) {
        self = withRank[s];
        break;
      }
    }
  }

  return { top: top, self: self, updatedAt: Date.now() };
}
