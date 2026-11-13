#!/bin/sh
set -e

# Run bot.py in background
python3 bot.py &

# Run Node.js dashboard in foreground
exec node src/index.js
