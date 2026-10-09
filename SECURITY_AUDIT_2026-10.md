# BuildAWallet targeted implementation and security review

Date: 2026-10-09
Branch: `feat/android-token-support-chain-matrix-audit`

This is a source-level review of the Android wallet and the current `human-app` machine API. CI passed for the implementation changes; see the pull request for the latest check status. Do not treat this document as a penetration test or a release certification.

## Changes made in this branch

- **APK download flow:** the official APK buttons now navigate to the stable GitHub release asset `BuildAWallet-Wallet.apk`. The generated Android Studio project remains a separate, explicitly labelled ZIP download.
- **Custom ERC-20 tokens:** the native Android wallet can import a token by network, name, symbol, contract address, and decimals; metadata is stored locally. The app queries the token's `balanceOf` for the current wallet, shows imported balances, opens a token information panel, links to the network explorer, and allows removing the local entry. This is display/import support, not custom-token sending.
- **Chain transfer support:** machine transaction preparation and broadcast are generalized from Base-only to all seven configured EVM mainnets, while retaining Solana support. RPC chain IDs are checked against the selected chain, and EVM stablecoin calls use that chain's configured contract. Bitcoin remains read-only for this API's wallet/transaction endpoints.
- **MCP parity:** MCP now advertises prepare/broadcast tools for each configured EVM chain as well as Solana.
- **Capability matrix:** table headings and cells now line up, network count is corrected to nine for this API, and the matrix marks transfer support and configured payment rails separately.
- **Signing review:** the Android dapp transaction confirmation now displays the selected network, destination, value, gas limit and call data preview, and flags common ERC-20 transfer/approval selectors.
- **Security-setting transparency:** the native wallet's settings screen now explicitly warns that auto-lock, large-send threshold, and session-spend values are stored preferences only and are not enforced yet.

## Findings and residual risks

### High priority

1. **Native wallet spending controls are not enforced.** The app stores auto-lock, large-send threshold and session spend limit settings but does not currently apply them to wallet lifecycle or signing. The UI now warns users, but implementation is still needed before these can be presented as active controls.
2. **Dapp contract calls are not fully decoded.** The confirmation now displays a bounded calldata preview and warns for ERC-20 transfer/approval selectors, but arbitrary contract methods and token semantics can still be opaque. Treat unfamiliar dapp requests as high risk; a future release should decode common ERC-20 operations and show fee estimates, spender/recipient, and allowance size before signing.
3. **The APK link depends on a signed release asset.** The direct URL is correct for the `android-latest` release created by the Android workflow. That workflow publishes the stable APK only when all owner signing secrets are configured. If the release is absent or secrets are missing, the official APK button will not produce an installer; unsigned debug artifacts must not be advertised as production releases.

### Medium priority

4. **Imported token metadata is user supplied.** Token name, symbol and decimals can be spoofed. The app displays a warning, scopes entries to a chain ID, validates EVM address syntax and reads balances without granting token permissions. It does not yet discover metadata from the contract or support sending imported tokens.
5. **Machine API chain count differs from the legacy Python registry.** The machine API currently exposes nine networks: seven EVM chains, Solana and Bitcoin. The older top-level `chains.py` registry also includes Litecoin, but Litecoin is not part of the current machine API matrix/payment rails. This branch corrects current machine-facing descriptions rather than claiming unsupported Litecoin API coverage.
6. **External RPC availability is not guaranteed.** Chain ID validation prevents an EVM endpoint from silently serving the wrong network, but public RPC providers can still fail or rate-limit. Production deployments should configure monitored RPC endpoints.
7. **No claim of a complete security audit.** This review did not exercise live transactions, inspect deployed Cloudflare secrets, verify the signing keystore, or perform a device/runtime penetration test.

## Validation plan

CI should run the HUMAN app build, TypeScript typecheck, Vitest suite, machine-worker checks, Python tests and Android debug APK build on the pull request. The new machine test covers Arbitrum chain ID/token selection and rejects a mismatched RPC chain ID. Release signing and direct APK download must be checked separately against the published signed release.
