#!/bin/bash
# Start Basal and print the address to open on your phone.
cd "$(dirname "$0")" || exit 1
exec python3 server.py "$@"
