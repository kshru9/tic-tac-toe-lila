#!/bin/bash
set -e

echo "=== Starting Nakama (Simple) ==="

# Debug: Show environment
echo "Environment:"
env | grep -E "(DATABASE|NAKAMA)" || echo "No env vars found"

# Use provided DATABASE_URL or default
DB="${DATABASE_URL:-postgres://postgres:password@localhost:5432/nakama}"

echo "Database: $DB"
echo "Runtime path: ${NAKAMA_RUNTIME_PATH:-/nakama/data/modules}"
echo "Server key: ${NAKAMA_SERVER_KEY:-defaultkey}"

# Start Nakama with minimal options
exec /nakama/nakama \
  --runtime.path "${NAKAMA_RUNTIME_PATH:-/nakama/data/modules}" \
  --database.address "$DB" \
  --socket.server_key "${NAKAMA_SERVER_KEY:-defaultkey}"