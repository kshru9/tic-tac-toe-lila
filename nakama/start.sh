#!/bin/bash
set -e

echo "=== Starting Nakama (Railway Compatible) ==="
echo "Environment variables:"
env | grep -E "(DATABASE|POSTGRES|PG|NAKAMA)" || echo "No relevant env vars found"

# Check for Railway Postgres service variables first
if [ -n "$PGHOST" ] && [ -n "$PGPORT" ] && [ -n "$PGUSER" ] && [ -n "$PGPASSWORD" ] && [ -n "$PGDATABASE" ]; then
    echo "✅ Found Railway Postgres service variables"
    DATABASE_ADDRESS="postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}?sslmode=disable"
    
elif [ -n "$DATABASE_URL" ]; then
    echo "✅ Using DATABASE_URL variable"
    DATABASE_ADDRESS="$DATABASE_URL"
    
    # Convert postgresql:// to postgres:// if needed
    if [[ "$DATABASE_ADDRESS" == postgresql://* ]]; then
        DATABASE_ADDRESS="${DATABASE_ADDRESS/postgresql:/postgres:}"
    fi
    
    # Ensure sslmode=disable
    if [[ "$DATABASE_ADDRESS" != *"?sslmode=disable"* ]]; then
        DATABASE_ADDRESS="${DATABASE_ADDRESS}?sslmode=disable"
    fi
    
else
    echo "❌ ERROR: No database connection variables found!"
    echo ""
    echo "For Railway deployment, set these variables:"
    echo "  PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE"
    echo "  or DATABASE_URL"
    echo ""
    echo "For local development with Docker Compose:"
    echo "  DATABASE_URL=postgres://postgres:password@postgres:5432/nakama?sslmode=disable"
    exit 1
fi

echo ""
echo "Using database: $DATABASE_ADDRESS"
echo ""

# Run migrations first
echo "Running database migrations..."
/nakama/nakama migrate up --database.address "${DATABASE_ADDRESS}"

# Start Nakama
exec /nakama/nakama \
  --runtime.path "${NAKAMA_RUNTIME_PATH:-/nakama/data/modules}" \
  --database.address "${DATABASE_ADDRESS}" \
  --name "nakama" \
  --socket.server_key "${NAKAMA_SERVER_KEY:-defaultkey}" \
  --logger.level "info" \
  --database.conn_max_lifetime_ms "60000" \
  --database.max_open_conns "50" \
  --database.max_idle_conns "10"