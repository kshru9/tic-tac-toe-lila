#!/bin/bash
echo "=== Railway PostgreSQL Connection Test ==="
echo ""

echo "1. Checking for Railway Postgres service variables..."
if [ -n "$PGHOST" ] && [ -n "$PGPORT" ] && [ -n "$PGUSER" ] && [ -n "$PGPASSWORD" ] && [ -n "$PGDATABASE" ]; then
    echo "✅ Found Railway Postgres service variables"
    echo "   Host: $PGHOST"
    echo "   Port: $PGPORT"
    echo "   User: $PGUSER"
    echo "   Database: $PGDATABASE"
    
    HOST="$PGHOST"
    PORT="$PGPORT"
    USER="$PGUSER"
    PASSWORD="$PGPASSWORD"
    DATABASE="$PGDATABASE"
    
elif [ -n "$DATABASE_URL" ]; then
    echo "✅ Found DATABASE_URL"
    echo "   URL: $DATABASE_URL"
    
    # Parse DATABASE_URL
    if [[ "$DATABASE_URL" =~ postgres://([^:]+):([^@]+)@([^:]+):([^/]+)/([^?]+) ]]; then
        USER="${BASH_REMATCH[1]}"
        PASSWORD="${BASH_REMATCH[2]}"
        HOST="${BASH_REMATCH[3]}"
        PORT="${BASH_REMATCH[4]}"
        DATABASE="${BASH_REMATCH[5]}"
        
        echo "   Parsed:"
        echo "   User: $USER"
        echo "   Host: $HOST"
        echo "   Port: $PORT"
        echo "   Database: $DATABASE"
    else
        echo "❌ Could not parse DATABASE_URL"
        exit 1
    fi
else
    echo "❌ No database connection variables found!"
    echo ""
    echo "Setup instructions:"
    echo "1. In Railway, add Postgres service"
    echo "2. In Nakama service Variables tab, add:"
    echo "   PGHOST=\${{Postgres.PGHOST}}"
    echo "   PGPORT=\${{Postgres.PGPORT}}"
    echo "   PGUSER=\${{Postgres.PGUSER}}"
    echo "   PGPASSWORD=\${{Postgres.PGPASSWORD}}"
    echo "   PGDATABASE=\${{Postgres.PGDATABASE}}"
    echo "3. Or set DATABASE_URL directly"
    exit 1
fi

echo ""
echo "2. Testing connection..."

# Test with psql if available
if command -v psql &> /dev/null; then
    echo "Testing with psql..."
    if PGPASSWORD="$PASSWORD" psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DATABASE" -c "SELECT 1 as connection_test, version() as postgres_version;" 2>&1; then
        echo ""
        echo "✅ Database connection successful!"
    else
        echo "❌ Database connection failed"
        echo ""
        echo "Troubleshooting:"
        echo "1. Check if PostgreSQL service is running in Railway"
        echo "2. Verify variables are correctly referenced"
        echo "3. Check Railway logs for Postgres service"
        echo "4. Try from Railway CLI: railway connect postgres"
    fi
else
    echo "⚠ psql not installed. Install with:"
    echo "  macOS: brew install postgresql"
    echo "  Ubuntu/Debian: sudo apt-get install postgresql-client"
    echo ""
    echo "Or test from Railway dashboard:"
    echo "1. Go to PostgreSQL service"
    echo "2. Click 'Connect' tab"
    echo "3. Use 'Private Network' connection"
fi

echo ""
echo "3. Nakama database address format:"
echo "postgres://${USER}:${PASSWORD}@${HOST}:${PORT}/${DATABASE}?sslmode=disable"