#!/bin/sh
# SpotifyKindle KUAL Script for Kindle Paperwhite 1 (5th Gen / EY21 / FW 5.6.1.1)

SERVER_URL="http://192.168.0.146:5050/kindle"

case "$1" in
  start_browser)
    # Disable Kindle screensaver/sleep
    lipc-set-prop com.lab126.powerd preventScreenSaver 1
    # Clear screen via eips on PW1
    eips -c
    eips 10 20 "Starting SpotifyKindle..."
    # Launch Kindle Experimental Browser pointed to local server
    lipc-set-prop com.lab126.appmgrd start "app://com.lab126.browser?view=${SERVER_URL}"
    ;;
  nosleep)
    lipc-set-prop com.lab126.powerd preventScreenSaver 1
    eips 2 2 "Sleep Disabled (preventScreenSaver=1)"
    ;;
  stop)
    lipc-set-prop com.lab126.powerd preventScreenSaver 0
    eips 2 2 "Sleep Re-enabled (preventScreenSaver=0)"
    ;;
esac
