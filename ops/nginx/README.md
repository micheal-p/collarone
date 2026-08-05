# RESOLVED: no-cache on index.html

**Status: done — verified in production 2026-08-06.**
`curl -sI https://collarone.app/` returns `Cache-Control: no-cache, must-revalidate`
and hashed assets still return `public, immutable`. The health endpoint reports
`"nginx":"already-wired:...effective=yes"`, so `deploy.sh` now detects the config
handles it and no longer touches nginx. Everything below is kept as the history
of how it was diagnosed.

## The problem

`index.html` is served with **no `Cache-Control` header at all**, while the
hashed assets under `/assets/` are `public, immutable` with a one-year age.
That combination is backwards for the HTML: a browser is free to hold on to an
old `index.html`, which keeps naming chunk filenames by their old content
hashes. After a deploy those files are gone, nginx answers with its 404 **HTML**
page, and the browser tries to parse `<html>` as JavaScript.

That is the `Unexpected token '<'` error, 160 of them in one night, plus its
siblings `Importing a module script failed` and `Failed to fetch dynamically
imported module`. Same event, three browsers' wording.

## What is already known (verified in production)

| | |
|---|---|
| Config that actually serves the site | `/etc/nginx/sites-enabled/collarone.app` |
| Found how | `nginx -T` and matching the `server_name` line, not by filename |
| Snippet already on the box | `/etc/nginx/snippets/collarone-cache.conf`, rewritten by `deploy/deploy.sh` every deploy |
| Wiring attempt | `deploy.sh` inserts `include snippets/collarone-cache.conf;` after each `server {` |
| Result | **`nginx -t` rejects it, so the deploy restores the config and reloads the old one.** The site is never at risk, but the header never lands |
| Current state, readable any time | `curl -s https://collarone.app/api/health` → `"nginx"` field |

`/etc/nginx/nginx.conf` was tried first by mistake: the edit applied and
`nginx -t` passed, but nothing changed, because the site's server block is not
in that file.

## What to do

SSH in and run the include by hand to see the real error:

```bash
CONF=/etc/nginx/sites-enabled/collarone.app
cp "$CONF" "$CONF.bak"
# add inside the server block that listens on 443:
#     include snippets/collarone-cache.conf;
nginx -t          # <- read this message, it is the whole answer
```

Two likely causes, both quick:

1. **A `location = /index.html` already exists** in that server block. Two of
   them is a duplicate-location error. Fix: add the header to the existing
   block instead of including the snippet.
2. **The include path doesn't resolve.** Fix: paste the directives inline
   rather than including a file:

   ```nginx
   location = /index.html {
       add_header Cache-Control "no-cache, must-revalidate" always;
       expires -1;
   }
   ```

Then `nginx -t && systemctl reload nginx`.

## How to know it worked

```bash
curl -sI https://collarone.app/ | grep -i cache-control
# want: Cache-Control: no-cache, must-revalidate

curl -sI https://collarone.app/assets/index-<hash>.js | grep -i cache-control
# want: public, immutable   (unchanged — this one SHOULD cache for a year)
```

Once it's set, `deploy.sh` sees the config already handles it and stops trying.

## Related, already shipped, don't redo

- `client/vite.config.js` keeps the previous build's chunks (`emptyOutDir:
  false`) and `deploy.sh` prunes anything older than 7 days, so a tab mid-load
  during a deploy can still finish.
- `client/src/lib/staleBuild.js` reloads a tab **once** when it detects the
  failure, cache-busting the reload so it doesn't get the same stale HTML back.

Those are a grace period and a cure. The header above is the prevention.
