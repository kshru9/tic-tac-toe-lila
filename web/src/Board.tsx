import { PlayerSymbol } from './types';

interface BoardProps {
  board: Array<null | PlayerSymbol>;
  disabled?: boolean;
  onCellClick?: (index: number) => void;
  winningLine?: number[] | null;
  pendingCellIndex?: number | null;
}

function Board({ board, disabled = false, onCellClick, winningLine = null, pendingCellIndex = null }: BoardProps) {
  const handleCellClick = (index: number) => {
    if (!onCellClick) {
      return;
    }
    // Ensure index is valid
    if (typeof index !== 'number' || index < 0 || index >= board.length) {
      console.error('Invalid cell index in Board:', index);
      return;
    }
    onCellClick(index);
  };

  const isWinningCell = (index: number): boolean => {
    return winningLine?.includes(index) || false;
  };

  function cellClassName(index: number, value: null | PlayerSymbol): string {
    const parts = ['board-cell'];
    const interactive = !disabled && value === null && !!onCellClick;
    if (interactive) parts.push('board-cell--interactive');
    if (value !== null) parts.push('board-cell--filled');
    if (disabled || value !== null) parts.push('board-cell--disabled');
    if (isWinningCell(index)) parts.push('board-cell--winning');
    if (pendingCellIndex === index) parts.push('board-cell--pending');
    return parts.join(' ');
  }

  function markClassName(value: PlayerSymbol): string {
    return value === 'X' ? 'board-mark board-mark--x' : 'board-mark board-mark--o';
  }

  return (
    <div className="board-shell">
      <div className="board-frame">
        <div className="board-grid">
          {board.map((value, index) => (
            <div
              key={index}
              className={cellClassName(index, value)}
              onClick={() => handleCellClick(index)}
              aria-label={`Cell ${index + 1}, ${value ? `occupied by ${value}` : 'empty'}`}
              role="button"
              tabIndex={disabled || value !== null ? -1 : 0}
            >
              {value && <span className={markClassName(value)}>{value}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Board;
