#!/bin/bash
# Copy the web app into the iOS project, then undo the one thing the
# Capacitor CLI gets wrong on this setup.
#
# `cap sync` rewrites ios/App/CapApp-SPM/Package.swift and writes
# platforms: [.iOS(.v26)] into it. Swift rejects that — v26 is not a
# platform value the toolchain knows — and the build dies at package
# resolution with an error that says nothing about Capacitor. The file
# says DO NOT MODIFY because the CLI owns it, so it is patched after every
# sync rather than edited once and forgotten.
#
#   ./scripts/sync-ios.sh
set -e
cd "$(dirname "$0")/.."
npx cap sync ios
sed -i '' 's|platforms: \[.iOS(.v26)\]|platforms: [.iOS(.v15)]|' ios/App/CapApp-SPM/Package.swift
echo "synced (and Package.swift platform corrected)"
