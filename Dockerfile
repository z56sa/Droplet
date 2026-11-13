FROM node:20-slim

# Install Python and build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY requirements.txt ./

# Install dependencies
RUN npm install --omit=dev
RUN pip3 install --no-cache-dir --break-system-packages -U -r requirements.txt

# Copy all project files
COPY . .

# Run dashboard directly
CMD ["node", "src/index.js"]
