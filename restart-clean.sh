#!/bin/bash

echo "=== Cleaning up old processes and cache ==="

# Kill all node and proxy processes
echo "Killing all Node.js processes..."
pkill -9 node 2>/dev/null
pkill -9 local-ssl-proxy 2>/dev/null

# Wait for processes to die
sleep 2

# Remove Next.js cache
echo "Removing .next cache..."
rm -rf .next

# Remove node_modules cache
echo "Removing node_modules cache..."
rm -rf node_modules/.cache

echo ""
echo "=== Starting fresh servers ==="
echo ""
echo "Starting npm dev server..."
npm run dev &
NPM_PID=$!

echo "Waiting 10 seconds for npm to start..."
sleep 10

echo "Starting SSL proxy..."
local-ssl-proxy --source 3001 --target 3000 --cert .cert/cert.pem --key .cert/key.pem --hostname 0.0.0.0 &
PROXY_PID=$!

echo ""
echo "=== Servers started ==="
echo "NPM dev server PID: $NPM_PID"
echo "SSL proxy PID: $PROXY_PID"
echo ""
echo "Access the app at: https://192.168.1.8:3001"
echo ""
echo "Press Ctrl+C to stop all servers"

# Wait for user to kill
trap "kill $NPM_PID $PROXY_PID 2>/dev/null; exit" INT TERM

wait
