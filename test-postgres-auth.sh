#!/bin/bash
echo "=== Testing PostgreSQL Authentication ==="
echo ""

# Test 1: Try with password
echo "1. Testing with password authentication..."
PGPASSWORD="gIvfgULhzuPvvAbVfsUMFinQCmmixRrB" \
psql -h "postgres.railway.internal" -p 5432 -U postgres -d railway -c "SELECT 1;" 2>&1

echo ""
echo "2. Testing connection without database (to postgres default)..."
PGPASSWORD="gIvfgULhzuPvvAbVfsUMFinQCmmixRrB" \
psql -h "postgres.railway.internal" -p 5432 -U postgres -d postgres -c "SELECT 1;" 2>&1

echo ""
echo "3. Possible authentication issues:"
echo "   a. Wrong password"
echo "   b. User 'postgres' doesn't have access"
echo "   c. Database 'railway' doesn't exist"
echo "   d. Network connectivity issue"
echo ""
echo "4. Railway-specific fixes:"
echo "   a. Check PostgreSQL service 'Variables' for correct credentials"
echo "   b. Use Railway CLI: railway connect postgres"
echo "   c. Check if services are in same project/network"
echo ""
echo "5. Quick test from Railway CLI:"
echo "   railway connect postgres"
echo "   Then run: SELECT 1;"