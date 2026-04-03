FROM heroiclabs/nakama:3.20.0

# Install Node.js for TypeScript runtime compilation
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Build TypeScript runtime module
RUN npm run build

# Copy built module to Nakama runtime path
RUN mkdir -p /nakama/data/modules && \
    cp -r build/* /nakama/data/modules/