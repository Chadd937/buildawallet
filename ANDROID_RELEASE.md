# Android wallet release status

The HUMAN website currently produces a wallet **design**, a JSON export and a
detailed implementation plan for free. It does not produce an APK. The root
`build.gradle` and `settings.gradle` are Gradle init placeholders, not an
Android application: there is no Android module, manifest, Kotlin or Java app
source, release signing configuration, or packaged wallet.

The requested deliverable is a **functional, noncustodial Android wallet APK**.
The existing website's `/human/live` page is an optional read-only viewer of an
existing external wallet, not a substitute for the Android app. The local
`agent_protocol.py` signer is a prototype and is not an Android wallet backend.

## Required before an APK can be offered

1. Create a real Android project with an application ID, supported Android
   versions, reproducible dependency locks and release build configuration.
2. Specify the first supported chains and assets, then implement address
   derivation, balances and transaction construction for each. A Studio choice
   is a request in a design spec; it does not imply the corresponding feature
   has been implemented in the app.
3. Implement on-device key generation, protected storage, backup and restore.
   Keep secrets out of the website, Cloudflare Workers, telemetry and logs.
4. Implement transaction review, fee display, destination and chain checks,
   signing on device and broadcast with explicit user approval. Test failure,
   replacement, RPC mismatch and recovery paths using isolated accounts.
5. Add meaningful device and integration tests, an independent security
   review of key handling and transaction signing, then sign the APK with an
   owner-controlled release key. Publish a checksum and a clear distribution
   route after release verification.

No current API plan purchases an APK. The HUMAN design remains free while the
Android implementation is outstanding.

The previously shared `BuildAWallet-1.0.0.apk` is a 9.8 KB signed Android
WebView wrapper. Its bytecode loads `https://buildawallet.xyz/wallet`; it has
no bundled wallet implementation, key handling, signing, or transaction logic.
It must not be offered as a functional wallet release. The Studio finalization
screen therefore provides the design JSON and implementation plan and reports
the Android wallet release as pending.
