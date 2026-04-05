/**
 * Leaderboard persistence (collection "leaderboard", key "stats", per-user owner).
 * Read from RPC; writes only from authoritative match completion via commitMatchLeaderboardToStorage.
 */

var LEADERBOARD_COLLECTION = 'leaderboard';
var LEADERBOARD_KEY = 'stats';

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

function leaderboardSanitizeNickname(nickname: string | null | undefined): string {
  var n = nickname != null ? String(nickname).trim() : '';
  return n.length > 0 ? n : 'Player';
}

function leaderboardReadUserStats(nk: nkruntime.Nakama, userId: string): LeaderboardStatsRow | null {
  try {
    var objects = nk.storageRead([{ collection: LEADERBOARD_COLLECTION, key: LEADERBOARD_KEY, userId: userId }]);
    if (!objects || objects.length === 0) return null;
    return objects[0].value as LeaderboardStatsRow;
  } catch (_e) {
    return null;
  }
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

function leaderboardToWriteObject(stats: LeaderboardStatsRow): any {
  return {
    collection: LEADERBOARD_COLLECTION,
    key: LEADERBOARD_KEY,
    userId: stats.userId,
    value: stats,
    permissionRead: 2,
    permissionWrite: 0
  };
}

/**
 * Apply one competitive match outcome to storage for both seats. Single storageWrite batch.
 * Returns true if writes succeeded.
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

  var rowW = leaderboardReadUserStats(nk, winnerUserId) || leaderboardEmptyRow(winnerUserId, nickW);
  var rowL = leaderboardReadUserStats(nk, loserUserId) || leaderboardEmptyRow(loserUserId, nickL);

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

  try {
    nk.storageWrite([leaderboardToWriteObject(rowW), leaderboardToWriteObject(rowL)]);
    return true;
  } catch (e) {
    logger.error('leaderboard: storageWrite failed: ' + (e != null ? String(e) : 'unknown'));
    return false;
  }
}

function leaderboardListAllStatRows(nk: nkruntime.Nakama): LeaderboardStatsRow[] {
  try {
    var result = nk.storageList('', LEADERBOARD_COLLECTION, LEADERBOARD_KEY, 1000);
    if (!result || !result.objects) return [];
    var out: LeaderboardStatsRow[] = [];
    for (var i = 0; i < result.objects.length; i++) {
      var v = result.objects[i].value as LeaderboardStatsRow;
      if (v && v.userId) out.push(v);
    }
    return out;
  } catch (_e) {
    return [];
  }
}

function leaderboardRankRows(rows: LeaderboardStatsRow[]): LeaderboardStatsRow[] {
  var copy = rows.slice();
  copy.sort(function (a, b) {
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.streak !== b.streak) return b.streak - a.streak;
    if (a.losses !== b.losses) return a.losses - b.losses;
    return b.updatedAt - a.updatedAt;
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

  var ranked = leaderboardRankRows(leaderboardListAllStatRows(nk));
  var withRank: any[] = [];
  for (var r = 0; r < ranked.length; r++) {
    var row = ranked[r];
    withRank.push({
      userId: row.userId,
      nickname: row.nickname || 'Player',
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
