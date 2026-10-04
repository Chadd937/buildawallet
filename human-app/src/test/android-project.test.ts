import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { DEFAULT_DRAFT } from "@/lib/catalog";
import { buildAndroidProject } from "@/lib/android-project";

const config = {
  appName: "Mainnet Wallet",
  packageId: "xyz.buildawallet.mainnet",
  versionName: "1.0.0",
  versionCode: 10000,
  walletUrl: "https://buildawallet.xyz/human/wallet",
  blockScreenshots: true,
  allowExternalLinks: true,
};

describe("Android release project", () => {
  it("rejects a non-HTTPS wallet origin", async () => {
    await expect(buildAndroidProject({ ...config, walletUrl: "http://example.com/human/wallet" }, DEFAULT_DRAFT))
      .rejects.toThrow("HTTPS");
  });

  it("contains the production wallet safeguards and build-backup file chooser", async () => {
    const zip = await JSZip.loadAsync(await buildAndroidProject(config, DEFAULT_DRAFT));
    const root = "MainnetWallet/";
    const read = async (path: string) => {
      const entry = zip.file(`${root}${path}`);
      expect(entry, path).not.toBeNull();
      return entry?.async("string") ?? "";
    };

    const activity = await read("app/src/main/java/xyz/buildawallet/mainnet/MainActivity.kt");
    const manifest = await read("app/src/main/AndroidManifest.xml");
    const build = await read("app/build.gradle");
    const workflow = await read(".github/workflows/android-release.yml");

    expect(activity).toContain("onShowFileChooser");
    expect(activity).toContain("onReceivedSslError");
    expect(activity).toContain("web.visibility = View.INVISIBLE");
    expect(manifest).toContain('android:usesCleartextTraffic="false"');
    expect(manifest).toContain('android:allowBackup="false"');
    expect(build).toContain("Release signing is required");
    expect(workflow).toContain("jarsigner -verify -strict");
  });
});
