# BuildAWallet HUMAN integration

This project is the HUMAN frontend only. It is built as a static SPA whose asset base is `/human-app/` while the browser routes remain under `/human`.

Production route tree:
- `/human`
- `/human/custody`
- `/human/chains`
- `/human/security`
- `/human/studio`
- `/human/release`
- `/human/pay`
- `/human/download`

Backend contracts expected on the main BuildAWallet domain:
- `GET /api/human/entitlement`
- `POST /api/human/subscription/invoice`
- `GET /api/human/subscription/invoice/:invoiceId`
- `POST /api/human/build`
- `GET /api/human/build/:buildId`

A completed build response should include `status: "complete"`, `apkUrl`, and optionally `sha256`.
