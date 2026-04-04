#!/bin/bash
set -e

echo "=== Starting Nakama (Simple) ==="

# Debug: Show environment
echo "Environment:"
env | grep -E "(DATABASE|POSTGRES|PG|NAKAMA)" || echo "No env vars found"

# Check for database connection
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL not set!"
    echo "Set DATABASE_URL environment variable"
    exit 1
fi

DB="$DATABASE_URL"

echo "Database: $DB"
echo "Runtime path: ${NAKAMA_RUNTIME_PATH:-/nakama/data/modules}"
echo "Server key: ${NAKAMA_SERVER_KEY:-defaultkey}"

# Start Nakama with minimal options
exec /nakama/nakama \
  --runtime.path "${NAKAMA_RUNTIME_PATH:-/nakama/data/modules}" \
  --database.address "$DB" \
  --socket.server_key "${NAKAMA_SERVER_KEY:-defaultkey}"