# BuildAWallet Android Studio preview

This is the first **native Android source project** for the HUMAN design flow.
It imports the JSON exported from `/human/studio`, displays a local phone
preview, and keeps only sanitized visual choices in private app storage.
It has no network permission, no WebView, no wallet keys and no signing.

The uploaded 3.4 MB APK was an unmodified Cordova Hello World template with
the placeholder `com.example.buildawallet` identity and permissive navigation.
It does not contain an Android wallet or original source project. This source
project was created independently; it is not a decoded/re-signed variant of
the uploaded APK.

## Build the preview on a machine with Android SDK

Open `android-studio/` in Android Studio or use JDK 17+, Gradle 8.13+,
Android SDK platform 35 and Android Gradle Plugin 8.13.2:

```bash
cd ~/buildawallet/android-studio
gradle :app:assembleDebug
# Local debug preview: app/build/outputs/apk/debug/app-debug.apk
```

Install only on a test phone. Export JSON from the HUMAN Studio, then tap
**Import Studio blueprint** and select that JSON with the Android file picker.
The preview has a distinct `xyz.buildawallet.studio` package and cannot be
confused with a production wallet release.

## Release boundary

No APK from this project is a funded wallet yet. Do not put its debug build
behind the website's wallet download button. The production wallet requires
on-device key generation, encrypted storage and recovery, chain-specific
address derivation, transaction construction, review and signing, RPC checks,
device testing, independent security review and owner-controlled signing.
The Studio may offer Base, Solana, Bitcoin and other choices; those remain
design choices until each implementation is independently verified.
