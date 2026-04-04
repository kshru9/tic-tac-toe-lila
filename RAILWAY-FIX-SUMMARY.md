# Railway Deployment Fix Summary

## Problem Identified
The Nakama service was failing with "Error pinging database" because:
1. The startup script was using hardcoded database connection strings
2. It wasn't properly using Railway's Postgres service reference variables
3. The database address format wasn't correctly constructed for Nakama

## Changes Made

### 1. Fixed `nakama/start-railway.sh`
- Now properly reads Railway Postgres service variables (`PGHOST`, `PGPORT`, etc.)
- Builds correct database address format: `postgres://user:password@host:port/database?sslmode=disable`
- Runs database migrations before starting Nakama server
- Provides clear error messages if variables are missing

### 2. Updated `nakama/Dockerfile`
- Added `start-railway.sh` to the container
- Made the script executable with `chmod +x`

### 3. Updated `DEPLOYMENT-STEPS.md`
- Changed variable configuration to use Railway reference variables
- Added troubleshooting steps for database connection
- Provided alternative configuration using `DATABASE_URL`

### 4. Updated test scripts
- `test-railway-db.sh`: Now checks for Railway Postgres variables
- `test-nakama-start.sh`: New script to test startup configuration
- `debug-railway.sh`: Updated with new variable requirements

## How to Deploy on Railway

### Step 1: Update Railway Variables
In your Nakama service on Railway:

1. Go to **Variables** tab
2. Delete all existing variables
3. Add these reference variables:

```
PGHOST = ${{Postgres.PGHOST}}
PGPORT = ${{Postgres.PGPORT}}
PGUSER = ${{Postgres.PGUSER}}
PGPASSWORD = ${{Postgres.PGPASSWORD}}
PGDATABASE = ${{Postgres.PGDATABASE}}
NAKAMA_RUNTIME_PATH = /nakama/data/modules
NAKAMA_SERVER_KEY = [generate with: openssl rand -base64 32]
```

**Important**: Replace `Postgres` with your actual Postgres service name in Railway.

### Step 2: Redeploy Nakama Service
1. Trigger a redeploy of the Nakama service
2. Check the logs for these success messages:
   - "✅ Found Railway Postgres service variables"
   - "Running database migrations..."
   - "Starting Nakama server..."
3. Ensure there are no "Error pinging database" messages

### Step 3: Verify Deployment
1. Test the health endpoint:
   ```bash
   curl https://[your-nakama-domain].up.railway.app/health
   ```
2. Should return: `{"status":"healthy","service":"tic-tac-toe",...}`

## Testing Locally
You can test the configuration locally:

```bash
# Test database connection logic
./test-railway-db.sh

# Test Nakama startup configuration
./test-nakama-start.sh

# Run full debug check
./debug-railway.sh
```

## Common Issues & Solutions

### Issue: "No database connection variables found"
**Solution**: Ensure Postgres service is added to your Railway project and reference variables are correctly set.

### Issue: Reference variables not working
**Solution**: Use `DATABASE_URL` directly instead:
```
DATABASE_URL = postgres://[USER]:[PASSWORD]@[HOST]:[PORT]/[DATABASE]?sslmode=disable
```
Get the connection string from Postgres service → Connect → Private Network.

### Issue: "Error pinging database" persists
**Solution**: Check Railway logs for exact error. Common causes:
- Wrong Postgres service name in reference variables
- Network connectivity issues between services
- Database permissions issues

## Key Improvements
1. **Proper Railway integration**: Uses Railway's native service variable referencing
2. **Clear error messages**: Script explains exactly what's missing
3. **Migration support**: Runs `nakama migrate up` before starting server
4. **Flexible configuration**: Supports both reference variables and direct `DATABASE_URL`

The fix addresses the root cause: Nakama wasn't getting the correct database connection information from Railway's Postgres service.