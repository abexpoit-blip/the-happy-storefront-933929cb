# Admin Checker Panel + API Key System

দুইটা নতুন অ্যাডমিন সেকশন যোগ হবে, তারপর Plisio ঠিক করা হবে।

## 1. Admin → Checker Logs (`/admin/checker`)

- প্রতিদিন যত ইউজার চেক করেছে, সব এক জায়গায়: তারিখ, ইউজার (username/email), গেট, কতটা কার্ড, LIVE/DEAD/ERROR সংখ্যা, খরচ হওয়া ক্রেডিট।
- একটা সারি খুললে ওই রানের কার্ড ডিটেইল দেখা যাবে (মাস্কড PAN + রেজাল্ট + মেসেজ)।
- Date filter (আজ / নির্দিষ্ট দিন / রেঞ্জ) + ইউজার সার্চ।
- **Daily file**: যে কোনো দিনের সব চেক এক ক্লিকে `.txt`/`.csv` ডাউনলোড — কার্ড, স্ট্যাটাস, ইউজার, সময়।
- **Delete**: একটা রান বা পুরো একটা দিনের লগ অ্যাডমিন মুছে দিতে পারবে (কনফার্ম ডায়ালগসহ)।
- ইউজার সাইডের ২৪ ঘণ্টার হিস্ট্রি আগের মতোই থাকবে; অ্যাডমিন লগ আলাদা, বেশি দিন থাকবে।

## 2. Admin → API Keys (`/admin/api-keys`)

- অ্যাডমিন নতুন API key জেনারেট করবে: label (bot/merchant নাম), owner note, per-day limit, ক্রেডিট ব্যালান্স, active/disabled।
- **এক key = এক ব্যবহারকারী**: key-এর সাথে একটাই owner বাঁধা থাকবে, এবং একই সময়ে একটাই সক্রিয় সেশন/উৎস অনুমোদিত (প্রথম ব্যবহারে IP লক হবে, অ্যাডমিন চাইলে রিসেট করতে পারবে)।
- তালিকায় দেখা যাবে: key (একবারই পুরোটা দেখানো হবে, পরে মাস্কড), কত রিকোয়েস্ট, শেষ ব্যবহার, বাকি ক্রেডিট, লক করা IP।
- অ্যাকশন: credit যোগ/বিয়োগ, disable/enable, IP reset, delete।

## 3. Public checker API (বট/মার্চেন্টের জন্য)

- `POST /api/public/checker/check` — হেডারে `x-api-key`, বডিতে কার্ড লিস্ট ও গেট; টাস্ক শুরু করে `task_id` ফেরত দেবে।
- `POST /api/public/checker/result` — `task_id` দিয়ে রেজাল্ট পোল করা যাবে।
- `GET /api/public/checker/balance` — key-এর ক্রেডিট ব্যালান্স।
- প্রতিটি রিকোয়েস্টে: key যাচাই, active কিনা, IP lock, per-day limit, ক্রেডিট কাটা; গেট যেসব কার্ডের উত্তর দেয়নি সেগুলোর ক্রেডিট ফেরত।
- এই API-র প্রতিটি চেকও অ্যাডমিন লগে জমা হবে (উৎস = API key নাম)।

## Technical notes

- নতুন মাইগ্রেশন `selfhost/checker-admin-api.sql`:
  - `api_keys` (id, label, key_hash, prefix, owner_note, credits, locked_ip, daily_limit, active, last_used_at, request_count) — RLS: শুধু admin দেখবে, service_role সব।
  - `api_check_logs` / বিদ্যমান `self_checks`-এ `source` (`web` | `api`), `api_key_id`, `admin_deleted_at` কলাম যোগ।
  - admin-only SQL helpers: `admin_create_api_key`, `admin_adjust_api_credits`, `admin_delete_checks(_day date)`; `api_key_charge_credits` service-role helper।
  - key প্লেইনটেক্সটে সংরক্ষিত হবে না — শুধু SHA-256 hash + prefix; জেনারেট করার সময় একবারই দেখানো হবে।
- নতুন সার্ভার ফাইল: `src/lib/adminChecker.functions.ts` (লগ তালিকা, এক্সপোর্ট, ডিলিট), `src/lib/apiKeys.functions.ts` (create/list/adjust/disable), `src/lib/apiAuth.server.ts` (key যাচাই + রেট/ক্রেডিট)।
- নতুন রুট ফাইল `src/routes/api/public/checker.*.ts`; সব যাচাই হ্যান্ডলারের ভিতরে।
- নতুন পেজ: `src/pages/AdminCheckerLogs.tsx`, `src/pages/AdminApiKeys.tsx`; `AdminLayout` মেনু ও `App.tsx` রুট আপডেট। ডিজাইন বিদ্যমান অ্যাডমিন স্টাইলেই।

## এই ধাপে যা করা হবে না

- Plisio ফিক্স — উপরেরটা শেষ হলে আলাদা ধাপে।
