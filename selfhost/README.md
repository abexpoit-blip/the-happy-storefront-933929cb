# Zoru Shop — Self-hosted Supabase (VPS: 157.173.117.34)

সব ডাটা এখন থেকে **তোমার নিজের VPS**-এ থাকবে। Supabase cloud আর লাগবে না।

---

## ধাপ ০ — DNS
Domain panel-এ একটা A record বানাও:

| Type | Name | Value |
|---|---|---|
| A | `api` | `157.173.117.34` |

অর্থাৎ `api.zoru.cc` → তোমার VPS. (৫–১০ মিনিট অপেক্ষা করো)

---

## ধাপ ১ — কোড টেনে নাও (VPS-এ)
```bash
cd /var/www/zoru-cc && git fetch origin && git reset --hard origin/main
```

## ধাপ ২ — ইনস্টলার চালাও
```bash
cd /var/www/zoru-cc/selfhost && chmod +x setup-supabase.sh && bash setup-supabase.sh
```
এটা করবে: Docker ইনস্টল → Supabase stack চালু → key generate → schema apply → `api.zoru.cc` nginx + SSL → অ্যাপের `.env` লিখে দেবে।

শেষে স্ক্রিনে **সব details** প্রিন্ট হবে — কপি করে সেভ করে রাখো।
পরেও দেখা যাবে:
```bash
cat /opt/supabase/credentials.json
```

### যদি `supabase-db is unhealthy` আসে
প্রথম ইনস্টল মাঝপথে `Ctrl+C` করলে DB init partial/corrupt হতে পারে। যেহেতু তখনো live data নেই, একবার clean reset দিয়ে আবার চালাও:

```bash
cd /opt/supabase/docker && docker compose down -v --remove-orphans && rm -rf volumes/db/data
cd /var/www/zoru-cc/selfhost && bash setup-supabase.sh
```

> Warning: live data থাকলে এই reset চালাবে না — আগে backup নিতে হবে।

## ধাপ ৩ — অ্যাডমিন + ডেমো ইউজার বানাও
```bash
cd /var/www/zoru-cc/selfhost
SUPABASE_URL=https://api.zoru.cc \
SERVICE_KEY=$(jq -r .SERVICE_ROLE_KEY /opt/supabase/credentials.json) \
node create-users.mjs
```

## ধাপ ৪ — অ্যাপ রিবিল্ড (নতুন DB-তে পয়েন্ট করার জন্য)
```bash
cd /var/www/zoru-cc && bun install && bun run build && bash selfhost/pm2-start.sh
pm2 logs zoru-cc --lines 30 --nostream
```

---

## যেসব details তুমি পাবে (সেভ করে রাখার জন্য)

| নাম | কোথায় | কাজ |
|---|---|---|
| **API URL** | `https://api.zoru.cc` | অ্যাপ এখানে কানেক্ট হবে |
| **ANON_KEY** | credentials.json | ফ্রন্টএন্ড পাবলিক key |
| **SERVICE_ROLE_KEY** | credentials.json | সার্ভার/অ্যাডমিন key — কখনো ফ্রন্টে দিও না |
| **JWT_SECRET** | credentials.json | টোকেন সাইনিং |
| **POSTGRES_PASSWORD** | credentials.json | DB পাসওয়ার্ড |
| **Studio UI** | `http://157.173.117.34:8000` | DB dashboard (username/password credentials.json-এ) |
| **DB connection** | `postgresql://postgres:<POSTGRES_PASSWORD>@127.0.0.1:5432/postgres` | psql / backup |

---

## দরকারি কমান্ড
```bash
cd /opt/supabase/docker
docker compose ps                 # status
docker compose logs -f auth       # auth log
docker compose restart            # restart সব
docker compose down && docker compose up -d
```

### ব্যাকআপ (প্রতিদিন চালানো ভালো)
```bash
cd /opt/supabase/docker
docker compose exec -T db pg_dump -U postgres postgres | gzip > /root/zoru-db-$(date +%F).sql.gz
```

### পুরনো cloud ডাটা আনতে চাইলে
Lovable Cloud → Advanced settings → Export data দিয়ে CSV নামাও, তারপর Studio-র Table editor → Import CSV.

---

## সিকিউরিটি
```bash
ufw allow 22,80,443/tcp
ufw deny 5432/tcp     # DB বাইরে থেকে বন্ধ
ufw deny 8000/tcp     # Studio শুধু SSH tunnel দিয়ে খুলো (নিচে)
ufw enable
```
Studio নিরাপদভাবে দেখতে লোকাল পিসি থেকে:
```bash
ssh -L 8000:127.0.0.1:8000 root@157.173.117.34
# তারপর ব্রাউজারে http://localhost:8000
```
