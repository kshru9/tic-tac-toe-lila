#!/bin/bash
set -e

echo "=== Starting Nakama (Railway Fix) ==="
echo "Environment variables:"
env | grep -E "(DATABASE|NAKAMA)" || echo "No DATABASE/NAKAMA env vars found"

# Use provided DATABASE_URL or default to postgres database
if [ -z "$DATABASE_URL" ]; then
    echo "⚠ WARNING: DATABASE_URL not set, using default"
    DATABASE_ADDRESS="postgres://postgres:password@[private-host-redacted]:5432/postgres?sslmode=disable"
else
    DATABASE_ADDRESS="$DATABASE_URL"
    
    # Convert postgresql:// to postgres:// if needed
    if [[ "$DATABASE_ADDRESS" == postgresql://* ]]; then
        DATABASE_ADDRESS="${DATABASE_ADDRESS/postgresql:/postgres:}"
    fi
    
    # Ensure sslmode=disable
    if [[ "$DATABASE_ADDRESS" != *"?sslmode=disable"* ]]; then
        DATABASE_ADDRESS="${DATABASE_ADDRESS}?sslmode=disable"
    fi
fi

echo ""
echo "Using database: $DATABASE_ADDRESS"
echo ""

# Start Nakama - it will create database if needed
exec /nakama/nakama \
  --runtime.path "${NAKAMA_RUNTIME_PATH:-/nakama/data/modules}" \
  --database.address "${DATABASE_ADDRESS}" \
  --name "nakama" \
  --socket.server_key "${NAKAMA_SERVER_KEY:-defaultkey}" \
  --logger.level "info" \
  --database.conn_max_lifetime "60s" \
  --database.max_open_conns "50" \
  --database.migrate true  # This will create tables if database exists