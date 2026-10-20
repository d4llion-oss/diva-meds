# Diva's Daily Meds — shared checklist on diva.burwinkle.com

One small Node service (no npm dependencies) plus Caddy for automatic HTTPS. Everyone who opens the link sees the same checklist and dose log; every check-off is stamped with Central time and the name of whoever tapped it. Data lives in a JSON file on a Docker volume.

Access model: the link carries a key (`#k=…`). The page stores it locally and strips it from the address bar; every API call sends it in a header. No key, no data — anyone who stumbles on the URL without it sees only a "missing key" notice. Rotate by changing `EDIT_KEY` and sending a new link.

## Deploy on DigitalOcean (about 10 minutes)

1. **Droplet.** Create the smallest Ubuntu 24.04 Droplet (Regular, $4–6/mo is plenty) in the region nearest you, with your SSH key. Note its public IP.

2. **DNS.** In DigitalOcean → Networking → Domains → `burwinkle.com`, add an **A record**: hostname `diva`, value = the Droplet IP, TTL 300.

3. **Install Docker on the Droplet.**
   ```bash
   ssh root@<droplet-ip>
   curl -fsSL https://get.docker.com | sh
   ```

4. **Copy this folder up and configure.**
   ```bash
   # from your machine
   scp -r diva-meds root@<droplet-ip>:/opt/

   # on the droplet
   cd /opt/diva-meds
   cp .env.example .env
   openssl rand -base64 24 | tr '+/' '-_' | tr -d '='     # paste result as EDIT_KEY in .env
   nano .env
   ```

5. **Start it.**
   ```bash
   docker compose up -d --build
   docker compose logs -f caddy      # wait for "certificate obtained" for diva.burwinkle.com
   ```
   Caddy gets a Let's Encrypt certificate automatically once the A record resolves. Ports 80 and 443 must be open (DigitalOcean's default firewall allows both; if you add a Cloud Firewall, allow TCP 22, 80, 443).

6. **Share the link.**
   `https://diva.burwinkle.com/#k=<your EDIT_KEY>`
   Send that exact URL to whoever is helping with Diva. After they open it once, the key is remembered on their phone and the plain `https://diva.burwinkle.com` works for them too.

## Operations

| Task | Command (on the droplet, in `/opt/diva-meds`) |
|---|---|
| View the raw log | `docker compose exec app cat /data/log.json` |
| Back up | `docker compose cp app:/data/log.json ./log-backup.json` |
| Change course start/length | edit `COURSE_START` / `COURSE_DAYS` in `.env`, then `docker compose up -d` |
| Rotate the key | change `EDIT_KEY` in `.env`, `docker compose up -d`, send the new link |
| Update the page | edit `app/public/index.html`, `docker compose up -d --build` |

## How the day works

A "med day" runs 8 AM → 2 AM Central and rolls over at 3 AM, so the midnight and 2 AM doses count toward the day they close. The server, not the phone, decides the day and stamps the time, so everyone's view agrees even if a phone clock is off.

Doses per day: 8 AM Gabapentin + Carprofen · 2 PM Clavamox · 4 PM Gabapentin · 8 PM Carprofen · 12 AM Gabapentin · 2 AM Clavamox.

## Run locally to preview

```bash
cd app
EDIT_KEY=localtestkey123 node server.js
# open http://localhost:8080/#k=localtestkey123
```
