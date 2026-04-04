# Nakama Flag Fix Summary

## Problem
After fixing the database connection issue, a new error appeared:
```
flag provided but not defined: -database.conn_max_lifetime
```

## Root Cause
Nakama uses different flag names than expected:
- **Incorrect**: `--database.conn_max_lifetime`
- **Correct**: `--database.conn_max_lifetime_ms` (with `_ms` suffix)

From the Nakama help output in the logs:
```
-database.conn_max_lifetime_ms int
    Time in milliseconds to reuse a database connection before the connection is killed and a new one is created. Default 3600000 (1 hour). (default 3600000)
```

## Files Fixed

### 1. `nakama/start-railway.sh`
**Changed:**
```bash
# Before:
--database.conn_max_lifetime "60s"

# After:
--database.conn_max_lifetime_ms "60000"
--database.max_idle_conns "10"
```

### 2. `nakama/start.sh`
**Changed:**
```bash
# Before:
--database.conn_max_lifetime "60s"

# After:
--database.conn_max_lifetime_ms "60000"
--database.max_idle_conns "10"
```

### 3. `nakama/start-simple.sh`
**Changed:**
- Removed hardcoded `[private-host-redacted]` default
- Now requires `DATABASE_URL` to be set

## What This Fixes

1. **Database connection parameters**: Now use correct flag names
2. **Connection pooling**: Properly configured with:
   - `conn_max_lifetime_ms`: 60 seconds (60000 ms)
   - `max_open_conns`: 50 connections
   - `max_idle_conns`: 10 connections

## Deployment Steps

1. **Commit and push changes:**
   ```bash
   git add .
   git commit -m "Fix Nakama flags: use conn_max_lifetime_ms not conn_max_lifetime"
   git push origin main
   ```

2. **Redeploy on Railway:**
   - Go to Nakama service → Deployments
   - Click "Clear build cache and redeploy"

3. **Verify in logs:**
   - ✅ "✅ Using DATABASE_URL variable"
   - ✅ "Successfully applied migration"
   - ✅ "Starting Nakama server..."
   - ❌ No "flag provided but not defined" errors

## Success Indicators

From your previous logs, we already saw:
- ✅ Database connection working
- ✅ Migrations successful
- ✅ No "Error pinging database" messages

After this fix, you should see:
- ✅ Nakama server starts successfully
- ✅ No flag parsing errors
- ✅ Health endpoint responds: `{"status":"healthy","service":"tic-tac-toe",...}`

## Test Command
Run the test to verify the fix:
```bash
./test-corrected-flags.sh
```