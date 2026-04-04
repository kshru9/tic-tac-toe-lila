#!/bin/bash
echo "=== Testing Corrected Nakama Flags ==="
echo ""

echo "1. Checking start-railway.sh for correct flags..."
echo ""

# Extract the exec command from start-railway.sh
echo "Last lines of start-railway.sh:"
tail -10 nakama/start-railway.sh

echo ""
echo "2. Expected flags (from Nakama help output):"
echo "   --database.conn_max_lifetime_ms (correct)"
echo "   --database.max_open_conns (correct)"
echo "   --database.max_idle_conns (correct)"
echo ""

echo "3. Checking for incorrect flags..."
if grep -q "database.conn_max_lifetime[^_]" nakama/start-railway.sh; then
    echo "❌ Found incorrect flag: database.conn_max_lifetime (missing _ms)"
else
    echo "✅ No incorrect database.conn_max_lifetime flag found"
fi

echo ""
echo "4. Testing script syntax..."
bash -n nakama/start-railway.sh && echo "✅ start-railway.sh has valid syntax"

echo ""
echo "5. Simulating corrected command..."
echo ""
echo "With DATABASE_URL set, the command would be:"
echo "/nakama/nakama \\"
echo "  --runtime.path \"/nakama/data/modules\" \\"
echo "  --database.address \"postgres://user:pass@host:port/db?sslmode=disable\" \\"
echo "  --name \"nakama\" \\"
echo "  --socket.server_key \"key\" \\"
echo "  --logger.level \"debug\" \\"
echo "  --database.conn_max_lifetime_ms \"60000\" \\"
echo "  --database.max_open_conns \"50\" \\"
echo "  --database.max_idle_conns \"10\""

echo ""
echo "✅ Test completed!"