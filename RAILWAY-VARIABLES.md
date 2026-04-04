# CORRECT RAILWAY VARIABLES CONFIGURATION

## NAKAMA SERVICE VARIABLES (Backend)

### Required Variables:
```
DATABASE_URL = postgres://postgres:gIvfgULhzuPvvAbVfsUMFinQCmmixRrB@postgres.railway.internal:5432/railway
NAKAMA_RUNTIME_PATH = /nakama/data/modules
NAKAMA_SERVER_KEY = [GENERATE_SECURE_KEY_HERE]
```

**Note**: Use `postgres://` not `postgresql://` (Nakama expects postgres://)

### Optional Variables (for CORS):
```
NAKAMA_CORS_ORIGIN = https://[username].github.io
```

### How to Get DATABASE_URL:
1. Go to PostgreSQL service in Railway
2. Click "Connect" tab
3. Use "Private Network" connection string
4. Format: `postgresql://postgres:PASSWORD@postgres.railway.internal:5432/railway`

### Generate Secure Server Key:
```bash
openssl rand -base64 32
# Example output: aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789+abcd=
```

## VARIABLES TO REMOVE FROM NAKAMA SERVICE:

❌ **Remove these from Nakama service** (they belong in GitHub Actions):

```
VITE_APP_TITLE
VITE_NAKAMA_HOST  
VITE_NAKAMA_PORT
VITE_NAKAMA_SERVER_KEY
VITE_NAKAMA_USE_SSL
VITE_NAKAMA_WEBSOCKET_PORT
```

## GITHUB ACTIONS VARIABLES (Frontend)

These belong in GitHub repository → Settings → Secrets and variables → Actions:

```
VITE_NAKAMA_HOST = [YOUR_RAILWAY_DOMAIN].up.railway.app
VITE_NAKAMA_USE_SSL = true
VITE_NAKAMA_SERVER_KEY = [SAME_AS_NAKAMA_SERVER_KEY]
VITE_BASE_PATH = tic-tac-toe
VITE_APP_TITLE = LILA Tic-Tac-Toe
VITE_NAKAMA_PORT = 7350
VITE_NAKAMA_WEBSOCKET_PORT = 7350
```

## STEP-BY-STEP FIX:

### 1. Delete Current Nakama Service Variables
1. Go to Railway → Nakama service → Variables
2. Delete ALL variables
3. Save

### 2. Add Correct Variables
Add ONLY these to Nakama service:
```
DATABASE_URL = postgresql://postgres:gIvfgULhzuPvvAbVfsUMFinQCmmixRrB@postgres.railway.internal:5432/railway
NAKAMA_RUNTIME_PATH = /nakama/data/modules
NAKAMA_SERVER_KEY = [GENERATE_NEW_SECURE_KEY]
```

### 3. Set GitHub Actions Variables
1. GitHub repo → Settings → Secrets and variables → Actions
2. Add the `VITE_*` variables listed above

### 4. Redeploy
1. Railway will automatically redeploy with new variables
2. Check logs for "Tic-Tac-Toe runtime module initializing"
3. Test: `curl https://[your-domain].up.railway.app/health`

## TROUBLESHOOTING:

### If still "Error pinging database":
1. Verify DATABASE_URL format is correct
2. Check PostgreSQL service is running
3. Try direct connection test:
   ```bash
   # From Railway CLI or terminal
   psql "postgresql://postgres:gIvfgULhzuPvvAbVfsUMFinQCmmixRrB@postgres.railway.internal:5432/railway"
   ```

### If "insecure default parameter" warnings:
These will go away when you:
1. Use a secure `NAKAMA_SERVER_KEY` (not "hello" or "defaultkey")
2. Nakama will still run, but fix for production