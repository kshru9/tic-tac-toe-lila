# EXACT DEPLOYMENT STEPS (FIXED VERSION)

## ISSUES FIXED:
1. **Dockerfile**: Now installs ALL dependencies (including TypeScript dev dependencies)
2. **GitHub Pages Workflow**: Added `enablement: true` to auto-enable Pages

## STEP-BY-STEP DEPLOYMENT:

### PHASE 1: RAILWAY BACKEND

#### Step 1: Create Railway Project
1. Go to railway.app → New Project → Deploy from GitHub repo
2. Connect GitHub, select `tic-tac-toe` repository

#### Step 2: Add PostgreSQL
1. In project → "+ New" → PostgreSQL
2. Railway creates database automatically
3. **Password provided**: `gIvfgULhzuPvvAbVfsUMFinQCmmixRrB`

#### Step 3: Add Nakama Service (CRITICAL)
1. "+ New" → GitHub Repo → Select `tic-tac-toe`
2. **BEFORE DEPLOYING**: Click settings (⚙️)
3. Set **Root Directory** to: `/nakama`
4. Click "Deploy"

#### Step 4: Configure Variables (CRITICAL - Fix Database Error)
Go to Nakama service → Variables tab:

1. **DELETE ALL existing variables**
2. Add reference variables from Postgres service (RECOMMENDED):

```
PGHOST = ${{Postgres.PGHOST}}
PGPORT = ${{Postgres.PGPORT}}
PGUSER = ${{Postgres.PGUSER}}
PGPASSWORD = ${{Postgres.PGPASSWORD}}
PGDATABASE = ${{Postgres.PGDATABASE}}
NAKAMA_RUNTIME_PATH = /nakama/data/modules
NAKAMA_SERVER_KEY = [GENERATE: openssl rand -base64 32]
```

**Important**: Replace `Postgres` with your actual Postgres service name in Railway

**Important**: Do NOT add `VITE_*` variables here (they go in GitHub Actions)

3. **Generate secure key**:
```bash
openssl rand -base64 32
# Example: aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789+abcd=
```

**Alternative**: If reference variables don't work, use DATABASE_URL directly:
```
DATABASE_URL = postgres://[USER]:[PASSWORD]@[HOST]:[PORT]/[DATABASE]?sslmode=disable
NAKAMA_RUNTIME_PATH = /nakama/data/modules
NAKAMA_SERVER_KEY = [GENERATE: openssl rand -base64 32]
```
Get the connection string from Postgres service → Connect → Private Network

#### Step 5: Get Public Domain
1. Nakama service → Settings → Networking
2. Note domain: `nakama-production.up.railway.app`

#### Step 6: Verify
1. **Check Railway logs** for:
   - "✅ Found Railway Postgres service variables" or "✅ Using DATABASE_URL variable"
   - "Running database migrations..." and migration success
   - "Starting Nakama server..."
   - No "Error pinging database" messages

2. **Test health endpoint**:
```bash
curl https://nakama-production.up.railway.app/health
# Should return: {"status":"healthy","service":"tic-tac-toe",...}
```

### PHASE 2: GITHUB PAGES FRONTEND

#### Step 1: Push Changes
```bash
git add .
git commit -m "Fix Dockerfile and GitHub Pages deployment"
git push origin main
```

#### Step 2: Set GitHub Actions Variables
1. GitHub repo → Settings → Secrets and variables → Actions
2. Variables tab → New repository variable
3. Add these variables (NOT in Railway):

```
VITE_NAKAMA_HOST = [YOUR_RAILWAY_DOMAIN].up.railway.app
VITE_NAKAMA_USE_SSL = true
VITE_NAKAMA_SERVER_KEY = [SAME_SECURE_KEY_AS_RAILWAY]
VITE_BASE_PATH = tic-tac-toe
VITE_APP_TITLE = LILA Tic-Tac-Toe
VITE_NAKAMA_PORT = 7350
VITE_NAKAMA_WEBSOCKET_PORT = 7350
```

#### Step 3: Monitor Deployment
1. GitHub repo → Actions tab
2. "Deploy to GitHub Pages" workflow runs automatically
3. **Workflow will auto-enable GitHub Pages**

#### Step 4: Get Frontend URL
1. After workflow completes: Settings → Pages
2. URL: `https://[username].github.io/tic-tac-toe/`

### PHASE 3: CONNECT FRONTEND TO BACKEND

#### Step 1: Update CORS in Railway
1. Railway → Nakama service → Variables
2. Update `NAKAMA_CORS_ORIGIN`:
   ```
   NAKAMA_CORS_ORIGIN = https://[username].github.io
   ```

#### Step 2: Test Complete System
1. Open: `https://[username].github.io/tic-tac-toe/`
2. Verify: Page loads, shows "connected"
3. Test: Create room, join with second browser, play game

## TROUBLESHOOTING:

### If Docker build fails:
- Error was: `sh: 1: tsc: not found`
- **Fixed**: Dockerfile now installs ALL dependencies (not just production)

### If GitHub Pages fails:
- Error was: `Get Pages site failed`
- **Fixed**: Workflow now has `enablement: true`

### If Railway shows "Railpack error":
- Delete service, recreate with Root Directory = `/nakama`
- Ensure `railway.json` exists in repo root

## VERIFICATION:
✅ Docker builds TypeScript runtime successfully
✅ GitHub Pages auto-enables and deploys
✅ Frontend connects to Railway backend
✅ Full multiplayer gameplay works