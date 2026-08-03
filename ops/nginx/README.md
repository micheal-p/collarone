# nginx: one line to add, once

`deploy/deploy.sh` writes `/etc/nginx/snippets/collarone-cache.conf` on every
deploy. It does nothing until the site's server block includes it — nginx
snippets are inert on their own.

**Run this once on the VPS**, then never again:

```bash
ssh root@72.61.156.142

# 1. find the server block for collarone.app
grep -rl 'collarone' /etc/nginx/sites-available/

# 2. inside that server { … } block, add:
#      include snippets/collarone-cache.conf;
#    put it above the existing `location /` so the exact-match
#    `location = /index.html` is in scope.

# 3. prove it parses, then reload
nginx -t && systemctl reload nginx
```

Verify from anywhere:

```bash
curl -sI https://collarone.app/ | grep -i cache-control
# want: Cache-Control: no-cache, must-revalidate

curl -sI https://collarone.app/assets/index-*.js | grep -i cache-control
# want: Cache-Control: public, immutable   (unchanged — this one SHOULD cache)
```

## Why

The two files need opposite caching and currently only one of them says so.

Hashed assets under `/assets/` are immutable: the filename changes whenever the
content does, so caching them for a year is free and correct. That part is
already configured.

`index.html` is the opposite. It is the file that *names* the current hashes, it
is served from a stable URL, and it currently goes out with **no
`Cache-Control` at all** — so a browser is free to hold on to it. When it does,
it keeps asking for chunks by hashes that no longer exist on the server, gets
nginx's 404 HTML page, and tries to parse `<html>` as JavaScript.

That is the `Unexpected token '<'` error — 160 of them in a single night.

Two other things already reduce it, but neither is a substitute for this:

- `client/vite.config.js` keeps the previous build's chunks instead of wiping
  them (`emptyOutDir: false`), and `deploy.sh` prunes anything older than 7 days;
- `client/src/lib/staleBuild.js` reloads a tab once when it detects the failure.

Those are a grace period and a cure. This is the prevention.
