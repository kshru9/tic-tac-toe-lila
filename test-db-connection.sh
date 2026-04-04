#!/bin/bash
# Test database connection for Railway deployment

echo "Testing database connection..."
echo ""

# Test with postgres:// protocol (Nakama format)
DB_URL="postgres://postgres:gIvfgULhzuPvvAbVfsUMFinQCmmixRrB@postgres.railway.internal:5432/railway"

echo "Database URL: ${DB_URL}"
echo ""

# Check if we can parse the URL
echo "Parsing URL components:"
PROTOCOL=$(echo $DB_URL | cut -d':' -f1)
HOST=$(echo $DB_URL | cut -d'@' -f2 | cut -d':' -f1)
PORT=$(echo $DB_URL | cut -d':' -f4 | cut -d'/' -f1)
DATABASE=$(echo $DB_URL | cut -d'/' -f4)

echo "Protocol: $PROTOCOL"
echo "Host: $HOST"
echo "Port: $PORT"
echo "Database: $DATABASE"
echo ""

# Test connection (if psql is available)
if command -v psql &> /dev/null; then
    echo "Testing with psql..."
    if PGPASSWORD="gIvfgULhzuPvvAbVfsUMFinQCmmixRrB" psql -h "$HOST" -p "$PORT" -U postgres -d "$DATABASE" -c "SELECT 1;" 2>/dev/null; then
        echo "✅ Database connection successful!"
    else
        echo "❌ Database connection failed"
        echo "Check:"
        echo "1. PostgreSQL service is running in Railway"
        echo "2. Password is correct: gIvfgULhzuPvvAbVfsUMFinQCmmixRrB"
        echo "3. Network connectivity to Railway"
    fi
else
    echo "⚠ psql not available, skipping direct connection test"
    echo "Install with: brew install postgresql (macOS) or apt-get install postgresql-client (Linux)"
fi

echo ""
echo "For Railway Nakama service, use these variables:"
echo "DATABASE_URL = ${DB_URL}"
echo "NAKAMA_RUNTIME_PATH = /nakama/data/modules"
echo "NAKAMA_SERVER_KEY = [generate with: openssl rand -base64 32]"