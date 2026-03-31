#!/bin/bash
# Stellar Agent Mesh Watchdog (persistent)
MESH_DIR="$HOME/clawd/projects/stellar-agent-mesh"
GATEWAY_LOG="$MESH_DIR/logs/gateway.log"
HARNESS_LOG="$MESH_DIR/logs/harness.log"
PIDFILE_GW="$MESH_DIR/logs/gateway.pid"
PIDFILE_HR="$MESH_DIR/logs/harness.pid"

mkdir -p "$MESH_DIR/logs"

start_gateway() {
  cd "$MESH_DIR/gateway"
  node dist/index.js >> "$GATEWAY_LOG" 2>&1 &
  echo $! > "$PIDFILE_GW"
  echo "[$(date -Iseconds)] Gateway started (PID $(cat $PIDFILE_GW))" >> "$MESH_DIR/logs/watchdog.log"
}

start_harness() {
  cd "$MESH_DIR/harness"
  set -a && source .env && set +a
  node dist/index.js >> "$HARNESS_LOG" 2>&1 &
  echo $! > "$PIDFILE_HR"
  echo "[$(date -Iseconds)] Harness started (PID $(cat $PIDFILE_HR))" >> "$MESH_DIR/logs/watchdog.log"
}

is_running() {
  [ -f "$1" ] && kill -0 "$(cat "$1" 2>/dev/null)" 2>/dev/null
}

echo "[$(date -Iseconds)] Watchdog started (persistent)" >> "$MESH_DIR/logs/watchdog.log"

while true; do
  if ! is_running "$PIDFILE_GW"; then
    echo "[$(date -Iseconds)] Gateway down — restarting..." >> "$MESH_DIR/logs/watchdog.log"
    start_gateway
    sleep 3
  fi
  if ! is_running "$PIDFILE_HR"; then
    echo "[$(date -Iseconds)] Harness down — restarting..." >> "$MESH_DIR/logs/watchdog.log"
    start_harness
    sleep 5
  fi
  sleep 60
done
