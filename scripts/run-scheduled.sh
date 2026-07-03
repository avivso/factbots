#!/bin/bash
# FactBots auto-poster. Invoked by launchd (see ~/Library/LaunchAgents/
# com.factbots.autopost.plist) every 4 hours. Renders the next fact and
# uploads it to YouTube. Appends a timestamped record to out/cron.log.
#
# launchd runs with a bare environment, so set PATH explicitly (node/npm live
# in /usr/local/bin on this machine).
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$HOME/Desktop/factbots" || exit 1
mkdir -p out
{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %z') starting ====="
  npm run make
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %z') finished (exit $?) ====="
  echo
} >> out/cron.log 2>&1
