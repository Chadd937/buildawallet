# Android wallet release status

The `android-studio/` project is now a native, noncustodial Android wallet implementation, separate from the HUMAN website designer. It derives wallet accounts locally, encrypts the recovery phrase using Android Keystore-backed storage, and signs supported transactions on-device. The website and Cloudflare Workers do not receive wallet secrets.

## Implemented wallet coverage

- Native SOL and BTC transfers.
- Native-asset transfers and configured/custom ERC-20 token transfers on Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain and Avalanche.
- Import, balance display, review and sending for standard SPL Token mints and basic Token-2022 mints on Solana mainnet.
- On-chain Solana mint/program/decimals validation, checked token transfers, recipient associated-token-account creation, and SOL fee/rent sufficiency checks.
- Token-2022 mints with unsupported extensions are blocked from sending. The Android dapp browser remains EVM-provider-only; arbitrary Solana dapp transaction signing is not implemented.
- Local inactivity/foreground locking, large-transfer confirmation, and a rolling 24-hour USD spending cap. These are client-side protections, not an on-chain cryptographic policy; local market prices are indicative.

See [the targeted security review](SECURITY_AUDIT_2026-10.md) for known limitations. It is a source-level review, not a penetration test or independent wallet audit.

## Required before production promotion

1. Ensure the latest branch-head Android unit tests and `:app:assembleDebug` pass. Do not rely on a CI run from an earlier commit.
2. Test SOL, SPL Token, supported Token-2022, EVM native and ERC-20 sends on devnet/testnet or isolated test accounts, including a recipient with no associated token account, invalid mints, unsupported extensions, insufficient fee/rent balance, RPC failures, and lock/unlock during review.
3. Verify recovery/restore and transaction behavior on physical Android devices.
4. Obtain an independent review of seed storage, signing, transaction parsing, and guardrails before using meaningful funds.
5. Configure the owner-controlled Android release keystore in GitHub Actions secrets and verify the release signature and SHA-256 checksum before distributing the APK.

## Build and publish workflow

The workflow `.github/workflows/android-wallet.yml` runs on pushes to `main` that change `android-studio/**`, or can be started manually with GitHub Actions `workflow_dispatch`.

Required repository secrets for a signed release:

- `BAW_ANDROID_KEYSTORE_B64`
- `BAW_ANDROID_KEYSTORE_PASSWORD`
- `BAW_ANDROID_KEY_ALIAS`
- `BAW_ANDROID_KEY_PASSWORD`

When all four secrets are configured, the workflow builds and publishes the owner-signed APK and checksum as the `android-latest` GitHub Release. If the secrets are absent, it uploads a **debug APK artifact only**; that is not a production release. Keep the keystore and passwords private and backed up, and always use the same signing identity for future updates.

The signed release asset is expected at:

`https://github.com/Chadd937/buildawallet/releases/download/android-latest/BuildAWallet-Wallet.apk`

## Local build

Use JDK 17+, Gradle 8.13+, Android SDK platform 35 and build-tools 35.0.0:

```bash
cd ~/buildawallet/android-studio
gradle :app:testDebugUnitTest
gradle :app:assembleDebug
```

The signed production release and live-funds validation remain separate from a successful CI build.
