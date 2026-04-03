#!/bin/bash

# LILA Tic-Tac-Toe - Local Development Helper
# Gamma 1 Foundation

set -e

echo "========================================="
echo "LILA Tic-Tac-Toe - Local Development"
echo "========================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check for .env file
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✅ Created .env file from .env.example"
        echo "   Please review the .env file and update values if needed."
    else
        echo "❌ .env.example not found. Please create a .env file manually."
        exit 1
    fi
fi

echo ""
echo "📦 Starting local infrastructure with Docker Compose..."
echo "   This will start:"
echo "   - PostgreSQL database"
echo "   - Nakama server with TypeScript runtime"
echo ""
echo "   Press Ctrl+C to stop all services."
echo ""

# Start infrastructure
docker-compose up

echo ""
echo "========================================="
echo "Next steps:"
echo "========================================="
echo ""
echo "1. Open a new terminal window"
echo "2. Start the frontend development server:"
echo "   cd web && npm install && npm run dev"
echo ""
echo "3. Open your browser to: http://localhost:3000"
echo ""
echo "4. For backend development (Nakama runtime):"
echo "   cd nakama && npm install"
echo "   npm run dev  # Watch for TypeScript changes"
echo ""
echo "Note: Gamma 1 establishes the foundation only."
echo "      Matchmaking and room logic will be added in Gamma 2."
echo ""