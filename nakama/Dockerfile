FROM heroiclabs/nakama:3.20.0

# Install Node.js and npm for building TypeScript runtime
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Create directory for runtime modules
RUN mkdir -p /nakama/data/modules

# Copy package files
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including dev dependencies for TypeScript)
RUN npm ci

# Copy source files
COPY src/ ./src/

# Build TypeScript runtime
RUN npm run build

# Copy built module to Nakama runtime path
RUN cp build/index.js /nakama/data/modules/

# Copy and make startup script executable
COPY start-railway.sh /nakama/
RUN chmod +x /nakama/start-railway.sh

# Set working directory back to Nakama default
WORKDIR /nakama

# Runtime configuration
ENV NAKAMA_RUNTIME_PATH=/nakama/data/modules
EXPOSE 7350 7351