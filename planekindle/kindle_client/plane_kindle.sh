#!/bin/sh
# Standalone SSH / USBNetwork launcher for PlaneKindle on Kindle Paperwhite 1 (EY21)

SERVER_URL="${1:-http://192.168.0.146:5051/kindle}"

lipc-set-prop com.lab126.powerd preventScreenSaver 1
eips -c
eips 8 18 "Launching PlaneKindle -> ${SERVER_URL}"
lipc-set-prop com.lab126.appmgrd start "app://com.lab126.browser?view=${SERVER_URL}"
