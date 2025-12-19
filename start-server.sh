#!/bin/bash
# Start Heat Server Emulator

cd "$(dirname "$0")"
echo "🔥 Starting Heat Server Emulator..."
echo ""
npx tsx src/server.ts
