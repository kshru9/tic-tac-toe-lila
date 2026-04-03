# LILA Multiplayer Tic-Tac-Toe

A server-authoritative multiplayer Tic-Tac-Toe game built with React + TypeScript + Vite + Nakama.

## Overview

This project implements a real-time multiplayer Tic-Tac-Toe experience with server-authoritative game logic. Players can join games via quick matchmaking, create private rooms, or join by room codes. The game uses Nakama for real-time multiplayer infrastructure with a 30-second reconnect grace period for handling temporary disconnections.

## Assignment-Fit Summary

This implementation satisfies the essential multiplayer game requirements:

- **Server-authoritative gameplay**: All game logic and move validation happens on the server
- **Real-time multiplayer**: Live game state synchronization between players
- **Multiple joining methods**: Quick play, room creation, and room code joining
- **Room discovery**: Public rooms list for joining open games
- **Reconnect handling**: 30-second grace period for players to reconnect
- **Complete game flow**: From lobby to match completion with win/draw/disconnect outcomes

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Multiplayer Backend**: Nakama with TypeScript runtime modules
- **Database**: PostgreSQL (required by Nakama)
- **Local Development**: Docker Compose
- **Build Tool**: Vite for fast development and optimized production builds

**Why this stack was chosen**:
- React + TypeScript provides a robust, type-safe frontend development experience
- Nakama offers battle-tested real-time multiplayer infrastructure with matchmaking, rooms, and authoritative gameplay
- Docker Compose ensures consistent local development environment across machines
- Vite delivers excellent developer experience with fast hot module replacement

## Repository Structure

```
lila-tictactoe/
├── README.md                   # This file
├── .env.example               # Environment variable template
├── .gitignore                 # Git ignore rules
├── docker-compose.yml         # Local development infrastructure
├── nakama/                    # Nakama TypeScript runtime
│   ├── Dockerfile            # Nakama server with runtime build
│   ├── package.json          # Runtime dependencies
│   ├── tsconfig.json         # TypeScript configuration
│   └── src/
│       ├── index.ts          # Runtime module initialization
│       ├── rpc.ts            # Room creation/joining RPC endpoints
│       ├── ticTacToeMatch.ts # Authoritative match handler
│       └── gameRules.ts      # Game logic and validation
├── web/                       # React frontend
│   ├── package.json          # Frontend dependencies
│   ├── tsconfig.json         # TypeScript configuration
│   ├── vite.config.ts        # Vite configuration
│   ├── index.html            # HTML entry point
│   └── src/
│       ├── main.tsx          # React entry point
│       ├── App.tsx           # Main application component
│       ├── nakamaClient.ts   # Nakama client wrapper
│       ├── types.ts          # Shared TypeScript types
│       ├── Lobby.tsx         # Lobby interface
│       ├── MatchView.tsx     # Game board and match interface
│       └── Board.tsx         # Tic-Tac-Toe board component
└── scripts/
    ├── dev.sh                # Local development helper
    └── deploy.sh             # Deployment guidance
```

## Local Setup and Installation

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local frontend development)
- Git

### Quick Start

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd tic-tac-toe
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```
   Review the `.env` file and update values if needed for your local setup.

3. **Start the local infrastructure**:
   ```bash
   docker-compose up
   ```
   This starts:
   - PostgreSQL database (port 5432)
   - Nakama server with TypeScript runtime (HTTP API: port 7350, WebSocket: port 7350)

4. **In a separate terminal, start the frontend**:
   ```bash
   cd web
   npm install
   npm run dev
   ```

5. **Open your browser** to the URL shown by Vite (typically `http://localhost:5173`).

### Alternative: Use the development helper script

```bash
./scripts/dev.sh
```

This script checks prerequisites, creates `.env` if missing, and starts the Docker Compose services.

## Environment Variables and Configuration

See `.env.example` for the complete template. The frontend reads from `VITE_*` prefixed variables:

