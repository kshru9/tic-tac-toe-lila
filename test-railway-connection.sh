#!/bin/bash
echo "=== Testing Railway PostgreSQL Connection ==="
echo ""

# Test 1: Direct connection test
echo "1. Testing direct PostgreSQL connection..."
PGPASSWORD="gIvfgULhzuPvvAbVfsUMFinQCmmixRrB" \
psql -h "postgres.railway.internal" -p 5432 -U postgres -d railway -c "SELECT 1 as test;" 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Direct database connection successful"
else
    echo "❌ Direct database connection failed"
    echo ""
    echo "Possible issues:"
    echo "1. PostgreSQL service not running"
    echo "2. Wrong password"
    echo "3. Network connectivity issue"
    echo "4. Database 'railway' doesn't exist"
fi

echo ""
echo "2. Testing from Railway CLI..."
echo "Run: railway connect postgres"
echo "This will give you a direct PostgreSQL shell"
echo ""

echo "3. Current DATABASE_URL should be:"
echo "postgres://postgres:gIvfgULhzuPvvAbVfsUMFinQCmmixRrB@postgres.railway.internal:5432/railway?sslmode=disable"
echo ""

echo "4. Quick fix steps:"
echo "   a. Go to Railway dashboard → Service → Variables"
echo "   b. Set DATABASE_URL to above value"
echo "   c. Redeploy"
echo "   d. Check logs for 'Database connections' (should not show error)"