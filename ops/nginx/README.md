# nginx cache headers

`deploy/deploy.sh` now does this itself, on every deploy:

1. writes `/etc/nginx/snippets/collarone-cache.conf`, and
2. wires `include snippets/collarone-cache.conf;` into the site's server
   blocks the first time it finds them without it.

Both steps are guarded. If including the snippet makes `nginx -t` fail, the
config is restored from a timestamped backup and the previous config is
reloaded, so a deploy can never take the site down over a cache header.

**Nothing to run by hand.** Verify after a deploy:

```bash
curl -sI https://collarone.app/ | grep -i cache-control
# want: Cache-Control: no-cache, must-revalidate

curl -sI https://collarone.app/assets/index-*.js | grep -i cache-control
# want: Cache-Control: public, immutable   (unchanged, this one SHOULD cache)
```

If the first command prints nothing, the wiring didn't find the site config.
Check the deploy log for "Wired snippets/collarone-cache.conf into …", then
look for the file yourself: `grep -rl collarone /etc/nginx/sites-enabled/`.

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
