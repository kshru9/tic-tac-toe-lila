#!/bin/bash
set -e

echo "=== Starting Nakama for Railway ==="
echo ""

# Debug: Show relevant environment variables
echo "Relevant environment variables:"
env | grep -E "(DATABASE|POSTGRES|PG|NAKAMA)" | sort || echo "No relevant env vars found"

echo ""
echo "--- Building Database Connection String ---"

# Check for Railway Postgres service variables
# Railway provides these when Postgres service is connected
if [ -n "$PGHOST" ] && [ -n "$PGPORT" ] && [ -n "$PGUSER" ] && [ -n "$PGPASSWORD" ] && [ -n "$PGDATABASE" ]; then
    echo "✅ Found Railway Postgres service variables"
    DATABASE_ADDRESS="postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}?sslmode=disable"
    echo "Built from PG* variables: $DATABASE_ADDRESS"
    
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
    echo "Railway configuration required:"
    echo "1. Add Postgres service to your Railway project"
    echo "2. In Nakama service Variables tab, add reference variables:"
    echo "   - PGHOST=\${{Postgres.PGHOST}}"
    echo "   - PGPORT=\${{Postgres.PGPORT}}"
    echo "   - PGUSER=\${{Postgres.PGUSER}}"
    echo "   - PGPASSWORD=\${{Postgres.PGPASSWORD}}"
    echo "   - PGDATABASE=\${{Postgres.PGDATABASE}}"
    echo "3. Or set DATABASE_URL directly"
    exit 1
fi

echo ""
echo "Final database address: ${DATABASE_ADDRESS}"
echo "NAKAMA_RUNTIME_PATH: ${NAKAMA_RUNTIME_PATH:-/nakama/data/modules}"
echo "NAKAMA_SERVER_KEY: ${NAKAMA_SERVER_KEY:-defaultkey}"
echo ""

# Run migrations first (important for Nakama)
echo "Running database migrations..."
/nakama/nakama migrate up --database.address "${DATABASE_ADDRESS}"

# Start Nakama
echo "Starting Nakama server..."
exec /nakama/nakama \
  --runtime.path "${NAKAMA_RUNTIME_PATH:-/nakama/data/modules}" \
  --database.address "${DATABASE_ADDRESS}" \
  --name "nakama" \
  --socket.server_key "${NAKAMA_SERVER_KEY:-defaultkey}" \
  --logger.level "debug" \
  --database.conn_max_lifetime_ms "60000" \
  --database.max_open_conns "50" \
  --database.max_idle_conns "10"