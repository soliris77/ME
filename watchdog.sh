#!/bin/bash
while true; do
  if ! curl -s -o /dev/null -m 3 http://localhost:8080/api/quotes; then
    echo "$(date): API morte, relance..."
    cd ~/workspace/artifacts/api-server
    setsid env PORT=8080 NODE_ENV=development nohup pnpm run dev > /tmp/api-server.log 2>&1 < /dev/null &
    disown -a
  fi
  if ! curl -s -o /dev/null -m 3 http://localhost:23051/; then
    echo "$(date): Frontend mort, relance..."
    cd ~/workspace/artifacts/wealthsimple-tracker
    setsid env PORT=23051 BASE_PATH=/ nohup pnpm run dev > /tmp/tracker.log 2>&1 < /dev/null &
    disown -a
  fi
  sleep 15
done
