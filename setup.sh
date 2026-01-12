#!/bin/bash

# Simple script to switch between Chrome and Firefox manifests

if [ "$1" == "chrome" ]; then
    cp manifest.chrome.json manifest.json
    echo "Manifest switched to Chrome (Service Worker mode)."
elif [ "$1" == "firefox" ]; then
    cp manifest.firefox.json manifest.json
    echo "Manifest switched to Firefox (Background Scripts mode)."
else
    echo "Usage: ./setup.sh [chrome|firefox]"
fi
