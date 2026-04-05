import { useState, useEffect } from 'react';
import { nakamaClient } from './nakamaClient';
import { GetLeaderboardResponse } from './types';

interface LeaderboardViewProps {
  onBack?: () => void;
}

function LeaderboardView({ onBack }: LeaderboardViewProps) {
  const [leaderboardData, setLeaderboardData] = useState<GetLeaderboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const fetchLeaderboard = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await nakamaClient.getLeaderboard(20, 0);
      setLeaderboardData(response);
      setLastUpdated(Date.now());

      if (!response.success) {
        setError(response.message || 'Failed to load leaderboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLeaderboardData({
        success: false,
        top: [],
        self: null,
        updatedAt: Date.now(),
        error: 'fetch_failed',
        message: 'Failed to fetch leaderboard',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchLeaderboard();
  }, []);

  const handleRefresh = () => {
    void fetchLeaderboard();
  };

  const handleBack = () => {
    onBack?.();
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const currentUserId = nakamaClient.getUserId();

  if (isLoading) {
    return (
      <div className="leaderboard-view">
        <div className="leaderboard-header">
          <h2 className="leaderboard-title">Leaderboard</h2>
          <button type="button" className="btn btn--tertiary" onClick={handleBack}>
            Back
          </button>
        </div>
        <div className="leaderboard-loading">
          <p>Loading leaderboard...</p>
        </div>
      </div>
    );
  }

  if (error && (!leaderboardData || !leaderboardData.top?.length)) {
    return (
      <div className="leaderboard-view">
        <div className="leaderboard-header">
          <h2 className="leaderboard-title">Leaderboard</h2>
          <button type="button" className="btn btn--tertiary" onClick={handleBack}>
            Back
          </button>
        </div>
        <div className="leaderboard-error">
          <p>{error}</p>
          <button type="button" className="btn btn--primary" onClick={handleRefresh}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const topEntries = leaderboardData?.top || [];
  const selfEntry = leaderboardData?.self || null;
  const hasEntries = topEntries.length > 0;

  return (
    <div className="leaderboard-view">
      <div className="leaderboard-header">
        <h2 className="leaderboard-title">Leaderboard</h2>
        <div className="leaderboard-header-actions">
          <button type="button" className="btn btn--tertiary" onClick={handleRefresh} disabled={isLoading}>
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" className="btn btn--tertiary" onClick={handleBack}>
            Back
          </button>
        </div>
      </div>

      {lastUpdated && (
        <div className="leaderboard-updated">Loaded {formatTimeAgo(lastUpdated)}</div>
      )}

      {!hasEntries ? (
        <div className="leaderboard-empty">
          <p className="leaderboard-empty-title">No matches recorded yet.</p>
          <p className="leaderboard-empty-message">Play a match to populate the leaderboard.</p>
          <button type="button" className="btn btn--primary" onClick={handleBack}>
            Back to lobby
          </button>
        </div>
      ) : (
        <>
          <div className="leaderboard-list">
            {topEntries.map((entry) => {
              const isCurrentUser = entry.userId === currentUserId;
              const rank = entry.rank ?? 0;

              return (
                <div
                  key={entry.userId}
                  className={`leaderboard-row ${isCurrentUser ? 'leaderboard-row--you' : ''}`}
                >
                  <div className="leaderboard-rank">
                    <span className={`leaderboard-rank-badge ${rank <= 3 ? `leaderboard-rank-badge--top${rank}` : ''}`}>
                      #{rank}
                    </span>
                  </div>

                  <div className="leaderboard-player">
                    <div className="leaderboard-player-name">
                      {entry.nickname || 'Player'}
                      {isCurrentUser && <span className="leaderboard-you-badge">You</span>}
                    </div>
                    <div className="leaderboard-player-stats">
                      <span className="leaderboard-stat leaderboard-stat--wins">
                        {entry.wins} win{entry.wins !== 1 ? 's' : ''}
                      </span>
                      <span className="leaderboard-stat leaderboard-stat--losses">
                        {entry.losses} loss{entry.losses !== 1 ? 'es' : ''}
                      </span>
                      {(entry.draws ?? 0) > 0 && (
                        <span className="leaderboard-stat leaderboard-stat--draws">
                          {entry.draws} draw{entry.draws !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="leaderboard-streak">
                    <div className="leaderboard-streak-current">
                      <span className="leaderboard-streak-label">Streak</span>
                      <span className="leaderboard-streak-value">{entry.streak}</span>
                    </div>
                    {(entry.bestStreak ?? 0) > 0 && (
                      <div className="leaderboard-streak-best">
                        <span className="leaderboard-streak-label">Best</span>
                        <span className="leaderboard-streak-value">{entry.bestStreak}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {selfEntry && !topEntries.some((entry) => entry.userId === currentUserId) && (
            <div className="leaderboard-self-section">
              <h3 className="leaderboard-self-title">Your rank</h3>
              <div className="leaderboard-row leaderboard-row--you">
                <div className="leaderboard-rank">
                  <span className="leaderboard-rank-badge">#{selfEntry.rank ?? '—'}</span>
                </div>

                <div className="leaderboard-player">
                  <div className="leaderboard-player-name">
                    {selfEntry.nickname || 'Player'}
                    <span className="leaderboard-you-badge">You</span>
                  </div>
                  <div className="leaderboard-player-stats">
                    <span className="leaderboard-stat leaderboard-stat--wins">
                      {selfEntry.wins} win{selfEntry.wins !== 1 ? 's' : ''}
                    </span>
                    <span className="leaderboard-stat leaderboard-stat--losses">
                      {selfEntry.losses} loss{selfEntry.losses !== 1 ? 'es' : ''}
                    </span>
                    {(selfEntry.draws ?? 0) > 0 && (
                      <span className="leaderboard-stat leaderboard-stat--draws">
                        {selfEntry.draws} draw{selfEntry.draws !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                <div className="leaderboard-streak">
                  <div className="leaderboard-streak-current">
                    <span className="leaderboard-streak-label">Streak</span>
                    <span className="leaderboard-streak-value">{selfEntry.streak}</span>
                  </div>
                  {(selfEntry.bestStreak ?? 0) > 0 && (
                    <div className="leaderboard-streak-best">
                      <span className="leaderboard-streak-label">Best</span>
                      <span className="leaderboard-streak-value">{selfEntry.bestStreak}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="leaderboard-footer">
            <p className="leaderboard-footer-note">
              Updates after each finished match. Streak resets on a loss or draw.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

export default LeaderboardView;
