# Hexfront Rush replay collector

The hosted end of the game's "share replays" checkbox: a Playgama build made with
`VITE_REPLAY_URL=https://hf.gamestao.com/r npm run build:playgama` posts each finished solo match
there (the default build sends none), and this keeps it for 15 days so the matches can be
replayed and studied (`npm run replays`). Nothing else is served: `/privacy` (what is kept, for the
players), `/health` (for Docker) and 404 for the rest.

It runs on the box `blightbloom` in `/home/deploy/hexfront`, beside Potion Siege and apart from it,
in two containers:

- `collector`: `node server/collect.ts` on port 8787, inside the compose network only. Replays go
  to `./data/replays/<id>.json.gz`.
- `tunnel`: cloudflared. It dials out to Cloudflare, which serves `https://hf.gamestao.com` and
  routes it to `http://collector:8787`. No port is opened on the box.

## Once

1. In Cloudflare Zero Trust, Networks, Tunnels: create a tunnel (cloudflared, e.g. `hexfront`).
   Copy its token. Add a public hostname: `hf.gamestao.com`, service `HTTP`, URL `collector:8787`.
2. On the box:

   ```bash
   mkdir -p /home/deploy/hexfront/data   # as deploy (uid 1000 = the image's node user)
   ```

3. After the first copy (below), in `/home/deploy/hexfront`: `cp env.example .env`, `chmod 600 .env`,
   and fill in `HF_TUNNEL_TOKEN` (and `HF_PRIVACY_CONTACT`, the address shown on the privacy page).

## Deploy

From the game folder:

```bash
npm run pack:collector
scp -r ../dist/hexfront-collector/* blightbloom:/home/deploy/hexfront/
ssh blightbloom 'cd /home/deploy/hexfront && docker compose up -d --build'
```

`pack:collector` puts `server/collect.ts` and every module it loads under `app/` (no packages:
Node runs the TypeScript as is), with this folder's Dockerfile, compose file and env.example.
`.env` and `data/` on the box are left alone.

Check: `https://hf.gamestao.com/health` says `ok`, `https://hf.gamestao.com/privacy` shows the
page, and `ssh blightbloom 'docker compose -f /home/deploy/hexfront/docker-compose.yml ps'`
shows both healthy/running.

## Fetching the replays

```bash
rsync -a blightbloom:/home/deploy/hexfront/data/replays/ data/replays/
npm run replays
```

## Limits

| What | Limit | Answer |
| --- | --- | --- |
| Body | 256 KB | 413 |
| Bodies being read at once | 32 | 503, retry-after 5 |
| Time to send a body | 20 s | 408 |
| Posts per address | 40 per 10 minutes | 429 |
| Kept | 15 days, 1 GiB in all (`HF_REPLAY_BYTES`) | oldest go first |
| Disk | under 256 MB free, or `data/` not writable | `/health` 503 |

The address is Cloudflare's `CF-Connecting-IP`, held in memory for the rate limit only and never
written.
