# Android wallet release status

The HUMAN website currently produces a wallet **design**, a JSON export and a
detailed implementation plan for free. It does not produce a wallet APK. The
old root Gradle init placeholders and unverified Gradle 4.4.1 wrapper have been
removed. The separate `android-studio/` project is an offline design preview,
not a funded wallet or production release.

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

## Android Studio preview source

`android-studio/` is a separate native Android project that imports HUMAN
Studio design JSON and renders a local concept preview. It has no Internet
permission, private key handling or wallet signing. CI builds its debug APK
as `buildawallet-studio-preview-not-a-wallet` for device testing. This design
companion is not the requested wallet release, and the website must continue
to report that release as pending. See `android-studio/README.md`.

The later uploaded 3.4 MB APK (`buildawallet_a1ccfe16-299e-4a99-bf0d-f1838998c047 (1).apk`)
is a stock Apache Cordova Hello World app with the placeholder package
`com.example.buildawallet`. Its bundled HTML and JavaScript contain no wallet
UI or cryptographic implementation. We did not re-sign or publish it.
