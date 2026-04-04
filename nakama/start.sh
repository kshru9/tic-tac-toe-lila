#!/bin/bash
set -e

# Start Nakama with runtime module and database configuration
# Database URL should be set as environment variable DATABASE_URL
# Convert postgresql:// to postgres:// if needed (Nakama uses postgres://)
DATABASE_ADDRESS="${DATABASE_URL/postgresql:/postgres:}"

echo "Starting Nakama with database: ${DATABASE_ADDRESS}"

exec /nakama/nakama \
  --runtime.path /nakama/data/modules \
  --database.address "${DATABASE_ADDRESS}" \
  --name "nakama" \
  --socket.server_key "${NAKAMA_SERVER_KEY:-defaultkey}" \
  --logger.level "info"