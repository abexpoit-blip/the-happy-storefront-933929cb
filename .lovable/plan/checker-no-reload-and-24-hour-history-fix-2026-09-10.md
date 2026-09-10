# Checker no-reload and 24-hour history fix

## Goal
Keep checking on the same page, preserve submitted card details while results arrive, and retain usable history for 24 hours.

## Changes
- Stop overlapping checker start/poll state that currently clears the active card list and makes the page appear to reload.
- Persist each submitted card in the existing checker task record immediately, then merge gateway results into that stable list.
- Restore an active task, its cards, progress, and latest results after navigation or an actual browser refresh.
- Show pending, LIVE, DEAD, error, and skipped cards together during checking instead of hiding cards until a result arrives.
- Add per-card and full-list copy actions to current results and history.
- Limit both self-checker and cart-check history queries to the signed-in user's last 24 hours; old entries no longer appear.
- Keep polling in-place at the gateway-safe interval, prevent duplicate polling, and surface real failures without charging twice.
- Verify type checks, production output, and the live checker screen behavior.

## Technical details
- Extend `self_checks` with a protected submitted-card snapshot suitable for masked display only; no CVV or full PAN will be stored.
- Make task creation and initial history persistence failure-safe so charged credits are returned if task storage fails.
- Deduplicate paginated gateway results before saving to prevent counts growing on repeated polls.
- Track cart checker task identity and resume it from persisted task rows rather than starting a second task.
