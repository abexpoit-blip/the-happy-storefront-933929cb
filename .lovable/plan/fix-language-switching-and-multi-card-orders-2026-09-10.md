# Fix language switching and multi-card orders

## Changes
- Replace hardcoded buyer navigation, profile menu, footer, and loading text with explicit English/Russian labels driven by the selected language.
- Make English the reliable default while preserving the saved Russian choice.
- Remove the unsafe one-card fallback from cart checkout so a multi-card purchase cannot silently become separate orders.
- Strengthen the cart purchase database function to validate every selected card before charging and create one order containing one item row per selected card.
- Make Orders normalize and display every delivered card row within that order, with a visible load error instead of silently showing an empty list.

## Verification
- Run targeted cart/order tests, TypeScript checks, and the production build.
- Verify language switching and a multi-card order in the live preview where available.

## Deployment
- Provide the exact VPS update, database migration, restart, and log-check commands after the backend change.
