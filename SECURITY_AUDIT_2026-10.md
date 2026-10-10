# BuildAWallet targeted implementation and security review

Date: 2026-10-09
Branch: `feat/android-token-support-chain-matrix-audit`

This is a source-level review and implementation record, not a penetration test, independent smart-contract audit, or release certification. The Android build and full CI checks must pass on the final commit before merging.

## Implemented in this branch

- **APK download:** official APK links point directly to the signed GitHub release asset; the Android Studio project ZIP remains a separate download.
- **Custom ERC-20 sending:** users can import ERC-20 tokens per EVM network and send them through the standard review, balance check, fee estimation, on-device signing, and broadcast flow. On-chain token decimals are checked against imported metadata before signing, and the final confirmation displays the token contract address. This covers the seven configured EVM networks. Solana SPL token import/sending is not included in this change.
- **Token information:** imported tokens retain local display metadata, show balances, open a detailed information panel, and link to the corresponding explorer. User-entered names and symbols are not treated as proof that a token is authentic.
- **Transaction guardrails:** the app locks after configured foreground inactivity and whenever the activity leaves the foreground; it clears the in-memory signing engines and closes the embedded dapp browser. Unlock requires the Android device credential, or local recovery-phrase verification if no secure device lock is configured.
- **Large-transfer confirmation:** native EVM, imported/configured ERC-20, SOL, BTC, and decoded dapp sends display an indicative USD estimate and require a second explicit confirmation when the configured threshold is met.
- **Rolling 24-hour cap:** successful/attempted transaction value is reserved in local persistent history before broadcast, counted over a true rolling 24-hour window, and released on a reported failure. The cap applies to EVM native/token transfers, SOL/BTC native sends, and dapp operations that can be reliably valued. An unpriced imported token consumes all remaining cap capacity after an explicit extra confirmation; reservations are released if cancellation occurs before dispatch, but retained after an ambiguous network outcome.
- **USD price lookup:** CoinGecko's public API provides indicative native-asset and listed-token prices. If a native-asset price is unavailable while USD guardrails are enabled, native transfers fail closed. An imported token with no reliable market price requires a second confirmation and reserves all remaining 24-hour cap capacity; unknown dapp methods are blocked while the cap is active. A user can explicitly set a guard to zero to disable it.
- **Dapp decoding:** the confirmation now decodes common ERC-20 transfer, approval, transfer-from, allowance changes, NFT/operator approvals, wrapped-native deposit/withdrawal, and common Uniswap-style swaps. It displays network, destination, value, gas information, decoded fields and bounded raw calldata. Approvals and unknown/multicall requests receive additional warnings/confirmation.
- **Input validation:** dapp transaction signing checks the selected chain ID, sender, destination, calldata shape/size, nonce, value, gas limit, and EIP-1559 fee fields before signing.

## Remaining risks and limitations

### High priority before a production wallet release

1. **Client-side guardrails are not a cryptographic policy boundary.** The 24-hour history is local app data and can be removed by a rooted device, modified app, or a user who disables the limit. It is a user-protection feature, not a guaranteed on-chain spending policy.
2. **USD values are estimates, not a secure oracle.** CoinGecko can rate-limit, return stale or unavailable data, and market prices for illiquid tokens can be manipulated. The app fails closed when it needs a price and none is available, but a bad price can still distort the USD cap.
3. **Unknown dapp methods are not fully decoded.** When the USD cap is active, unknown/unvalued contract methods are blocked. When the cap is disabled, users can still explicitly confirm unknown calls, but their full effects cannot be guaranteed from calldata alone. Multicalls and arbitrary protocols require protocol-specific decoders and testing.
4. **Approvals are permissions, not immediate transfers.** The wallet flags unlimited approvals and requires an additional confirmation, but it cannot prevent a user from granting a malicious spender permission. Users should prefer exact allowances and revoke permissions they no longer need.
5. **App lock does not replace Android device security.** The device credential is an OS authentication gate and the fallback recovery phrase is checked locally. The underlying wallet seed remains encrypted with Android Keystore, but this change does not bind that encryption key to per-use biometric/device authentication. Use a secure device lock and keep the recovery phrase offline.
6. **Token coverage is EVM ERC-20 only.** This branch does not add SPL-token import/send for Solana, Bitcoin ordinals/assets, or other non-EVM token standards. Native SOL and BTC transfers remain supported.

### Medium priority

7. **Public RPCs can fail or rate-limit.** Chain-ID validation reduces wrong-network mistakes but does not guarantee endpoint availability or transaction inclusion. Production releases should use monitored RPC endpoints and test each supported chain.
8. **Token metadata can be misleading.** Imported name/symbol are local labels. On-chain decimals are checked before sending, but that does not certify a token's issuer, value, liquidity, transfer restrictions, or safety.
9. **Transaction fee estimates can change.** EVM gas estimates and BTC fee-size estimates are approximations; chain congestion and transaction behavior may alter actual fees.
10. **No live-funds test or penetration test was performed.** CI verifies compilation and automated checks only. Before release, exercise each chain on testnet/forked environments, inspect transaction receipts, verify recovery/unlock behavior on real Android devices, and conduct an independent security review.

## Validation

- The repository CI runs the HUMAN app production build, machine-worker typecheck/tests/bundle check, Python compilation/tests, and Android debug APK build.
- Android unit tests cover deterministic wallet derivation, network lookup, and custom-token transfer amount/symbol formatting.
- The final pull-request checks must be green before merge. The signed production APK release and direct download link should be verified separately after release signing.
