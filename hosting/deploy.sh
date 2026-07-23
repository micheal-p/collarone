#!/usr/bin/env bash
# Collarone deploy — build locally, ship to the server, zero-downtime reload.
#
#   SERVER=deploy@1.2.3.4 APP_DIR=/opt/collarone ./hosting/deploy.sh
#
# First-time server setup (once, as root):
#   apt install -y nginx nodejs npm && npm i -g pm2
#   mkdir -p /opt/collarone /var/log/collarone
#   (copy hosting/nginx.conf.example into place, set up certs, start pm2)
set -euo pipefail

SERVER="${SERVER:?set SERVER=user@host}"
APP_DIR="${APP_DIR:-/opt/collarone}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> building client"
(cd "$ROOT/client" && npm run build)

echo "==> shipping to $SERVER:$APP_DIR"
rsync -az --delete "$ROOT/client/dist/"  "$SERVER:$APP_DIR/client/dist/"
rsync -az --delete "$ROOT/client/api/"   "$SERVER:$APP_DIR/client/api/"
rsync -az --exclude node_modules --exclude .env "$ROOT/hosting/" "$SERVER:$APP_DIR/hosting/"

echo "==> installing deps + reloading"
# the client/node_modules symlink lets client/api/*.js resolve
# @supabase/supabase-js out of hosting's installed dependencies
ssh "$SERVER" "cd $APP_DIR/hosting && npm install --omit=dev --silent \
  && ln -sfn ../hosting/node_modules $APP_DIR/client/node_modules \
  && (pm2 reload collarone || pm2 start ecosystem.config.cjs) && pm2 save"

echo "==> done. Check: curl -s https://collarone.app/api/health"