- `VITE_NAKAMA_HOST`: Nakama server hostname (default: `localhost` for local development)
- `VITE_NAKAMA_PORT`: Nakama HTTP API port (default: `7350`)
- `VITE_NAKAMA_SERVER_KEY`: Server authentication key (default: `defaultkey` for local)
- `VITE_NAKAMA_USE_SSL`: Whether to use SSL (default: `false` for local)
- `VITE_NAKAMA_WEBSOCKET_PORT`: WebSocket port (default: `7350`)
- `VITE_APP_TITLE`: Application title shown in the UI

**Important**: For production deployment, use secure values for the server key and enable SSL.

## Architecture and Design Decisions

### Server-Authoritative Gameplay

All game logic executes on the Nakama server:
- Move validation (cell availability, turn order)
- Win/draw detection (rows, columns, diagonals, full board)
- State synchronization between players
- Disconnect/reconnect handling

The frontend acts as a renderer and intent sender:
- Displays the current game state
- Sends move intents to the server
- Shows validation errors from the server
- Handles real-time state updates

### Rooming and Matchmaking Flow

1. **Quick Play**: Automatically matches players into available public rooms
2. **Create Room**: Generates a 6-character room code for private games
3. **Join by Code**: Join existing rooms using the room code
4. **Room Discovery**: Browse and join public waiting rooms

### Real-Time State Sync

- WebSocket connection maintains live game state
- Server broadcasts state changes to all connected players
- Frontend updates UI immediately on state changes
- Automatic reconnection attempts on network issues

### Disconnect/Reconnect Grace Handling

- 30-second grace period for players to reconnect
- Game enters `reconnect_grace` phase when a player disconnects
- If player reconnects within grace period, game resumes
- If grace period expires, game ends with disconnect forfeit
- Opponent sees reconnect countdown during grace period

## Gameplay / Rooming Behavior

### Quick Play
- Automatically finds an available public room
- Joins existing room or creates new one if none available
- Starts immediately when second player joins

### Create Room
- Generates a unique 6-character alphanumeric room code
- Can be set as private (not listed in public rooms)
- Share the code with friends to join

### Join by Code
- Enter a 6-character room code to join specific room
- Validates room exists and has available slots
- Joins as spectator if game is already in progress

### Room Discovery
- Lists public rooms waiting for players
- Shows room code, player count, and creation time
- One-click join for open rooms

### X/O Assignment and Turn Handling
- First player to join becomes X (goes first)
- Second player becomes O
- Turns alternate after each valid move
- Server validates turn order and move legality

### Win/Draw/Disconnect Outcomes
- **Win**: Three in a row (horizontal, vertical, or diagonal)
- **Draw**: All cells filled with no winner
- **Disconnect Forfeit**: Player fails to reconnect within 30-second grace period

## Reconnect/Disconnect Behavior

The game implements a practical reconnect system:

1. **Grace Period**: 30 seconds to reconnect after disconnection
2. **State Preservation**: Game state is preserved during grace period
3. **Visual Feedback**: Opponent sees reconnect countdown
4. **Automatic Forfeit**: If grace period expires, disconnected player forfeits
5. **Resume on Reconnect**: If player reconnects in time, game continues from saved state

This balances gameplay integrity with real-world network reliability.

## How to Test Multiplayer Locally

### Two-Browser / Two-Device Flow

1. **Start the application** following the Local Setup instructions above.

2. **Player 1 (Browser/Device 1)**:
   - Enter a nickname
   - Choose "Create Room" or "Quick Play"
   - If creating room, note the room code

3. **Player 2 (Browser/Device 2)**:
   - Enter a different nickname
   - Choose "Join by Code" (enter room code from Player 1) or "Quick Play"
   - Alternatively, use "Room Discovery" to find and join Player 1's room

