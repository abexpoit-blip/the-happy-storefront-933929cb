# Zoru Telegram Checker Bot

আলাদা ফাইল: `bot/checker-bot.mjs` (কোনো npm dependency লাগে না, Node 18+)।
বটটি ডাটাবেসে সরাসরি হাত দেয় না — সবকিছু পাবলিক checker API দিয়ে চলে, তাই
বিলিং/লিমিট/রিফান্ড ওয়েব চেকারের মতোই থাকে।

## 1) সিক্রেট সেভ

```bash
bash selfhost/set-secrets.sh telegram \
  TELEGRAM_BOT_TOKEN=<bot token> \
  TELEGRAM_ADMIN_IDS=<your telegram id> \
  TELEGRAM_BOT_ADMIN_SECRET=<any long random string>
```

সাইটের দিকেও একই সিক্রেট লাগবে (`/newkey` কাজ করার জন্য):

```bash
echo "BOT_ADMIN_SECRET=<same long random string>" >> /var/www/zoru-cc/.env
bash selfhost/pm2-start.sh
```

## 2) বট চালু

```bash
bash selfhost/bot-start.sh
pm2 logs zoru-bot --lines 40 --nostream
```

## 3) কমান্ড

| কমান্ড | কাজ |
| --- | --- |
| `/setkey <api_key>` | নিজের API key সেভ |
| `/mykey` | সেভ করা key (masked) |
| `/balance` | credits + owner balance + কত কার্ড চেক করা যাবে |
| `/gate <name>` | gate সিলেক্ট |
| `/check` + কার্ড লাইন | চেক শুরু (reply-ও কাজ করে) |
| `.txt` ফাইল আপলোড | ফাইলের কার্ড চেক (সর্বোচ্চ ৫০০) |
| `/task <id>` | পুরনো টাস্কের রেজাল্ট |
| `/api` | নিজের বট বানানোর API ডকুমেন্ট |
| `/newkey <label> [credits] [daily_limit]` | **admin only** — নতুন API key ইস্যু |

## 4) নিজের বট বানানো (API)

```bash
curl https://zoru.cc/api/public/checker/balance -H "x-api-key: KEY"

curl -X POST https://zoru.cc/api/public/checker/check \
  -H "x-api-key: KEY" -H "Content-Type: application/json" \
  -d '{"cards":["4111111111111111|12|2027|123"]}'

curl -X POST https://zoru.cc/api/public/checker/result \
  -H "x-api-key: KEY" -H "Content-Type: application/json" \
  -d '{"task_id":"TASK"}'
```

Admin key ইস্যু (বট নিজেই এটা ব্যবহার করে):

```bash
curl -X POST https://zoru.cc/api/public/checker/key \
  -H "x-bot-admin-secret: $BOT_ADMIN_SECRET" -H "Content-Type: application/json" \
  -d '{"label":"my-bot","credits":0,"daily_limit":5000}'
```

প্রতি কার্ড $0.02 — আগে key-এর credits, তারপর owner-এর balance।
গেটওয়ে উত্তর না দিলে সেই কার্ডগুলোর টাকা অটো ফেরত যায়।
