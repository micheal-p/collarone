# Pull-based deploy — one-time setup (for John, on the box)

**Why:** the GitHub Actions `deploy` job SSHes into the box on port 22, and the
box firewall keeps dropping GitHub's datacenter runner IPs — so the deploy
fails intermittently (a red check, and the latest commit doesn't land). This
flips it around: **the box pulls `main` from GitHub itself** every ~2 minutes,
so deployment never depends on GitHub reaching in. No inbound port, nothing to
whitelist.

Run these once, on the box (`ssh root@72.61.156.142`):

### 1. Make the app dir a git checkout (safe — .env / node_modules / dist are gitignored and untouched)
```bash
cd /opt/collarone/app
cp .env /opt/collarone/.env.backup            # belt-and-suspenders
git init
git remote add origin https://github.com/micheal-p/collarone.git
git fetch origin main
git reset --hard origin/main                  # source now tracked; .env/node_modules/dist stay
```

### 2. Install the script + systemd timer (they're in the repo under deploy/)
```bash
install -m 755 /opt/collarone/app/deploy/pull-deploy.sh /opt/collarone/pull-deploy.sh
cp /opt/collarone/app/deploy/collarone-pull.service /etc/systemd/system/
cp /opt/collarone/app/deploy/collarone-pull.timer   /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now collarone-pull.timer
```

### 3. Verify
```bash
systemctl list-timers collarone-pull.timer     # shows next run
/opt/collarone/pull-deploy.sh                  # run once by hand — should say "nothing new" or deploy
journalctl -u collarone-pull.service -n 30     # watch a real deploy
```

That's it — every push to `main` now lands on the box within ~2 minutes, no SSH
from GitHub required.

### 4. Tell me when it's running
Once the timer is confirmed working, tell me and I'll **remove the SSH `deploy`
job** from `.github/workflows/deploy.yml` (keeping the `typecheck` gate). Until
then both run, which is fine as long as you don't push during the switch — but
they shouldn't run long-term (the pull's `git reset` and the Actions rsync would
fight over the same files).
