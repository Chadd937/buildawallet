import JSZip from "jszip";
import type { Draft } from "./catalog";
import { skinById } from "./catalog";

export type AndroidConfig = {
  appName: string;
  packageId: string;
  versionName: string;
  versionCode: number;
  walletUrl: string;
  blockScreenshots: boolean;
  allowExternalLinks: boolean;
};

export const validPackage = (p: string) => /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(p);

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "\\'").replace(/"/g, '\\"');

/** Generates a complete Android Studio project that runs the user's wallet build natively-wrapped. */
export async function buildAndroidProject(cfg: AndroidConfig, draft: Draft): Promise<Blob> {
  const walletUrl = new URL(cfg.walletUrl);
  if (walletUrl.protocol !== "https:") throw new Error("Android release builds require an HTTPS wallet URL.");
  const skin = skinById(draft.skin);
  const pkgPath = cfg.packageId.replace(/\./g, "/");
  const host = walletUrl.host;
  const zip = new JSZip();
  const root = zip.folder(cfg.appName.replace(/[^A-Za-z0-9]/g, "") || "Wallet");
  if (!root) throw new Error("Could not create the Android project.");

  root.file("settings.gradle", `pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name = "${cfg.appName.replace(/"/g, "")}"
include ':app'
`);
  root.file("build.gradle", `plugins {
  id 'com.android.application' version '8.7.3' apply false
  id 'org.jetbrains.kotlin.android' version '2.0.21' apply false
}
`);
  root.file("gradle.properties", "org.gradle.jvmargs=-Xmx2048m\nandroid.useAndroidX=true\nkotlin.code.style=official\nandroid.nonTransitiveRClass=true\n");
  root.file(".gitignore", "*.iml\n.gradle\n/local.properties\n/.idea\n/build\n/app/build\n*.jks\n*.keystore\nkeystore.properties\n");

  root.file("app/build.gradle", `plugins { id 'com.android.application'; id 'org.jetbrains.kotlin.android' }

def ksFile = rootProject.file("keystore.properties")
def ks = new Properties()
if (ksFile.exists()) ks.load(new FileInputStream(ksFile))
def releaseKeystore = ks['storeFile'] ?: System.getenv('ANDROID_KEYSTORE_PATH')
def releaseStorePassword = ks['storePassword'] ?: System.getenv('ANDROID_KEYSTORE_PASSWORD')
def releaseAlias = ks['keyAlias'] ?: System.getenv('ANDROID_KEY_ALIAS')
def releaseKeyPassword = ks['keyPassword'] ?: System.getenv('ANDROID_KEY_PASSWORD')
def releaseReady = releaseKeystore && releaseStorePassword && releaseAlias && releaseKeyPassword

android {
  namespace '${cfg.packageId}'
  compileSdk 35
  defaultConfig {
    applicationId '${cfg.packageId}'
    minSdk 26
    targetSdk 35
    versionCode ${cfg.versionCode}
    versionName '${cfg.versionName}'
    buildConfigField "String", "WALLET_URL", '"${cfg.walletUrl}"'
    buildConfigField "String", "WALLET_HOST", '"${host}"'
    buildConfigField "boolean", "BLOCK_SCREENSHOTS", "${cfg.blockScreenshots}"
    buildConfigField "boolean", "ALLOW_EXTERNAL", "${cfg.allowExternalLinks}"
  }
  signingConfigs {
    release {
      if (releaseReady) {
        storeFile file(releaseKeystore)
        storePassword releaseStorePassword
        keyAlias releaseAlias
        keyPassword releaseKeyPassword
      }
    }
  }
  buildTypes {
    release {
      minifyEnabled true
      shrinkResources true
      proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
      if (releaseReady) signingConfig signingConfigs.release
    }
  }
  buildFeatures { buildConfig true }
  compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }
  kotlinOptions { jvmTarget = '17' }
}

gradle.taskGraph.whenReady { graph ->
  if (graph.allTasks.any { it.name.toLowerCase().contains('release') } && !releaseReady) {
    throw new GradleException('Release signing is required. Configure keystore.properties or the ANDROID_KEYSTORE_* environment variables.')
  }
}

dependencies {
  implementation 'androidx.core:core-ktx:1.15.0'
  implementation 'androidx.appcompat:appcompat:1.7.0'
  implementation 'androidx.webkit:webkit:1.12.1'
  implementation 'androidx.biometric:biometric:1.1.0'
  implementation 'androidx.swiperefreshlayout:swiperefreshlayout:1.1.0'
}
`);
  root.file("app/proguard-rules.pro", "-keep class androidx.webkit.** { *; }\n");

  root.file("app/src/main/AndroidManifest.xml", `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.USE_BIOMETRIC" />
  <application
    android:allowBackup="false"
    android:fullBackupContent="false"
    android:dataExtractionRules="@xml/data_extraction_rules"
    android:label="@string/app_name"
    android:icon="@mipmap/ic_launcher"
    android:theme="@style/Theme.Wallet"
    android:networkSecurityConfig="@xml/network_security_config"
    android:usesCleartextTraffic="false">
    <activity android:name=".MainActivity" android:exported="true" android:configChanges="orientation|screenSize|keyboardHidden" android:launchMode="singleTask">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>
`);
  root.file("app/src/main/res/xml/network_security_config.xml", `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors><certificates src="system" /></trust-anchors>
  </base-config>
</network-security-config>
`);
  root.file("app/src/main/res/xml/data_extraction_rules.xml", `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup><exclude domain="root" /><exclude domain="database" /><exclude domain="sharedpref" /></cloud-backup>
  <device-transfer><exclude domain="root" /><exclude domain="database" /></device-transfer>
</data-extraction-rules>
`);
  root.file("app/src/main/res/values/strings.xml", `<resources><string name="app_name">${xmlEscape(cfg.appName)}</string><string name="unlock_title">Unlock ${xmlEscape(cfg.appName)}</string></resources>\n`);
  root.file("app/src/main/res/values/colors.xml", `<resources><color name="bg">${skin.bg}</color><color name="accent">${skin.accent}</color><color name="text">${skin.text}</color></resources>\n`);
  root.file("app/src/main/res/values/themes.xml", `<resources>
  <style name="Theme.Wallet" parent="Theme.AppCompat.NoActionBar">
    <item name="android:windowBackground">@color/bg</item>
    <item name="android:statusBarColor">@color/bg</item>
    <item name="android:navigationBarColor">@color/bg</item>
    <item name="colorAccent">@color/accent</item>
  </style>
</resources>
`);
  // Adaptive launcher icon from the skin colors
  root.file("app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml", `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/bg" />
  <foreground android:drawable="@drawable/ic_fg" />
</adaptive-icon>
`);
  root.file("app/src/main/res/drawable/ic_fg.xml", `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
  <path android:fillColor="@color/accent" android:pathData="M30,38h48a6,6 0,0 1,6 6v26a6,6 0,0 1,-6 6h-48a6,6 0,0 1,-6 -6v-26a6,6 0,0 1,6 -6z" />
  <path android:fillColor="@color/bg" android:pathData="M64,52h20v10h-20a5,5 0,0 1,0 -10z" />
</vector>
`);

  root.file(`app/src/main/java/${pkgPath}/MainActivity.kt`, `package ${cfg.packageId}

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.*
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

/**
 * Hosts the user's BuildAWallet build. Keys are generated and AES-256 encrypted
 * inside this app's private WebView storage; they never leave the device.
 * Device biometrics gate every app open; app data is excluded from cloud backups.
 */
class MainActivity : AppCompatActivity() {
  private lateinit var web: WebView
  private var unlocked = false
  private var pendingFile: ValueCallback<Array<Uri>>? = null
  private val chooseFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
    val callback = pendingFile
    pendingFile = null
    callback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
  }

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (BuildConfig.BLOCK_SCREENSHOTS) window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)

    web = WebView(this)
    val refresh = SwipeRefreshLayout(this).apply { addView(web); setOnRefreshListener { web.reload(); isRefreshing = false } }
    setContentView(refresh)

    with(web.settings) {
      javaScriptEnabled = true
      domStorageEnabled = true
      databaseEnabled = true
      allowFileAccess = false
      allowContentAccess = false
      mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
      setSupportMultipleWindows(false)
      mediaPlaybackRequiresUserGesture = true
      safeBrowsingEnabled = true
      userAgentString = userAgentString + " BuildAWalletAndroid/" + BuildConfig.VERSION_NAME
    }
    CookieManager.getInstance().setAcceptThirdPartyCookies(web, false)
    WebView.setWebContentsDebuggingEnabled(false)
    web.webChromeClient = object : WebChromeClient() {
      override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
        pendingFile?.onReceiveValue(null)
        pendingFile = callback
        return try { chooseFile.launch(params.createIntent()); true } catch (_: Exception) { pendingFile = null; callback.onReceiveValue(null); false }
      }
    }
    web.webViewClient = object : WebViewClient() {
      override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
        val uri = req.url
        if (uri.scheme == "https" && uri.host == BuildConfig.WALLET_HOST) return false
        if (BuildConfig.ALLOW_EXTERNAL && uri.scheme == "https") startActivity(Intent(Intent.ACTION_VIEW, uri))
        return true
      }
      override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: android.net.http.SslError) { handler.cancel() }
    }
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() { if (web.canGoBack()) web.goBack() else finish() }
    })
    if (savedInstanceState != null) web.restoreState(savedInstanceState)
  }

  override fun onStart() {
    super.onStart()
    if (!unlocked) authenticate()
  }

  override fun onStop() {
    unlocked = false
    web.visibility = View.INVISIBLE
    super.onStop()
  }

  private fun authenticate() {
    val can = BiometricManager.from(this).canAuthenticate(
      BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL)
    if (can != BiometricManager.BIOMETRIC_SUCCESS) { open(); return }
    BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
      override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { open() }
      override fun onAuthenticationError(code: Int, msg: CharSequence) { finish() }
    }).authenticate(BiometricPrompt.PromptInfo.Builder()
      .setTitle(getString(R.string.unlock_title))
      .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL)
      .build())
  }

  private fun open() {
    if (unlocked) return
    unlocked = true
    web.visibility = View.VISIBLE
    if (web.url == null) web.loadUrl(BuildConfig.WALLET_URL)
  }

  override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); web.saveState(outState) }
  override fun onDestroy() { pendingFile?.onReceiveValue(null); pendingFile = null; web.destroy(); super.onDestroy() }
}
`);

  root.file(".github/workflows/android-release.yml", `name: Android release
on:
  workflow_dispatch:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '17' }
      - uses: gradle/actions/setup-gradle@v3
        with: { gradle-version: '8.9' }
      - name: Decode keystore
        run: echo "\${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > \${{ runner.temp }}/release.jks
      - name: Build signed APK + AAB
        env:
          ANDROID_KEYSTORE_PATH: \${{ runner.temp }}/release.jks
          ANDROID_KEYSTORE_PASSWORD: \${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          ANDROID_KEY_ALIAS: \${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: \${{ secrets.ANDROID_KEY_PASSWORD }}
        run: gradle assembleRelease bundleRelease
      - name: Verify signed release artifacts
        run: |
          test -s app/build/outputs/apk/release/app-release.apk
          test -s app/build/outputs/bundle/release/app-release.aab
          jarsigner -verify -strict app/build/outputs/apk/release/app-release.apk
          jarsigner -verify -strict app/build/outputs/bundle/release/app-release.aab
      - name: Checksums
        run: sha256sum app/build/outputs/apk/release/*.apk app/build/outputs/bundle/release/*.aab > SHA256SUMS.txt
      - uses: softprops/action-gh-release@v2
        if: startsWith(github.ref, 'refs/tags/')
        with:
          files: |
            app/build/outputs/apk/release/*.apk
            app/build/outputs/bundle/release/*.aab
            SHA256SUMS.txt
      - uses: actions/upload-artifact@v4
        with: { name: release, path: "app/build/outputs/**/release/*\\nSHA256SUMS.txt" }
`);

  root.file("README.md", `# ${cfg.appName}: Android build

Generated by BuildAWallet Studio. Package \`${cfg.packageId}\` · v${cfg.versionName} (${cfg.versionCode}).

The app opens your wallet build at ${cfg.walletUrl}. It uses the same mainnet chains, wallet creation, phrase restore, build-backup import, Studio-selected features and Byte guide as the web wallet. Keys are created and AES-256 encrypted inside the app's private storage and never leave the phone.
Biometric or device-PIN unlock is required whenever the app returns from the background${cfg.blockScreenshots ? ", screenshots and screen recording are blocked" : ""}, cleartext traffic and invalid TLS are rejected, debugging is disabled, and app data is excluded from cloud backup and device transfer.

## Option A: Android Studio (local)
1. Open this folder in Android Studio (Koala or newer). Let it sync.
2. Build > Generate Signed Bundle / APK > APK > create or choose your keystore.
3. Install \`app/release/app-release.apk\` on your phone.

## Option B: GitHub Actions (automatic signed releases)
1. Push this folder to a GitHub repo.
2. Create a keystore once: \`keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 4096 -validity 10000 -alias wallet\`
3. Add repo secrets: ANDROID_KEYSTORE_BASE64 (\`base64 -w0 release.jks\`), ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.
4. Push a tag like \`v${cfg.versionName}\`. A signed APK, AAB and SHA256SUMS appear on the GitHub release.

Keep your keystore safe. Losing it means you can't ship updates under the same package.

## Production checklist
- Publish the HTTPS wallet URL before generating this project; never ship an app pointed at a preview URL.
- Test create, phrase restore, build-backup import, receive, and a small funded send on every enabled chain using the release APK.
- Keep the signing keystore offline and retain SHA256SUMS.txt with each release.
`);

  return zip.generateAsync({ type: "blob" });
}
