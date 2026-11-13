FROM node:20-slim

# Install Python and dependencies build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json and requirements.txt
COPY package*.json ./
COPY requirements.txt ./

# Install Node and Python packages
RUN npm install --omit=dev
RUN pip3 install --no-cache-dir --break-system-packages -U -r requirements.txt

# Copy all project files
COPY . .
RUN chmod +x start.sh

# Run via sh explicitly to avoid any permission/exec format issues
ENTRYPOINT ["/bin/sh"]
CMD ["start.sh"]
