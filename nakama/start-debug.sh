#!/bin/bash
set -e

echo "=== DEBUG MODE ==="
echo "Environment variables:"
env | grep -E "(DATABASE|NAKAMA)" || echo "No DATABASE/NAKAMA env vars found"

# Test database connection first
if [ -n "$DATABASE_URL" ]; then
    echo "Testing database connection..."
    # Convert to postgres:// format
    DB_TEST="${DATABASE_URL/postgresql:/postgres:}?sslmode=disable"
    echo "Using: $DB_TEST"
else
    echo "ERROR: DATABASE_URL not set!"
    exit 1
fi

echo "Starting Nakama with debug logging..."

# Start Nakama with maximum logging
exec /nakama/nakama \
  --runtime.path /nakama/data/modules \
  --database.address "$DB_TEST" \
  --name "nakama" \
  --socket.server_key "${NAKAMA_SERVER_KEY:-defaultkey}" \
  --logger.level "debug" \
  --log.verbose