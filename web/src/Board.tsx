import { PlayerSymbol } from './types';

interface BoardProps {
  board: Array<null | PlayerSymbol>;
  disabled?: boolean;
  onCellClick?: (index: number) => void;
  winningLine?: number[] | null;
}

// Simple inline styles matching the repo's styling approach
const styles = {
  board: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: 'repeat(3, 1fr)',
    gap: '8px',
    maxWidth: '300px',
    margin: '0 auto',
    aspectRatio: '1 / 1',
  },
  cell: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
    border: '2px solid #dee2e6',
    borderRadius: '8px',
    fontSize: '2.5rem',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
    userSelect: 'none' as const,
    transition: 'all 0.2s',
    minHeight: '80px',
  },
  cellHover: {
    backgroundColor: '#e9ecef',
    borderColor: '#adb5bd',
  },
  cellDisabled: {
    backgroundColor: '#f8f9fa',
    borderColor: '#dee2e6',
    cursor: 'default',
    opacity: 0.8,
  },
  cellOccupied: {
    cursor: 'default',
  },
  cellWinning: {
    backgroundColor: '#d4edda',
    borderColor: '#c3e6cb',
  },
  symbolX: {
    color: '#dc3545',
  },
  symbolO: {
    color: '#007bff',
  },
};

function Board({ board, disabled = false, onCellClick, winningLine = null }: BoardProps) {
  const handleCellClick = (index: number) => {
    if (disabled || board[index] !== null || !onCellClick) {
      return;
    }
    onCellClick(index);
  };

  const isWinningCell = (index: number): boolean => {
    return winningLine?.includes(index) || false;
  };

  const getCellStyle = (index: number, value: null | PlayerSymbol) => {
    const baseStyle = { ...styles.cell };
    
    if (disabled || value !== null) {
      Object.assign(baseStyle, styles.cellDisabled);
    }
    
    if (value !== null) {
      Object.assign(baseStyle, styles.cellOccupied);
    }
    
    if (isWinningCell(index)) {
      Object.assign(baseStyle, styles.cellWinning);
    }
    
    return baseStyle;
  };

  const getSymbolStyle = (value: null | PlayerSymbol) => {
    if (value === 'X') return styles.symbolX;
    if (value === 'O') return styles.symbolO;
    return {};
  };

  return (
    <div style={styles.board}>
      {board.map((value, index) => (
        <div
          key={index}
          style={getCellStyle(index, value)}
          onClick={() => handleCellClick(index)}
          onMouseEnter={(e) => {
            if (!disabled && value === null && onCellClick) {
              Object.assign(e.currentTarget.style, styles.cellHover);
            }
          }}
          onMouseLeave={(e) => {
            if (!disabled && value === null && onCellClick) {
              Object.assign(e.currentTarget.style, {
                backgroundColor: '#f8f9fa',
                borderColor: '#dee2e6',
              });
            }
          }}
          aria-label={`Cell ${index + 1}, ${value ? `occupied by ${value}` : 'empty'}`}
          role="button"
          tabIndex={disabled || value !== null ? -1 : 0}
        >
          {value && (
            <span style={getSymbolStyle(value)}>
              {value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default Board;