4. **Test gameplay**:
   - Take turns making moves
   - Verify move validation (can't play on occupied cells, must wait your turn)
   - Test win conditions (get three in a row)
   - Test draw condition (fill board with no winner)

5. **Test disconnect/reconnect**:
   - Player 1: Close browser tab or disconnect network
   - Player 2: Should see "Opponent reconnecting..." with 30-second countdown
   - Player 1: Reopen application within 30 seconds
   - Verify game resumes from saved state

### Quick Play Flow Test
1. Both players choose "Quick Play"
2. System should match them into the same room
3. Game starts automatically when both are present

### Room Discovery Flow Test
1. Player 1 creates a public room
2. Player 2 uses "Room Discovery" to find and join the room
3. Game starts when Player 2 joins

## Deployment Process

### Deployment Split

This application requires two deployment targets:

1. **Frontend**: Static web host (Vercel, Netlify, GitHub Pages, S3 + CloudFront, etc.)
2. **Nakama Server**: Cloud host with PostgreSQL (AWS, GCP, Azure, DigitalOcean, etc.)

### Configuration Steps

1. **Deploy Nakama Server**:
   - Set up PostgreSQL database
   - Deploy Nakama with the TypeScript runtime module
   - Configure SSL certificates
   - Set secure server key (not `defaultkey`)

2. **Build and Deploy Frontend**:
   ```bash
   cd web
   npm run build
   ```
   - Upload the `dist/` folder to your static host
   - Configure environment variables for production

3. **Update Environment Variables**:
   - Set `VITE_NAKAMA_HOST` to your deployed Nakama server hostname
   - Set `VITE_NAKAMA_USE_SSL` to `true`
   - Use your production server key
   - Rebuild frontend with updated environment

### Local vs Deployed Environment Differences

| Environment | Nakama Host | SSL | Server Key | Purpose |
|-------------|-------------|-----|------------|---------|
| Local | `localhost` | `false` | `defaultkey` | Development |
| Production | Your domain | `true` | Secure key | Live gameplay |

## Submission-Time Values to Provide

**Before submission, fill in these values:**

- **Public Frontend URL**: `[TO BE PROVIDED BEFORE SUBMISSION]`
- **Deployed Nakama Endpoint**: `[TO BE PROVIDED BEFORE SUBMISSION]`

**Environment notes for reviewers**:
- Local development uses the values in `.env.example`
- Production deployment would use secure, non-default values
- The application has not been deployed to production in this workflow

## Implemented Scope vs Later Optional Scope

### Implemented in Beta 1 / Gamma 3

✅ **Core Gameplay**
- Server-authoritative Tic-Tac-Toe logic
- Real-time multiplayer with WebSockets
- Complete win/draw detection
- Turn validation and enforcement

✅ **Room System**
- Quick play matchmaking
- Room creation with unique codes
- Join by room code
- Public room discovery
- Private/public room options

✅ **Player Management**
- Nickname-based identity
- Device persistence
- Session management
- Automatic reconnection

✅ **Reconnect Handling**
- 30-second grace period
- State preservation during disconnect
- Visual reconnect feedback
- Automatic forfeit on timeout

✅ **Frontend Experience**
- Clean, responsive UI
- Real-time state updates
- Action validation feedback
- Connection status indicators

### Not Yet Implemented (Future/Optional Scope)

❌ **Timed Mode** - No move time limits
❌ **Leaderboard** - No scoring or ranking system  
❌ **Rematch** - No automatic rematch after game ends
❌ **Requeue** - No automatic return to matchmaking
❌ **QR Join** - No QR code generation for room joining
❌ **Debug Overlay** - No developer debugging tools
❌ **Spectator Mode** - No dedicated spectator interface
❌ **Chat** - No in-game text chat

These are potential enhancements for future iterations but are not required for the core multiplayer assignment.

## Honest Verification Status

### Statically Verified ✅

- **TypeScript compilation**: All `.ts` and `.tsx` files compile without errors
- **Frontend build**: `npm run build` succeeds with Vite
- **Code structure**: Repository follows consistent patterns and type safety
- **Environment configuration**: `.env.example` provides complete template

### Not Runtime-Verified in This Workflow

- **Live multiplayer testing**: Gameplay has not been tested with actual players in this workflow
- **Production deployment**: Application has not been deployed to a public URL
- **Cross-browser compatibility**: Not tested across different browsers/devices
- **Load testing**: Not tested with multiple concurrent games

**Important**: This implementation is code-complete and ready for deployment, but runtime multiplayer validation would be the next step before production use.

## Development Scripts

- `scripts/dev.sh` - Helper script for local development workflow
- `scripts/deploy.sh` - Deployment guidance and helper (not a full automation script)

## License

MIT# ticU
# ticU
# ticU
