#!/bin/bash
echo "=== Testing Railway Database Connection Options ==="
echo ""

# Try different database names
PASSWORD="gIvfgULhzuPvvAbVfsUMFinQCmmixRrB"
HOST="postgres.railway.internal"
PORT="5432"
USER="postgres"

echo "Testing connection to host: $HOST"
echo ""

# Test 1: Try 'railway' database
echo "1. Testing database 'railway':"
if PGPASSWORD="$PASSWORD" psql -h "$HOST" -p "$PORT" -U "$USER" -d "railway" -c "SELECT 1;" 2>&1 | grep -q "1"; then
    echo "✅ Connected to 'railway' database"
else
    echo "❌ Failed to connect to 'railway' database"
    ERROR=$(PGPASSWORD="$PASSWORD" psql -h "$HOST" -p "$PORT" -U "$USER" -d "railway" -c "SELECT 1;" 2>&1)
    echo "Error: $ERROR"
fi

echo ""

# Test 2: Try 'postgres' database (default)
echo "2. Testing database 'postgres':"
if PGPASSWORD="$PASSWORD" psql -h "$HOST" -p "$PORT" -U "$USER" -d "postgres" -c "SELECT 1;" 2>&1 | grep -q "1"; then
    echo "✅ Connected to 'postgres' database"
    echo "Database 'railway' might not exist. Creating it..."
    PGPASSWORD="$PASSWORD" psql -h "$HOST" -p "$PORT" -U "$USER" -d "postgres" -c "CREATE DATABASE railway;" 2>&1
else
    echo "❌ Failed to connect to 'postgres' database"
fi

echo ""

# Test 3: List all databases
echo "3. Listing all databases:"
PGPASSWORD="$PASSWORD" psql -h "$HOST" -p "$PORT" -U "$USER" -d "postgres" -c "\l" 2>&1 || echo "Cannot list databases"

echo ""
echo "4. Solution options:"
echo "   a. Use 'postgres' database instead of 'railway'"
echo "   b. Create 'railway' database if it doesn't exist"
echo "   c. Check PostgreSQL service is running in Railway"
echo ""
echo "5. Try this DATABASE_URL instead:"
echo "   postgres://postgres:gIvfgULhzuPvvAbVfsUMFinQCmmixRrB@postgres.railway.internal:5432/postgres?sslmode=disable"