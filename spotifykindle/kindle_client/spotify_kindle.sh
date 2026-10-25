#!/bin/sh
# SpotifyKindle — Jailbroken Kindle Helper Script (KUAL / SSH)
# Prevents Kindle screensaver sleep and opens SpotifyKindle in fullscreen mode.

SERVER_URL="${1:-http://192.168.1.100:5050/kindle}"

echo "[SpotifyKindle] Disabling Kindle screensaver sleep..."
lipc-set-prop com.lab126.powerd preventScreenSaver 1 2>/dev/null

echo "[SpotifyKindle] Opening $SERVER_URL in Kindle browser..."
lipc-set-prop com.lab126.appmgrd start "app://com.lab126.browser?view=${SERVER_URL}" 2>/dev/null
