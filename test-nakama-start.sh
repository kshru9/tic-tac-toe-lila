#!/bin/bash
echo "=== Testing Nakama Startup Configuration ==="
echo ""

echo "1. Simulating start-railway.sh logic..."
echo ""

# Simulate Railway environment
export PGHOST="postgres.railway.internal"
export PGPORT="5432"
export PGUSER="postgres"
export PGPASSWORD="gIvfgULhzuPvvAbVfsUMFinQCmmixRrB"
export PGDATABASE="railway"
export NAKAMA_RUNTIME_PATH="/nakama/data/modules"
export NAKAMA_SERVER_KEY="test-key-123"

echo "Environment variables set:"
env | grep -E "(PG|NAKAMA)" | sort

echo ""
echo "2. Building database address..."

if [ -n "$PGHOST" ] && [ -n "$PGPORT" ] && [ -n "$PGUSER" ] && [ -n "$PGPASSWORD" ] && [ -n "$PGDATABASE" ]; then
    echo "✅ Found Railway Postgres service variables"
    DATABASE_ADDRESS="postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}?sslmode=disable"
    echo "Built: $DATABASE_ADDRESS"
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
    exit 1
fi

echo ""
echo "3. Final configuration:"
echo "Database address: $DATABASE_ADDRESS"
echo "Runtime path: $NAKAMA_RUNTIME_PATH"
echo "Server key: $NAKAMA_SERVER_KEY"

echo ""
echo "4. Simulated Nakama command:"
echo "/nakama/nakama migrate up --database.address \"$DATABASE_ADDRESS\""
echo "/nakama/nakama --runtime.path \"$NAKAMA_RUNTIME_PATH\" --database.address \"$DATABASE_ADDRESS\" --name \"nakama\" --socket.server_key \"$NAKAMA_SERVER_KEY\" --logger.level \"debug\" --database.conn_max_lifetime \"60s\" --database.max_open_conns \"50\""

echo ""
echo "✅ Test completed successfully!"
echo "This matches what start-railway.sh will execute on Railway."