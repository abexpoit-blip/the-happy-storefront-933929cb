# Telegram bot full reliability fix

## Goal
`unauthorized` error থেকে শুরু করে Telegram bot-এর account creation, balance, deposit, checker, gate, task history, referral এবং API-key purchase একই website account ও database rules দিয়ে নির্ভরযোগ্যভাবে চালানো। Existing website UI বদলানো হবে না।

## Work
1. **Authentication and startup hardening**
   - Website ও bot একই `BOT_ADMIN_SECRET` পেয়েছে কি না startup-এ safe fingerprint দিয়ে যাচাই করব; secret value log হবে না।
   - Health/session checks-এর HTTP status ও exact safe error দেখাব, যাতে `unauthorized`, missing migration, invalid token আলাদা বোঝা যায়।
   - Empty/invalid `TELEGRAM_ADMIN_IDS`, malformed base URL এবং stale webhook/polling conflict startup-এর আগেই আটকাব।

2. **Database and account wiring**
   - Bot migration-কে idempotent ও prerequisite-safe করব; required grants, foreign key, columns, functions এবং permissions যাচাই করব।
   - Telegram account creation আংশিক ব্যর্থ হলে duplicate/conflict recovery ঠিক করব।
   - Installer migration order এবং Docker database detection নির্ভরযোগ্য করব; referral bonus `$0.10` বজায় থাকবে।

3. **Feature-flow fixes**
   - Session/balance, deposit, gates, checker charge/task/result/refund, history এবং API-key purchase-এর failure handling audit ও ঠিক করব।
   - Invalid gate, failed database write, failed result fetch এবং duplicate polling/update থেকে silent success বা double charge/refund আটকাব।
   - User-facing bot errors পরিষ্কার করব, sensitive backend detail দেখাব না।

4. **Verification and operations**
   - TypeScript, shell syntax, bot syntax এবং focused integration checks চালাব।
   - Protected bridge-এ wrong secret দিয়ে 401 এবং configured secret দিয়ে health/session success যাচাইয়ের script/commands দেব।
   - VPS-এর জন্য exact one-block deploy command এবং website/bot log-check commands দেব।

## Acceptance checks
- Invalid Telegram token হলে bot শুরু হবে না এবং পরিষ্কার কারণ দেখাবে।
- Secret mismatch হলে startup `unauthorized`-এর সুনির্দিষ্ট সমাধান দেখিয়ে থামবে।
- Valid setup-এ health ও admin session success, PM2 bot online, এবং `/start` account তৈরি করবে।
- Balance/deposit/gate/check/result/tasks/API flows ব্যর্থ হলে টাকা বা state অসামঞ্জস্য হবে না।
- Existing front-end design/layout অপরিবর্তিত থাকবে।
