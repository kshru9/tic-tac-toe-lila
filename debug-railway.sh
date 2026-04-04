#!/bin/bash
echo "=== Railway Deployment Debug ==="
echo ""

echo "1. Testing database connection..."
DB_URL="postgres://postgres:gIvfgULhzuPvvAbVfsUMFinQCmmixRrB@postgres.railway.internal:5432/railway?sslmode=disable"
echo "URL: $DB_URL"
echo ""

echo "2. Checking Dockerfile..."
if [ -f "nakama/Dockerfile" ]; then
    echo "✅ Dockerfile exists"
    echo "Last few lines:"
    tail -10 nakama/Dockerfile
else
    echo "❌ Dockerfile missing"
fi
echo ""

echo "3. Checking start script..."
if [ -f "nakama/start.sh" ]; then
    echo "✅ start.sh exists"
    echo "Contents:"
    cat nakama/start.sh
else
    echo "❌ start.sh missing"
fi
echo ""

echo "4. Checking runtime module build..."
if [ -f "nakama/build/index.js" ]; then
    echo "✅ Runtime module built"
    echo "Size: $(wc -l < nakama/build/index.js) lines"
else
    echo "❌ Runtime module not built"
    echo "Run: cd nakama && npm run build"
fi
echo ""

echo "5. Required Railway variables (RECOMMENDED):"
cat << EOF
PGHOST = \${{Postgres.PGHOST}}
PGPORT = \${{Postgres.PGPORT}}
PGUSER = \${{Postgres.PGUSER}}
PGPASSWORD = \${{Postgres.PGPASSWORD}}
PGDATABASE = \${{Postgres.PGDATABASE}}
NAKAMA_RUNTIME_PATH = /nakama/data/modules
NAKAMA_SERVER_KEY = [generate with: openssl rand -base64 32]
EOF
echo ""

echo "Alternative (if reference variables don't work):"
cat << EOF
DATABASE_URL = postgres://[USER]:[PASSWORD]@[HOST]:[PORT]/[DATABASE]?sslmode=disable
NAKAMA_RUNTIME_PATH = /nakama/data/modules
NAKAMA_SERVER_KEY = [generate with: openssl rand -base64 32]
EOF
echo ""

echo "6. Steps to fix:"
echo "   a. Update Railway variables (use reference variables)"
echo "   b. Redeploy service"
echo "   c. Check logs for '✅ Found Railway Postgres service variables'"
echo "   d. Check logs for 'Running database migrations...'"
echo "   e. Test: curl https://[your-domain].up.railway.app/health"
echo ""

echo "7. Common issues:"
echo "   - Missing Postgres service reference variables"
echo "   - Wrong Postgres service name in reference"
echo "   - Runtime module not built in Docker"
echo "   - start-railway.sh not executable"