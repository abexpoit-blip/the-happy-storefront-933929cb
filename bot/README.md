# Zoru Telegram bot

The bot is a thin Telegram front-end for the website. It never touches the
database directly — every action goes through `POST /api/public/bot/<action>`
with the shared `x-bot-secret` header, so accounts, balance, deposits,
referrals, checking and API access follow exactly the same rules as the site.

## What users can do

- `/start` — a real website account is created automatically for their Telegram ID
- `/balance` — profile, balance, bonus, gate, referrals, API status
- `/deposit [amount]` — crypto (LTC) invoice via Plisio, auto-credited on payment
- `/check` — single card or bulk (paste lines or upload a `.txt`, max 500)
- `/gate` — pick a checking gate
- `/refer` — referral link; $0.10 per referred user's first successful deposit
- `/api` — buy API access ($100, same as the website) and get the key once
- `/tasks`, `/task <id>` — recent checks and results (TXT file with all rows)

Unanswered cards are refunded automatically; live/dead cards are charged.

## Admin

Bot accounts appear in the admin panel at **/admin/bot-users** — balance
add/remove, ban/unban, deposits and check counts.

## Environment (`/etc/zoru/telegram.env`)

```
TELEGRAM_BOT_TOKEN=...        # from @BotFather
BOT_API_BASE=https://zoru.cc
BOT_ADMIN_SECRET=...          # must match BOT_ADMIN_SECRET in the site .env
```

`BOT_API_BASE` is the website origin, not a separate host. The bot appends
`/api/public/bot/<action>` itself, so production should use:

```
BOT_API_BASE=https://zoru.cc
```

## Run

```bash
bash selfhost/bot-start.sh
pm2 logs zoru-bot --lines 40 --nostream
```

Successful startup logs show the authenticated Telegram username, the website
API base, and the complete bridge pattern. An invalid or revoked token is
rejected before PM2 starts the process.

## Database

Apply `selfhost/bot-accounts.sql` once before starting the bot.
