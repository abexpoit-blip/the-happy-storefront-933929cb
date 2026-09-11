# Telegram bot connection audit and hardening

## Changes
- Keep `https://zoru.cc` as the bot base; the bot will continue calling the website bridge under `/api/public/bot/*`.
- Align the startup script with the bot’s actual `BOT_API_BASE` environment variable.
- Validate the Telegram token at startup with `getMe`, fail clearly when invalid, and prevent rapid repeated `getUpdates` failures.
- Improve startup output so Telegram connectivity and website API base are unambiguous without exposing secrets.
- Verify TypeScript/build status and provide exact VPS deploy plus log-check commands.

## Technical details
- No frontend design or database schema changes.
- Existing website balances, deposits, referrals, checking, and API access remain the source of truth.
