# BuildAWallet Human flow

## Build
- Add four focused setup pages for identity, custody, chains, and security, each centered on one modal-style choice panel.
- Carry choices between pages in browser storage and let users move backward without losing selections.
- Build `/studio` as the selected neon arcade marketplace: starter presets, category filters, many selectable wallet features, live phone preview, progress score, and a prominent deploy action.
- Add a final download page with a generated QR code, APK download placeholder, build summary, and clear preview-status messaging.
- Keep `/` as a simple temporary Human entry point so the supplied landing page can replace it later.

## Visual direction
- Follow the selected neon arcade wallet composition.
- Use the Acid Vault palette and bold arcade typography chosen earlier.
- Keep animation energetic but restrained, with reduced-motion support.

## Technical details
- Use TanStack routes for every page and shared React state persisted locally.
- Use existing design-system buttons and semantic color tokens.
- Add unique metadata for every route.
- The APK action will be an honest prototype download, not a production crypto wallet binary.

## Verification
- Check the full Human path from entry through all four setup pages, Studio configuration, deploy, and download on desktop and mobile.
