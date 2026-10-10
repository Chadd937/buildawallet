package xyz.buildawallet.studio;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.app.KeyguardManager;
import android.net.Uri;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int BG = 0xff070a14;
    private static final int CARD = 0xff121827;
    private static final int TEXT = 0xfff5f7fb;
    private static final int MUTED = 0xff9aabc3;
    private static final int WARNING = 0xffffd38a;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private static final int REQUEST_DEVICE_UNLOCK = 7101;
    private volatile boolean walletLocked;
    private boolean unlockInProgress;
    private final Runnable autoLockRunnable = () -> lockWallet(true);

    private SecureSeedStore seedStore;
    private WalletProfile profile;
    private WalletEngine engine;
    private NonEvmEngine nonEvm;
    private LinearLayout content;
    private TextView balanceView;
    private TextView assetBalanceView;
    private TextView statusView;
    private Spinner networkSpinner;
    private List<EvmNetwork> enabledNetworks;
    private EvmNetwork selectedNetwork;
    private WebView dappWebView;
    private AlertDialog dappDialog;

    private int setupStep = 0;
    private String pendingName = "My Wallet";
    private String pendingTheme = "Acid Vault";
    private final LinkedHashSet<String> pendingNetworks = new LinkedHashSet<>();
    private String pendingMnemonic;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);

        seedStore = new SecureSeedStore(this);
        walletLocked = seedStore.exists();
        profile = WalletProfile.load(this);
        resetPendingFromProfile();

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BG);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(20), dp(28), dp(20), dp(36));
        scroll.addView(content);
        setContentView(scroll);

        render();
    }

    @Override public void onUserInteraction() {
        super.onUserInteraction();
        scheduleAutoLock();
    }

    @Override protected void onStop() {
        super.onStop();
        if (!unlockInProgress && seedStore != null && seedStore.exists()) lockWallet(false);
    }

    @Override protected void onResume() {
        super.onResume();
        if (seedStore != null && seedStore.exists() && walletLocked && content != null) render();
        else scheduleAutoLock();
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_DEVICE_UNLOCK) return;
        unlockInProgress = false;
        if (resultCode == Activity.RESULT_OK) {
            walletLocked = false;
            render();
            scheduleAutoLock();
        } else {
            walletLocked = true;
            engine = null;
            nonEvm = null;
            render();
        }
    }

    @Override protected void onDestroy() {
        mainHandler.removeCallbacks(autoLockRunnable);
        io.shutdownNow();
        super.onDestroy();
    }

    private void render() {
        content.removeAllViews();
        if (seedStore.exists()) {
            if (walletLocked) renderLocked();
            else renderWallet();
        } else renderOnboarding();
    }

    private void scheduleAutoLock() {
        mainHandler.removeCallbacks(autoLockRunnable);
        if (walletLocked || seedStore == null || !seedStore.exists() || profile == null) return;
        long timeout = Math.max(1, profile.autoLockMin) * 60_000L;
        mainHandler.postDelayed(autoLockRunnable, timeout);
    }

    private void lockWallet(boolean redraw) {
        mainHandler.removeCallbacks(autoLockRunnable);
        if (seedStore == null || !seedStore.exists()) return;
        walletLocked = true;
        engine = null;
        nonEvm = null;
        if (dappDialog != null) dappDialog.dismiss();
        if (redraw && content != null) render();
    }

    private void renderLocked() {
        content.addView(label("BUILDAWALLET  /  LOCKED", 11, activeAccent(), true));
        add(label("Your wallet is locked.", 32, TEXT, true), 12);
        add(label("The in-memory signing engines have been cleared. Authenticate with your Android device credential, or verify your recovery phrase if this device has no secure screen lock.", 14, MUTED, false), 16);
        Button unlock = button("Unlock wallet", true);
        unlock.setOnClickListener(v -> requestWalletUnlock());
        add(unlock, 14);
        add(notice("Never share your recovery phrase. The app will only compare it locally with the encrypted wallet to unlock this device."), 12);
    }

    private void requestWalletUnlock() {
        KeyguardManager keyguard = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        if (keyguard != null && keyguard.isDeviceSecure()) {
            Intent intent = keyguard.createConfirmDeviceCredentialIntent("Unlock BuildAWallet", "Authenticate to access your wallet");
            if (intent != null) {
                unlockInProgress = true;
                startActivityForResult(intent, REQUEST_DEVICE_UNLOCK);
                return;
            }
        }
        LinearLayout box = dialogBox();
        EditText phrase = input("Enter your recovery phrase");
        phrase.setSingleLine(false);
        phrase.setMinLines(3);
        phrase.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        box.addView(phrase);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Unlock with recovery phrase")
            .setMessage("Use this fallback only if your Android device has no secure screen lock. The phrase is verified locally and is not sent anywhere.")
            .setView(box).setNegativeButton("Cancel", null).setPositiveButton("Unlock", null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> io.execute(() -> {
            try {
                boolean matches = seedStore.matchesMnemonic(phrase.getText().toString());
                runOnUiThread(() -> {
                    if (matches) {
                        dialog.dismiss();
                        walletLocked = false;
                        render();
                        scheduleAutoLock();
                    } else showError("Unlock failed", new IllegalArgumentException("Recovery phrase does not match this wallet."));
                });
            } catch (Exception error) {
                runOnUiThread(() -> showError("Unlock failed", error));
            }
        })));
        dialog.show();
    }

    private void renderOnboarding() {
        switch (setupStep) {
            case 1: renderIdentity(); break;
            case 2: renderNetworks(); break;
            case 3: renderCreateOrRestore(); break;
            case 4: renderBackup(); break;
            case 5: renderBackupConfirmation(); break;
            default: renderWelcome();
        }
    }

    private void renderWelcome() {
        content.addView(label("BUILDAWALLET  /  ANDROID", 11, activeAccent(), true));
        add(label("Build your wallet on this phone.", 36, TEXT, true), 10);
        add(label(
            "Create a self-custody wallet from start to finish inside the app. Choose its name, look and networks, then create a new recovery phrase or restore one you already control.",
            15, MUTED, false), 12);

        LinearLayout card = card();
        card.addView(label("Your keys stay with you", 18, TEXT, true));
        addTo(card, label("Recovery material is encrypted with Android Keystore. Transactions are reviewed and signed on-device.", 13, MUTED, false), 8);
        add(card, 24);

        Button start = button("Build my wallet", true);
        start.setOnClickListener(v -> {
            setupStep = 1;
            render();
        });
        add(start, 22);

        add(notice("BuildAWallet does not have your recovery phrase and cannot recover it. Write it down offline before funding the wallet."), 20);
    }

    private void renderIdentity() {
        stepHeader("01 / 04", "Identity", "Make it yours.",
            "Choose the wallet name and visual theme used inside the Android app.");

        EditText name = input("My Wallet");
        name.setSingleLine(true);
        name.setText(pendingName);
        name.setSelection(name.getText().length());
        add(name, 18);

        Spinner theme = new Spinner(this);
        ArrayAdapter<String> themeAdapter = new ArrayAdapter<>(
            this, android.R.layout.simple_spinner_dropdown_item, WalletProfile.THEMES);
        theme.setAdapter(themeAdapter);
        theme.setSelection(Math.max(0, WalletProfile.themeIndex(pendingTheme)));
        add(theme, 12);

        Button next = button("Choose networks", true);
        next.setOnClickListener(v -> {
            String clean = name.getText().toString().trim();
            if (clean.isEmpty()) {
                showError("Wallet name required", new IllegalArgumentException("Give your wallet a name."));
                return;
            }
            pendingName = clean.length() > 40 ? clean.substring(0, 40) : clean;
            pendingTheme = String.valueOf(theme.getSelectedItem());
            setupStep = 2;
            render();
        });
        add(next, 22);

        Button back = button("Back", false);
        back.setOnClickListener(v -> {
            setupStep = 0;
            render();
        });
        add(back, 10);
    }

    private void renderNetworks() {
        stepHeader("02 / 04", "Networks", "Pick your mainnets.",
            "One EVM account works across the selected networks. You can change this list later in wallet settings.");

        for (EvmNetwork network : EvmNetwork.all()) {
            CheckBox box = new CheckBox(this);
            box.setText(network.name + "  ·  " + network.symbol);
            box.setTextColor(TEXT);
            box.setTextSize(15);
            box.setPadding(dp(8), dp(8), dp(8), dp(8));
            box.setChecked(pendingNetworks.contains(network.name));
            box.setOnCheckedChangeListener((buttonView, checked) -> {
                if (checked) pendingNetworks.add(network.name);
                else pendingNetworks.remove(network.name);
            });
            add(box, 7);
        }

        Button next = button("Continue", true);
        next.setOnClickListener(v -> {
            if (pendingNetworks.isEmpty()) {
                showError("Choose a network", new IllegalArgumentException("Select at least one supported mainnet."));
                return;
            }
            setupStep = 3;
            render();
        });
        add(next, 22);

        Button back = button("Back", false);
        back.setOnClickListener(v -> {
            setupStep = 1;
            render();
        });
        add(back, 10);
    }

    private void renderCreateOrRestore() {
        stepHeader("03 / 04", "Keys", "Create or restore.",
            "Your wallet profile is ready. Now create new wallet keys on this phone or restore an existing BIP-39 recovery phrase.");

        LinearLayout summary = card();
        summary.addView(label(pendingName, 21, TEXT, true));
        addTo(summary, label(pendingTheme + " · " + pendingNetworks.size() + " network" + (pendingNetworks.size() == 1 ? "" : "s"), 13, MUTED, false), 5);
        addTo(summary, label(joinNetworks(new ArrayList<>(pendingNetworks)), 12, MUTED, false), 8);
        add(summary, 20);

        Button create = button("Create new wallet", true);
        create.setOnClickListener(v -> {
            try {
                pendingMnemonic = seedStore.generateMnemonic();
                setupStep = 4;
                render();
            } catch (Exception error) {
                showError("Could not create wallet", error);
            }
        });
        add(create, 18);

        Button restore = button("Restore existing wallet", false);
        restore.setOnClickListener(v -> restoreWalletDialog());
        add(restore, 10);

        Button back = button("Back", false);
        back.setOnClickListener(v -> {
            setupStep = 2;
            render();
        });
        add(back, 10);

        add(notice("Never enter a recovery phrase into a website, support chat, email or message. Restore it only inside the installed wallet app."), 20);
    }

    private void renderBackup() {
        if (pendingMnemonic == null) {
            setupStep = 3;
            render();
            return;
        }

        stepHeader("04 / 04", "Backup", "Write down these 12 words.",
            "Write them on paper in order and store them somewhere private. Screenshots are blocked by the app.");

        TextView words = label(numberedMnemonic(pendingMnemonic), 17, TEXT, true);
        words.setTextIsSelectable(false);
        words.setPadding(dp(18), dp(18), dp(18), dp(18));
        words.setBackground(pill(CARD, activeAccent()));
        add(words, 20);

        add(notice("Anyone with these words controls the wallet. BuildAWallet cannot recover them for you."), 16);

        Button verify = button("I wrote them down · verify backup", true);
        verify.setOnClickListener(v -> {
            setupStep = 5;
            render();
        });
        add(verify, 22);

        Button cancel = button("Cancel new wallet", false);
        cancel.setOnClickListener(v -> {
            pendingMnemonic = null;
            setupStep = 3;
            render();
        });
        add(cancel, 10);
    }

    private void renderBackupConfirmation() {
        if (pendingMnemonic == null) {
            setupStep = 3;
            render();
            return;
        }

        String[] words = pendingMnemonic.split(" ");
        int[] positions = {2, 6, 10};

        stepHeader("BACKUP CHECK", "Recovery", "Confirm three words.",
            "This confirms that your offline backup was written down before the wallet is activated.");

        EditText first = input("Word #" + (positions[0] + 1));
        EditText second = input("Word #" + (positions[1] + 1));
        EditText third = input("Word #" + (positions[2] + 1));
        first.setSingleLine(true);
        second.setSingleLine(true);
        third.setSingleLine(true);
        add(first, 18);
        add(second, 10);
        add(third, 10);

        Button finish = button("Activate wallet", true);
        finish.setOnClickListener(v -> {
            if (!wordMatches(first, words[positions[0]])
                || !wordMatches(second, words[positions[1]])
                || !wordMatches(third, words[positions[2]])) {
                showError("Backup check failed", new IllegalArgumentException("One or more words do not match. Check your written backup and try again."));
                return;
            }
            try {
                seedStore.importMnemonic(pendingMnemonic);
                profile = buildPendingProfile();
                profile.save(this);
                pendingMnemonic = null;
                setupStep = 0;
                Toast.makeText(this, "Wallet created", Toast.LENGTH_SHORT).show();
                render();
            } catch (Exception error) {
                showError("Could not activate wallet", error);
            }
        });
        add(finish, 22);

        Button back = button("Back to recovery phrase", false);
        back.setOnClickListener(v -> {
            setupStep = 4;
            render();
        });
        add(back, 10);
    }

    private void restoreWalletDialog() {
        EditText phrase = input("twelve or twenty-four words");
        phrase.setMinLines(4);
        phrase.setGravity(Gravity.TOP);
        phrase.setInputType(InputType.TYPE_CLASS_TEXT
            | InputType.TYPE_TEXT_FLAG_MULTI_LINE
            | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);

        LinearLayout box = dialogBox();
        box.addView(phrase);

        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Restore wallet")
            .setMessage("Enter the BIP-39 recovery phrase. It is processed only on this device.")
            .setView(box)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Restore", null)
            .create();

        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try {
                seedStore.importMnemonic(phrase.getText().toString());
                profile = buildPendingProfile();
                profile.save(this);
                setupStep = 0;
                dialog.dismiss();
                Toast.makeText(this, "Wallet restored", Toast.LENGTH_SHORT).show();
                render();
            } catch (Exception error) {
                showError("Could not restore wallet", error);
            }
        }));
        dialog.show();
    }

    private void renderWallet() {
        try {
            String mnemonic = seedStore.loadMnemonic();
            engine = WalletEngine.fromMnemonic(mnemonic);
            nonEvm = NonEvmEngine.fromMnemonic(mnemonic);
        } catch (Exception error) {
            showError("Could not unlock wallet", error);
            return;
        }

        profile = WalletProfile.load(this);
        enabledNetworks = EvmNetwork.fromRequested(profile.networks);
        if (selectedNetwork == null || !enabledNetworks.contains(selectedNetwork)) {
            selectedNetwork = enabledNetworks.get(0);
        }

        int accent = activeAccent();

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        TextView brand = label("BUILDAWALLET", 11, accent, true);
        TextView custody = label("SELF CUSTODY", 10, 0xffd5d9e2, true);
        custody.setGravity(Gravity.CENTER);
        custody.setPadding(dp(10), dp(7), dp(10), dp(7));
        custody.setBackground(pill(0xff111318, 0xff292c33));
        top.addView(brand, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        top.addView(custody);
        content.addView(top);

        add(label(profile.name, 30, TEXT, true), 18);
        add(label(shortAddress(engine.address()) + "  ·  " + enabledNetworks.size() + " enabled network" + (enabledNetworks.size() == 1 ? "" : "s"), 12, MUTED, false), 5);

        TextView networkPicker = label(selectedNetwork.name + "   •   " + selectedNetwork.symbol + "   ▾", 13, TEXT, true);
        networkPicker.setGravity(Gravity.CENTER_VERTICAL);
        networkPicker.setPadding(dp(14), dp(11), dp(14), dp(11));
        networkPicker.setBackground(pill(0xff101216, 0xff2b2e35));
        networkPicker.setOnClickListener(v -> selectNetworkDialog());
        add(networkPicker, 18);

        LinearLayout balanceCard = card();
        balanceCard.setPadding(dp(20), dp(22), dp(20), dp(22));
        balanceCard.setBackground(pill(0xff111216, accent));
        balanceCard.addView(label("PORTFOLIO · " + selectedNetwork.name.toUpperCase(), 11, MUTED, true));
        balanceView = label("—", 42, TEXT, true);
        addTo(balanceCard, balanceView, 8);
        addTo(balanceCard, label("Native asset balance · live mainnet RPC", 12, MUTED, false), 4);
        add(balanceCard, 16);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER);
        actions.addView(walletAction("↑", "Send", v -> sendDialog()), new LinearLayout.LayoutParams(0, dp(78), 1f));
        LinearLayout.LayoutParams actionGap = new LinearLayout.LayoutParams(0, dp(78), 1f);
        actionGap.leftMargin = dp(8);
        actions.addView(walletAction("↓", "Receive", v -> receiveDialog()), actionGap);
        LinearLayout.LayoutParams actionGap2 = new LinearLayout.LayoutParams(0, dp(78), 1f);
        actionGap2.leftMargin = dp(8);
        actions.addView(walletAction("⧉", "Copy", v -> copyAddress()), actionGap2);
        LinearLayout.LayoutParams actionGap3 = new LinearLayout.LayoutParams(0, dp(78), 1f);
        actionGap3.leftMargin = dp(8);
        actions.addView(walletAction("◎", "Networks", v -> selectNetworkDialog()), actionGap3);
        LinearLayout.LayoutParams actionGap4 = new LinearLayout.LayoutParams(0, dp(78), 1f);
        actionGap4.leftMargin = dp(8);
        actions.addView(walletAction("✦", "Byte AI", v -> showByteChat()), actionGap4);
        LinearLayout.LayoutParams actionGap5 = new LinearLayout.LayoutParams(0, dp(78), 1f); actionGap5.leftMargin = dp(8);
        actions.addView(walletAction("◈", "Dapps", v -> showDapps()), actionGap5);
        add(actions, 14);

        add(sectionTitle("Assets", "Live balance on the selected network"), 28);
        LinearLayout assetCard = card();
        assetCard.setBackground(pill(0xff0f1115, 0xff24272e));
        LinearLayout assetRow = new LinearLayout(this);
        assetRow.setOrientation(LinearLayout.HORIZONTAL);
        assetRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView tokenIcon = label("U", 16, 0xff080a0d, true);
        tokenIcon.setGravity(Gravity.CENTER);
        tokenIcon.setBackground(pill(accent, accent));
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dp(42), dp(42));
        assetRow.addView(tokenIcon, iconParams);

        LinearLayout assetMeta = new LinearLayout(this);
        assetMeta.setOrientation(LinearLayout.VERTICAL);
        assetMeta.setPadding(dp(12), 0, 0, 0);
        TextView nativeLink = label("USDC · USD Coin ↗", 16, TEXT, true);
        nativeLink.setOnClickListener(v -> openExternal(usdcInfoUrl(selectedNetwork)));
        assetMeta.addView(nativeLink);
        TextView nativeInfo = label("Stablecoin balance · token contract details", 11, MUTED, false);
        nativeInfo.setOnClickListener(v -> openExternal(usdcInfoUrl(selectedNetwork)));
        assetMeta.addView(nativeInfo);
        assetRow.addView(assetMeta, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        assetBalanceView = label("—", 15, TEXT, true);
        assetBalanceView.setGravity(Gravity.END);
        assetBalanceView.setOnClickListener(v -> openExternal(usdcInfoUrl(selectedNetwork)));
        assetRow.addView(assetBalanceView);
        assetCard.addView(assetRow);
        add(assetCard, 10);
        addCustomTokensSection();

        add(sectionTitle("Solana & Bitcoin", "Native accounts derived from the same recovery phrase"), 28);
        LinearLayout nonEvmCard = card();
        nonEvmCard.setBackground(pill(0xff0f1115, 0xff24272e));
        nonEvmCard.addView(label("SOLANA", 10, MUTED, true));
        TextView solAddress = label(nonEvm == null ? "Unavailable" : nonEvm.solanaAddress(), 12, TEXT, true);
        solAddress.setTextIsSelectable(true);
        addTo(nonEvmCard, solAddress, 7);
        TextView solBalance = label("Loading…", 13, MUTED, true);
        addTo(nonEvmCard, solBalance, 5);
        TextView solInfo = label("SOL token info ↗", 11, MUTED, false); solInfo.setOnClickListener(v -> openExternal("https://www.coingecko.com/en/coins/solana")); addTo(nonEvmCard, solInfo, 5);
        Button solSend = button("Send SOL", false);
        solSend.setOnClickListener(v -> sendSolanaDialog());
        addTo(nonEvmCard, solSend, 10);
        addTo(nonEvmCard, label("BITCOIN", 10, MUTED, true), 12);
        TextView btcAddress = label(nonEvm == null ? "Unavailable" : nonEvm.bitcoinAddress(), 12, TEXT, true);
        btcAddress.setTextIsSelectable(true);
        addTo(nonEvmCard, btcAddress, 7);
        TextView btcBalance = label("Loading…", 13, MUTED, true);
        addTo(nonEvmCard, btcBalance, 5);
        TextView btcInfo = label("BTC token info ↗", 11, MUTED, false); btcInfo.setOnClickListener(v -> openExternal("https://www.coingecko.com/en/coins/bitcoin")); addTo(nonEvmCard, btcInfo, 5);
        Button btcSend = button("Send BTC", false);
        btcSend.setOnClickListener(v -> sendBitcoinDialog());
        addTo(nonEvmCard, btcSend, 10);
        add(nonEvmCard, 10);
        refreshNonEvm(solBalance, btcBalance);

        add(sectionTitle("Receive", "Your on-chain account"), 28);
        LinearLayout addressCard = card();
        addressCard.setBackground(pill(0xff0f1115, 0xff24272e));
        addressCard.addView(label("ADDRESS", 10, MUTED, true));
        TextView addressView = label(engine.address(), 12, TEXT, true);
        addressView.setTextIsSelectable(true);
        addTo(addressCard, addressView, 8);
        TextView addressHint = label("Use this EVM address on the selected supported network. Always verify the sender is using the same network.", 11, MUTED, false);
        addTo(addressCard, addressHint, 10);
        Button copyAddress = button("Copy address", false);
        copyAddress.setOnClickListener(v -> copyAddress());
        addTo(addressCard, copyAddress, 12);
        add(addressCard, 10);

        add(sectionTitle("Security", "Local signing and wallet controls"), 28);
        LinearLayout securityCard = card();
        securityCard.setBackground(pill(0xff0f1115, 0xff24272e));
        securityCard.addView(statusLine("●", "On-device signing", "Private keys never leave this phone", 0xff50d890));
        addTo(securityCard, statusLine("●", "Encrypted recovery", "Protected by Android Keystore", 0xff50d890), 12);
        addTo(securityCard, statusLine("●", "Mainnet verification", "RPC chain ID checked before signing", 0xff50d890), 12);
        add(securityCard, 10);

        statusView = label("Connecting…", 11, MUTED, false);
        statusView.setPadding(dp(12), dp(10), dp(12), dp(10));
        statusView.setBackground(pill(0xff0d0f12, 0xff20232a));
        add(statusView, 14);

        LinearLayout settingsRow = new LinearLayout(this);
        settingsRow.setOrientation(LinearLayout.HORIZONTAL);
        Button settings = button("Wallet settings", false);
        settings.setOnClickListener(v -> settingsDialog());
        Button backup = button("Recovery phrase", false);
        backup.setOnClickListener(v -> backupDialog());
        settingsRow.addView(settings, new LinearLayout.LayoutParams(0, dp(52), 1f));
        LinearLayout.LayoutParams backupParams = new LinearLayout.LayoutParams(0, dp(52), 1f);
        backupParams.leftMargin = dp(10);
        settingsRow.addView(backup, backupParams);
        add(settingsRow, 18);

        Button reset = button("Erase wallet from this phone", false);
        reset.setTextColor(0xffff8f9a);
        reset.setOnClickListener(v -> confirmReset());
        add(reset, 10);

        add(notice("Review the network, destination, amount and network fee before every send. Mainnet transactions are irreversible."), 18);
        refreshBalance();
    }

    private String usdcInfoUrl(EvmNetwork network) {
        String address;
        switch ((int) network.chainId) {
            case 1: address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; break;
            case 8453: address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; break;
            case 42161: address = "0xaf88d065e77c8C2239327C5EDb3A432268e5831"; break;
            case 10: address = "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85"; break;
            case 137: address = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"; break;
            case 56: address = "0x8AC76a51cc950982D68b83f1D09cd849c35F18"; break;
            case 43114: address = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"; break;
            default: return tokenInfoUrl("USDC", "USD Coin", network.chainId);
        }
        return tokenExplorerBase(network.chainId) + "/token/" + Uri.encode(address);
    }

    private String tokenInfoUrl(String symbol, String name, long chainId) {
        String s = symbol == null ? "" : symbol.toLowerCase();
        if ("eth".equals(s)) return "https://www.coingecko.com/en/coins/ethereum";
        if ("pol".equals(s)) return "https://www.coingecko.com/en/coins/polygon-ecosystem-token";
        if ("bnb".equals(s)) return "https://www.coingecko.com/en/coins/bnb";
        if ("avax".equals(s)) return "https://www.coingecko.com/en/coins/avalanche";
        return "https://www.coingecko.com/en/search?query=" + Uri.encode(name == null ? symbol : name);
    }

    private void addCustomTokensSection() {
        add(sectionTitle("Custom tokens", "Import ERC-20 tokens that are not shown by default"), 20);
        Button addToken = button("+ Import token", true);
        add(addToken, 8);
        addToken.setOnClickListener(v -> importCustomTokenDialog());

        List<CustomToken> tokens = CustomToken.load(this, selectedNetwork.chainId);
        if (tokens.isEmpty()) {
            add(label("No custom tokens imported on " + selectedNetwork.name + ".", 12, MUTED, false), 8);
            return;
        }
        for (CustomToken token : tokens) {
            LinearLayout row = card();
            row.setBackground(pill(0xff0f1115, 0xff24272e));
            LinearLayout top = new LinearLayout(this);
            top.setOrientation(LinearLayout.HORIZONTAL);
            top.setGravity(Gravity.CENTER_VERTICAL);
            LinearLayout meta = new LinearLayout(this);
            meta.setOrientation(LinearLayout.VERTICAL);
            TextView tokenName = label(token.name + " · " + token.symbol, 15, TEXT, true);
            tokenName.setOnClickListener(v -> customTokenInfo(token));
            meta.addView(tokenName);
            TextView address = label(shortAddress(token.address) + " · " + token.decimals + " decimals", 10, MUTED, false);
            address.setOnClickListener(v -> customTokenInfo(token));
            meta.addView(address);
            top.addView(meta, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            TextView balance = label("Loading…", 14, TEXT, true);
            balance.setGravity(Gravity.END);
            top.addView(balance);
            row.addView(top);
            TextView info = label("Token details ↗", 11, activeAccent(), true);
            info.setPadding(0, dp(10), 0, 0);
            info.setOnClickListener(v -> customTokenInfo(token));
            row.addView(info);
            add(row, 8);
            EvmNetwork network = selectedNetwork;
            io.execute(() -> {
                try {
                    String value = engine.tokenBalance(network, token.address, token.decimals) + " " + token.symbol;
                    runOnUiThread(() -> { if (network == selectedNetwork) balance.setText(value); });
                } catch (Exception error) {
                    runOnUiThread(() -> { if (network == selectedNetwork) balance.setText("Unavailable"); });
                }
            });
        }
    }

    private void importCustomTokenDialog() {
        LinearLayout box = dialogBox();
        EditText name = input("Token name, e.g. My Token");
        EditText symbol = input("Symbol, e.g. MTK");
        EditText address = input("ERC-20 contract address (0x...)");
        EditText decimals = input("Decimals (usually 18 or 6)");
        name.setSingleLine(true);
        symbol.setSingleLine(true);
        address.setSingleLine(true);
        decimals.setSingleLine(true);
        decimals.setInputType(InputType.TYPE_CLASS_NUMBER);
        box.addView(label("Network: " + selectedNetwork.name + " (chain " + selectedNetwork.chainId + ")", 12, MUTED, true));
        addTo(box, name, 8); addTo(box, symbol, 8); addTo(box, address, 8); addTo(box, decimals, 8);
        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Import custom ERC-20")
            .setMessage("Imports display metadata only. Verify the contract address from a trusted source. Anyone can create tokens with misleading names or symbols.")
            .setView(box).setNegativeButton("Cancel", null).setPositiveButton("Import", null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try {
                String cleanName = name.getText().toString().trim();
                String cleanSymbol = symbol.getText().toString().trim();
                String cleanAddress = address.getText().toString().trim();
                if (cleanName.isEmpty() || cleanName.length() > 60) throw new IllegalArgumentException("Enter a token name up to 60 characters.");
                if (!cleanSymbol.matches("[A-Za-z0-9._-]{1,16}")) throw new IllegalArgumentException("Enter a valid token symbol (1 to 16 letters, numbers, or . _ -).");
                if (!org.web3j.crypto.WalletUtils.isValidAddress(cleanAddress)) throw new IllegalArgumentException("Enter a valid EVM contract address.");
                int decimalsValue = Integer.parseInt(decimals.getText().toString().trim());
                if (decimalsValue < 0 || decimalsValue > 36) throw new IllegalArgumentException("Decimals must be between 0 and 36.");
                CustomToken token = new CustomToken(selectedNetwork.chainId, cleanName, cleanSymbol, cleanAddress, decimalsValue);
                CustomToken.save(this, token);
                dialog.dismiss();
                render();
                Toast.makeText(this, "Custom token imported", Toast.LENGTH_SHORT).show();
            } catch (Exception error) {
                showError("Could not import token", error);
            }
        }));
        dialog.show();
    }

    private String tokenExplorerBase(long chainId) {
        switch ((int) chainId) {
            case 1: return "https://etherscan.io";
            case 8453: return "https://basescan.org";
            case 137: return "https://polygonscan.com";
            case 42161: return "https://arbiscan.io";
            case 10: return "https://optimistic.etherscan.io";
            case 43114: return "https://snowtrace.io";
            case 56: return "https://bscscan.com";
            default: return "https://etherscan.io";
        }
    }

    private void customTokenInfo(CustomToken token) {
        String explorer = tokenExplorerBase(token.chainId) + "/token/" + Uri.encode(token.address);
        String message = "Name: " + token.name
            + "\nSymbol: " + token.symbol
            + "\nNetwork: " + selectedNetwork.name + " (chain " + token.chainId + ")"
            + "\nContract: " + token.address
            + "\nDecimals: " + token.decimals
            + "\n\nThis token was imported by you. The app reads its ERC-20 balance but does not independently certify the token, its issuer, value, liquidity, or safety. Verify the contract on the official project site and explorer before relying on it.";
        new AlertDialog.Builder(this).setTitle(token.name + " · Token information")
            .setMessage(message)
            .setNeutralButton("Remove token", (d, w) -> new AlertDialog.Builder(this)
                .setTitle("Remove " + token.symbol + "?")
                .setMessage("This removes its saved display entry from this device. It does not affect tokens on-chain.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Remove", (dd, ww) -> { CustomToken.remove(this, token); render(); })
                .show())
            .setPositiveButton("Open explorer", (d, w) -> openExternal(explorer))
            .setNegativeButton("Close", null).show();
    }

    private void openExternal(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
        catch (Exception error) { showError("Could not open link", error); }
    }

    private void showDapps() {
        final AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Dapps · Web3 browser").create();
        dappDialog = dialog;
        LinearLayout root = dialogBox();
        LinearLayout controls = new LinearLayout(this); controls.setOrientation(LinearLayout.HORIZONTAL);
        EditText url = input("Search or enter https://…"); url.setSingleLine(true);
        Button go = button("Go", true);
        controls.addView(url, new LinearLayout.LayoutParams(0, dp(48), 1f)); LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(dp(70), dp(48)); gp.leftMargin = dp(8); controls.addView(go, gp);
        root.addView(controls);
        Button connect = button("Connect wallet to this dapp", false); root.addView(connect, new LinearLayout.LayoutParams(-1, dp(48)));
        dappWebView = new WebView(this); WebSettings ws = dappWebView.getSettings(); ws.setJavaScriptEnabled(true); ws.setDomStorageEnabled(true); ws.setJavaScriptCanOpenWindowsAutomatically(false); ws.setAllowFileAccess(false); ws.setAllowContentAccess(false);
        dappWebView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, String u) {
                if (u.startsWith("https://") || u.startsWith("http://")) { loadDappUrl(u, v); return true; }
                openExternal(u); return true;
            }
            @Override public void onPageFinished(WebView v, String u) { if (isTrustedDappOrigin(u)) injectEip1193(v); }
        });
        root.addView(dappWebView, new LinearLayout.LayoutParams(-1, dp(420)));
        root.addView(label("Built-in EVM dapp connection uses the wallet's local signing provider. Dapps never receive the recovery phrase.", 11, MUTED, false));
        String[] apps = {"Uniswap|https://app.uniswap.org","Aave|https://app.aave.com","OpenSea|https://opensea.io","Jupiter|https://jup.ag","Raydium|https://raydium.io","BTCme.click|https://btcme.click","LTCme.click|https://ltcme.click","BnbBlockchain.com|https://bnbblockchain.com","MonadBlockchain.com|https://monadblockchain.com","ClickSolana.xyz|https://clicksolana.xyz"};
        for (String item : apps) { String[] parts = item.split("\\|",2); Button b = button("↗ " + parts[0], false); b.setOnClickListener(v -> { url.setText(parts[1]); dappWebView.loadUrl(parts[1]); }); root.addView(b, new LinearLayout.LayoutParams(-1, dp(42))); }
        go.setOnClickListener(v -> loadDappUrl(url.getText().toString(), dappWebView));
        connect.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle("Connect wallet").setMessage("This browser exposes an EIP-1193 wallet provider to the current dapp. The dapp must request accounts before it can see your address. Every transaction still requires an explicit confirmation.").setPositiveButton("Continue", null).setNegativeButton("Cancel", null).show());
        dialog.setView(root); dialog.setOnDismissListener(v -> { dappDialog = null; if (dappWebView != null) { dappWebView.removeJavascriptInterface("BuildAWallet"); dappWebView.destroy(); dappWebView = null; } }); dialog.setOnShowListener(v -> loadDappUrl("https://app.uniswap.org", dappWebView)); dialog.show();
    }

    private boolean isTrustedDappOrigin(String rawUrl) {
        try {
            Uri u = Uri.parse(rawUrl);
            if (!"https".equalsIgnoreCase(u.getScheme())) return false;
            String h = u.getHost() == null ? "" : u.getHost().toLowerCase(java.util.Locale.ROOT);
            return h.equals("app.uniswap.org") || h.endsWith(".uniswap.org")
                || h.equals("app.aave.com") || h.endsWith(".aave.com")
                || h.equals("opensea.io") || h.endsWith(".opensea.io")
                || h.equals("jup.ag") || h.endsWith(".jup.ag")
                || h.equals("raydium.io") || h.endsWith(".raydium.io")
                || h.equals("btcme.click") || h.endsWith(".btcme.click")
                || h.equals("ltcme.click") || h.endsWith(".ltcme.click")
                || h.equals("bnbblockchain.com") || h.endsWith(".bnbblockchain.com")
                || h.equals("monadblockchain.com") || h.endsWith(".monadblockchain.com")
                || h.equals("clicksolana.xyz") || h.endsWith(".clicksolana.xyz");
        } catch (Exception ignored) { return false; }
    }

    private void loadDappUrl(String raw, WebView view) {
        String u = raw == null ? "" : raw.trim();
        if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://www.google.com/search?q=" + Uri.encode(u);
        boolean trusted = isTrustedDappOrigin(u);
        if (trusted) view.addJavascriptInterface(new DappBridge(), "BuildAWallet");
        else view.removeJavascriptInterface("BuildAWallet");
        view.loadUrl(u);
    }

    private void injectEip1193(WebView view) {
        String js = "(function(){if(window.__bawProvider)return;const listeners={};function emit(e,d){(listeners[e]||[]).forEach(f=>{try{f(d)}catch(_){}})}const p={isBuildAWallet:true,request:function(a){return new Promise((resolve,reject)=>{const id=Date.now()+Math.floor(Math.random()*100000);window.__bawCallbacks=window.__bawCallbacks||{};window.__bawCallbacks[id]={resolve:resolve,reject:reject};BuildAWallet.request(String(id),String(a&&a.method||''),JSON.stringify(a&&a.params||[]));})},on:function(e,f){(listeners[e]||(listeners[e]=[])).push(f);return this},removeListener:function(e,f){listeners[e]=(listeners[e]||[]).filter(x=>x!==f);return this}};window.ethereum=p;window.__bawProvider=true;const announce=()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:Object.freeze({info:{uuid:'350670db-19fa-4704-a166-e52e178b59d2',name:'BuildAWallet',icon:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2296%22 height=%2296%22 viewBox=%220 0 96 96%22%3E%3Crect width=%2296%22 height=%2296%22 rx=%2220%22 fill=%22%2317223a%22/%3E%3Ctext x=%2248%22 y=%2262%22 text-anchor=%22middle%22 font-size=%2248%22 fill=%22white%22%3EB%3C/text%3E%3C/svg%3E',rdns:'xyz.buildawallet'},provider:p})}));window.addEventListener('eip6963:requestProvider',announce);announce();emit('connect',{chainId:'0x" + Long.toHexString(selectedNetwork.chainId) + "'});})();";
        view.evaluateJavascript(js, null);
    }

    private final class DappBridge {
        @JavascriptInterface public void request(String id, String method, String params) { runOnUiThread(() -> handleDappRequest(id, method, params)); }
    }

    private void handleDappRequest(String id, String method, String rawParams) {
        try {
            org.json.JSONArray params = new org.json.JSONArray(rawParams == null ? "[]" : rawParams);
            if ("eth_requestAccounts".equals(method)) {
                new AlertDialog.Builder(this).setTitle("Dapp account access").setMessage("Allow this dapp to view and use your EVM address for this session?").setNegativeButton("Reject", (d,w) -> resolveDapp(id, null, 4001, "User rejected request")).setPositiveButton("Connect", (d,w) -> resolveDapp(id, new org.json.JSONArray().put(engine.address()).toString(), 0, null)).show(); return;
            }
            if ("personal_sign".equals(method)) {
                String message = params.length() > 0 ? params.getString(0) : "";
                new AlertDialog.Builder(this).setTitle("Dapp signature request").setMessage("Sign this message?\\n\\n" + message).setNegativeButton("Reject", (d,w) -> resolveDapp(id, null, 4001, "User rejected request")).setPositiveButton("Sign", (d,w) -> io.execute(() -> { try { resolveDapp(id, engine.signPersonalMessage(message), 0, null); } catch (Exception e) { resolveDapp(id, null, 4000, safeMessage(e)); } })).show(); return;
            }
            if ("eth_sendTransaction".equals(method)) {
                org.json.JSONObject tx = params.getJSONObject(0);
                EvmNetwork network = selectedNetwork;
                WalletEngine activeEngine = engine;
                if (walletLocked || activeEngine == null) {
                    resolveDapp(id, null, 4001, "Wallet is locked.");
                    return;
                }
                io.execute(() -> {
                    try {
                        String data = tx.optString("data", tx.optString("input", "0x"));
                        String decoded = activeEngine.decodeContractCall(network, tx.optString("to", ""), data);
                        WalletEngine.DappSpendEstimate estimate = null;
                        if (profile.bigSendUsd > 0 || profile.sessionLimitUsd > 0) {
                            estimate = activeEngine.estimateDappSpend(network, tx);
                            if (profile.sessionLimitUsd > 0 && !estimate.fullyValued) {
                                throw new IllegalStateException("This contract method is not fully decoded, so the wallet cannot reliably apply the active USD spending cap. Transaction cancelled. Review the contract independently or explicitly disable the 24-hour spending cap in Security settings before using this method.");
                            }
                        }
                        WalletEngine.DappSpendEstimate finalEstimate = estimate;
                        runOnUiThread(() -> showDappTransactionConfirmation(id, tx, network, decoded, finalEstimate));
                    } catch (Exception error) {
                        runOnUiThread(() -> resolveDapp(id, null, 4000, safeMessage(error)));
                    }
                });
                return;
            }
            io.execute(() -> { try { resolveDapp(id, engine.dappRead(selectedNetwork, method, params), 0, null); } catch(Exception e) { resolveDapp(id,null,4200,safeMessage(e)); } });
        } catch (Exception e) { resolveDapp(id,null,4000,safeMessage(e)); }
    }

    private void showDappTransactionConfirmation(String id, org.json.JSONObject tx, EvmNetwork network,
                                                 String decoded, WalletEngine.DappSpendEstimate estimate) {
        boolean highRisk = decoded.contains("HIGH RISK") || decoded.contains("UNLIMITED")
            || decoded.contains("APPROVAL") || decoded.contains("ALLOWANCE")
            || decoded.contains("UNKNOWN CONTRACT METHOD") || decoded.contains("MULTICALL")
            || decoded.contains("not fully decoded");
        boolean large = estimate != null && profile.bigSendUsd > 0
            && estimate.usdValue.compareTo(BigDecimal.valueOf(profile.bigSendUsd)) >= 0;
        String message = dappTransactionPreview(tx, network, decoded, estimate);
        new AlertDialog.Builder(this)
            .setTitle(highRisk || large ? "High-risk dapp request · review" : "Dapp transaction · review carefully")
            .setMessage(message)
            .setNegativeButton("Reject", (d, w) -> resolveDapp(id, null, 4001, "User rejected transaction"))
            .setPositiveButton(highRisk || large ? "Continue to final review" : "Sign & send",
                (d, w) -> {
                    if (highRisk || large) {
                        new AlertDialog.Builder(this)
                            .setTitle("Final transaction confirmation")
                            .setMessage("Network: " + network.name + "\nContract / destination: " + tx.optString("to", "(missing)")
                                + "\n\n" + decoded
                                + "\n\nContract effects may be irreversible. Only proceed if you independently trust this contract and understand the decoded action.")
                            .setNegativeButton("Reject", (dd, ww) -> resolveDapp(id, null, 4001, "User rejected transaction"))
                            .setPositiveButton("I understand · Sign & send",
                                (dd, ww) -> sendDappTransaction(id, tx, network, estimate))
                            .show();
                    } else sendDappTransaction(id, tx, network, estimate);
                }).show();
    }

    private String dappTransactionPreview(org.json.JSONObject tx, EvmNetwork network, String decoded,
                                          WalletEngine.DappSpendEstimate estimate) {
        String to = tx.optString("to", "(missing)");
        String value = tx.optString("value", "0x0");
        String gas = tx.optString("gas", "estimated by network");
        String gasPrice = tx.optString("maxFeePerGas", tx.optString("gasPrice", "estimated by network"));
        String data = tx.optString("data", tx.optString("input", "0x"));
        String shownData = data.length() > 600 ? data.substring(0, 600) + "… (truncated)" : data;
        String usd = estimate == null ? "USD value not calculated (USD guardrails disabled)"
            : "Estimated native value + fee + decoded token spend: $" + estimate.usdValue.setScale(2, RoundingMode.HALF_UP).toPlainString();
        return "Network: " + network.name + " (chain " + network.chainId + ")"
            + "\nDestination / contract: " + to
            + "\nNative value (hex wei): " + value
            + "\nGas limit: " + gas
            + "\nGas price / max fee (hex): " + gasPrice
            + "\n" + usd
            + "\n\nDECODED ACTION\n" + decoded
            + "\n\nRaw calldata: " + shownData
            + "\n\nMarket prices are estimates, not guaranteed execution values. Contract calls may have effects that cannot be fully inferred from calldata.";
    }

    private void sendDappTransaction(String id, org.json.JSONObject tx, EvmNetwork network,
                                     WalletEngine.DappSpendEstimate estimate) {
        if (walletLocked || engine == null) {
            resolveDapp(id, null, 4001, "Wallet is locked; transaction cancelled.");
            return;
        }
        String walletAddress = engine.address();
        io.execute(() -> {
            WalletSecurity.Reservation reservation = null;
            try {
                if (walletLocked || engine == null) throw new IllegalStateException("Wallet locked before signing; transaction cancelled.");
                reservation = WalletSecurity.reserve(this, walletAddress,
                    estimate == null ? null : estimate.usdValue, profile.sessionLimitUsd);
                if (walletLocked || engine == null) throw new IllegalStateException("Wallet locked before signing; transaction cancelled.");
                String hash = engine.dappSendTransaction(network, tx);
                resolveDapp(id, hash, 0, null);
            } catch (Exception error) {
                if (reservation != null) WalletSecurity.release(this, reservation);
                resolveDapp(id, null, 4000, safeMessage(error));
            }
        });
    }

    private void resolveDapp(String id, String result, int code, String message) {
        if (dappWebView == null) return;
        String rid = org.json.JSONObject.quote(id), rr = result == null ? "null" : org.json.JSONObject.quote(result), err = message == null ? "null" : "{code:" + code + ",message:" + org.json.JSONObject.quote(message) + "}";
        dappWebView.evaluateJavascript("window.__bawResolve(" + rid + "," + rr + "," + err + ")", null);
    }

    private void showByteChat() {
        LinearLayout box = dialogBox();
        TextView intro = label(
            "Hi, I’m Byte. I can help with BuildAWallet, supported networks, fees, receiving, safe transaction review, and the AI-agent service. Never paste a recovery phrase or private key here.",
            14, TEXT, false);
        intro.setPadding(dp(4), dp(4), dp(4), dp(12));
        box.addView(intro);
        EditText question = input("Ask Byte a wallet question…");
        question.setSingleLine(false);
        question.setMinLines(3);
        box.addView(question);
        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Byte · Wallet & API Guide")
            .setView(box)
            .setNegativeButton("Close", null)
            .setPositiveButton("Open full Byte chat", null)
            .create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://buildawallet.xyz/human/wallet")));
            } catch (Exception error) {
                showError("Could not open Byte chat", error);
            }
        }));
        dialog.show();
    }

    private LinearLayout walletAction(String glyph, String title, View.OnClickListener listener) {
        LinearLayout tile = new LinearLayout(this);
        tile.setOrientation(LinearLayout.VERTICAL);
        tile.setGravity(Gravity.CENTER);
        tile.setPadding(dp(6), dp(9), dp(6), dp(9));
        tile.setBackground(pill(0xff111318, 0xff262932));
        tile.setOnClickListener(listener);
        tile.setClickable(true);
        tile.setFocusable(true);
        TextView icon = label(glyph, 20, activeAccent(), true);
        icon.setGravity(Gravity.CENTER);
        tile.addView(icon);
        TextView text = label(title, 11, TEXT, true);
        text.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        textParams.topMargin = dp(4);
        tile.addView(text, textParams);
        return tile;
    }

    private LinearLayout sectionTitle(String title, String subtitle) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.BOTTOM);
        LinearLayout labels = new LinearLayout(this);
        labels.setOrientation(LinearLayout.VERTICAL);
        labels.addView(label(title, 18, TEXT, true));
        labels.addView(label(subtitle, 11, MUTED, false));
        row.addView(labels, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        return row;
    }

    private LinearLayout statusLine(String dot, String title, String subtitle, int color) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        TextView icon = label(dot, 15, color, true);
        row.addView(icon, new LinearLayout.LayoutParams(dp(22), LinearLayout.LayoutParams.WRAP_CONTENT));
        LinearLayout labels = new LinearLayout(this);
        labels.setOrientation(LinearLayout.VERTICAL);
        labels.addView(label(title, 13, TEXT, true));
        labels.addView(label(subtitle, 11, MUTED, false));
        row.addView(labels, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        return row;
    }

    private void selectNetworkDialog() {
        String[] labels = new String[enabledNetworks.size()];
        int current = Math.max(0, enabledNetworks.indexOf(selectedNetwork));
        for (int i = 0; i < enabledNetworks.size(); i++) {
            EvmNetwork network = enabledNetworks.get(i);
            labels[i] = network.name + "   ·   " + network.symbol + "   ·   chain " + network.chainId;
        }
        new AlertDialog.Builder(this)
            .setTitle("Select network")
            .setSingleChoiceItems(labels, current, (dialog, which) -> {
                selectedNetwork = enabledNetworks.get(which);
                dialog.dismiss();
                render();
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    private static String shortAddress(String address) {
        if (address == null || address.length() < 14) return address;
        return address.substring(0, 7) + "…" + address.substring(address.length() - 5);
    }

    private void refreshBalance() {
        if (engine == null || selectedNetwork == null || balanceView == null) return;
        balanceView.setText("Loading…");
        status("Connecting to " + selectedNetwork.name + "…");
        EvmNetwork network = selectedNetwork;
        io.execute(() -> {
            try {
                String balance = engine.balance(network);
                runOnUiThread(() -> {
                    if (network == selectedNetwork) {
                        balanceView.setText(balance);
                    }
                    try {
                        String usdc = engine.usdcBalance(network);
                        runOnUiThread(() -> {
                            if (network == selectedNetwork && assetBalanceView != null) assetBalanceView.setText(usdc);
                        });
                    } catch (Exception ignored) {
                        runOnUiThread(() -> {
                            if (network == selectedNetwork && assetBalanceView != null) assetBalanceView.setText("USDC unavailable");
                        });
                    }
                    status("Connected · chain " + network.chainId);
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    if (network == selectedNetwork) {
                        balanceView.setText("Unavailable");
                        if (assetBalanceView != null) assetBalanceView.setText("Unavailable");
                    }
                    status("RPC error: " + safeMessage(error));
                });
            }
        });
    }

    private void refreshNonEvm(TextView solBalance, TextView btcBalance) {
        if (nonEvm == null) return;
        io.execute(() -> {
            try {
                String value = nonEvm.solanaBalance();
                runOnUiThread(() -> solBalance.setText(value));
                try {
                    String btc = nonEvm.bitcoinBalance();
                    runOnUiThread(() -> btcBalance.setText(btc));
                } catch (Exception ignored) {
                    runOnUiThread(() -> btcBalance.setText("Bitcoin RPC unavailable"));
                }
            } catch (Exception error) {
                runOnUiThread(() -> solBalance.setText("Solana RPC unavailable"));
            }
        });
    }

    private void sendSolanaDialog() {
        EditText to = input("Solana destination");
        EditText amount = input("0.01");
        amount.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        LinearLayout box = dialogBox();
        box.addView(label("Recipient", 12, MUTED, true));
        box.addView(to);
        addTo(box, label("Amount (SOL)", 12, MUTED, true), 12);
        box.addView(amount);
        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Send SOL")
            .setMessage("Review the Solana recipient and amount before local signing.")
            .setView(box).setNegativeButton("Cancel", null).setPositiveButton("Review", null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try {
                BigDecimal value = new BigDecimal(amount.getText().toString().trim());
                String destination = to.getText().toString().trim();
                if (destination.isEmpty() || value.signum() <= 0) throw new IllegalArgumentException("Enter a valid recipient and amount.");
                dialog.dismiss();
                io.execute(() -> {
                    try {
                        BigDecimal usd = null;
                        if (profile.bigSendUsd > 0 || profile.sessionLimitUsd > 0) usd = WalletSecurity.coinUsdValue("solana", value);
                        BigDecimal finalUsd = usd;
                        runOnUiThread(() -> confirmSolanaTransfer(destination, value, finalUsd));
                    } catch (Exception error) { runOnUiThread(() -> showError("Cannot value SOL transfer", error)); }
                });
            } catch (Exception error) { showError("Invalid SOL transfer", error); }
        }));
        dialog.show();
    }

    private void confirmSolanaTransfer(String destination, BigDecimal amount, BigDecimal usdValue) {
        boolean large = usdValue != null && profile.bigSendUsd > 0 && usdValue.compareTo(BigDecimal.valueOf(profile.bigSendUsd)) >= 0;
        String msg = "Network: Solana mainnet\nRecipient: " + destination + "\nAmount: " + amount.toPlainString()
            + " SOL" + (usdValue == null ? "" : "\nIndicative USD value: $" + usdValue.setScale(2, RoundingMode.HALF_UP).toPlainString())
            + "\n\nThe transaction will be signed on this device."
            + (large ? "\n\nThis meets or exceeds your large-send confirmation threshold ($" + profile.bigSendUsd + ")." : "");
        new AlertDialog.Builder(this).setTitle(large ? "Large SOL transfer · review" : "Confirm SOL transfer")
            .setMessage(msg).setNegativeButton("Cancel", null)
            .setPositiveButton(large ? "Continue to final review" : "Sign & send", (d,w) -> {
                if (large) new AlertDialog.Builder(this).setTitle("Final SOL confirmation")
                    .setMessage("Send " + amount.toPlainString() + " SOL to " + destination + "?\nEstimated value: $" + usdValue.setScale(2, RoundingMode.HALF_UP).toPlainString()
                        + "\nThis is irreversible.")
                    .setNegativeButton("Cancel", null)
                    .setPositiveButton("I verified · Sign & send", (dd,ww) -> broadcastSolana(destination, amount, usdValue)).show();
                else broadcastSolana(destination, amount, usdValue);
            }).show();
    }

    private void broadcastSolana(String destination, BigDecimal amount, BigDecimal usdValue) {
        if (walletLocked || nonEvm == null) { showError("Wallet is locked", new IllegalStateException("Unlock the wallet before sending.")); return; }
        String walletAddress = engine == null ? "" : engine.address();
        io.execute(() -> {
            WalletSecurity.Reservation reservation = null;
            try {
                if (walletLocked || nonEvm == null) throw new IllegalStateException("Wallet locked before signing; transaction cancelled.");
                reservation = WalletSecurity.reserve(this, walletAddress, usdValue, profile.sessionLimitUsd);
                String signature = nonEvm.sendSolana(destination, amount);
                runOnUiThread(() -> Toast.makeText(this, "SOL sent: " + signature, Toast.LENGTH_LONG).show());
            } catch (Exception error) {
                if (reservation != null) WalletSecurity.release(this, reservation);
                runOnUiThread(() -> showError("SOL transfer failed", error));
            }
        });
    }

    private void sendBitcoinDialog() {
        EditText to = input("bc1… Bitcoin mainnet destination");
        EditText amount = input("0.001");
        amount.setSingleLine(true);
        amount.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        EditText fee = input("10");
        fee.setSingleLine(true);
        fee.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        LinearLayout box = dialogBox();
        box.addView(label("Destination", 12, MUTED, true));
        box.addView(to);
        addTo(box, label("Amount (BTC)", 12, MUTED, true), 12);
        box.addView(amount);
        addTo(box, label("Fee rate (sat/vB)", 12, MUTED, true), 12);
        box.addView(fee);
        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Send Bitcoin")
            .setMessage("Native SegWit mainnet transaction. The transaction is constructed and signed locally; only the signed transaction is broadcast.")
            .setView(box).setNegativeButton("Cancel", null).setPositiveButton("Review", null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try {
                BigDecimal value = new BigDecimal(amount.getText().toString().trim());
                long feeRate = new BigDecimal(fee.getText().toString().trim()).longValueExact();
                String destination = to.getText().toString().trim();
                if (!destination.startsWith("bc1") || value.signum() <= 0 || feeRate <= 0) {
                    throw new IllegalArgumentException("Enter a valid bc1 mainnet destination, amount and fee rate.");
                }
                dialog.dismiss();
                io.execute(() -> {
                    try {
                        BigDecimal usd = null;
                        if (profile.bigSendUsd > 0 || profile.sessionLimitUsd > 0) {
                            BigDecimal conservativeFeeBtc = BigDecimal.valueOf(feeRate).multiply(BigDecimal.valueOf(250)).movePointLeft(8);
                            usd = WalletSecurity.coinUsdValue("bitcoin", value.add(conservativeFeeBtc));
                        }
                        BigDecimal finalUsd = usd;
                        runOnUiThread(() -> confirmBitcoinTransfer(destination, value, feeRate, finalUsd));
                    } catch (Exception error) { runOnUiThread(() -> showError("Cannot value BTC transfer", error)); }
                });
            } catch (Exception error) { showError("Invalid BTC transfer", error); }
        }));
        dialog.show();
    }

    private void confirmBitcoinTransfer(String destination, BigDecimal amount, long feeRate, BigDecimal usdValue) {
        boolean large = usdValue != null && profile.bigSendUsd > 0 && usdValue.compareTo(BigDecimal.valueOf(profile.bigSendUsd)) >= 0;
        String msg = "Network: Bitcoin mainnet\nRecipient: " + destination + "\nAmount: " + amount.toPlainString()
            + " BTC\nFee rate: " + feeRate + " sat/vB"
            + (usdValue == null ? "" : "\nIndicative amount + conservative fee estimate: $" + usdValue.setScale(2, RoundingMode.HALF_UP).toPlainString())
            + "\n\nThis is irreversible."
            + (large ? "\n\nThis meets or exceeds your large-send confirmation threshold ($" + profile.bigSendUsd + ")." : "");
        new AlertDialog.Builder(this).setTitle(large ? "Large BTC transfer · review" : "Confirm BTC transfer")
            .setMessage(msg).setNegativeButton("Cancel", null)
            .setPositiveButton(large ? "Continue to final review" : "Sign & broadcast", (d,w) -> {
                if (large) new AlertDialog.Builder(this).setTitle("Final BTC confirmation")
                    .setMessage("Send " + amount.toPlainString() + " BTC to " + destination + "?\nEstimated value: $" + usdValue.setScale(2, RoundingMode.HALF_UP).toPlainString()
                        + "\nFee rate: " + feeRate + " sat/vB. This is irreversible.")
                    .setNegativeButton("Cancel", null)
                    .setPositiveButton("I verified · Sign & broadcast", (dd,ww) -> broadcastBitcoin(destination, amount, feeRate, usdValue)).show();
                else broadcastBitcoin(destination, amount, feeRate, usdValue);
            }).show();
    }

    private void broadcastBitcoin(String destination, BigDecimal amount, long feeRate, BigDecimal usdValue) {
        if (walletLocked || nonEvm == null) { showError("Wallet is locked", new IllegalStateException("Unlock the wallet before sending.")); return; }
        String walletAddress = engine == null ? "" : engine.address();
        io.execute(() -> {
            WalletSecurity.Reservation reservation = null;
            try {
                if (walletLocked || nonEvm == null) throw new IllegalStateException("Wallet locked before signing; transaction cancelled.");
                reservation = WalletSecurity.reserve(this, walletAddress, usdValue, profile.sessionLimitUsd);
                String txid = nonEvm.sendBitcoin(destination, amount, feeRate);
                runOnUiThread(() -> Toast.makeText(this, "BTC sent: " + txid, Toast.LENGTH_LONG).show());
            } catch (Exception error) {
                if (reservation != null) WalletSecurity.release(this, reservation);
                runOnUiThread(() -> showError("BTC transfer failed", error));
            }
        });
    }

    private void sendDialog() {
        EditText to = input("0x destination");
        EditText amount = input("0.01");
        amount.setSingleLine(true);
        amount.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);

        List<CustomToken> tokenChoices = new ArrayList<>();
        try {
            tokenChoices.add(new CustomToken(selectedNetwork.chainId, "USD Coin", "USDC",
                WalletEngine.configuredUsdcAddress(selectedNetwork), 6));
        } catch (Exception ignored) { }
        for (CustomToken token : CustomToken.load(this, selectedNetwork.chainId)) {
            boolean duplicate = false;
            for (CustomToken existing : tokenChoices) if (existing.address.equalsIgnoreCase(token.address)) duplicate = true;
            if (!duplicate) tokenChoices.add(token);
        }
        List<String> assetLabels = new ArrayList<>();
        assetLabels.add(selectedNetwork.symbol + " (native)");
        for (CustomToken token : tokenChoices) assetLabels.add(token.symbol + " · " + shortAddress(token.address));

        Spinner asset = new Spinner(this);
        asset.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, assetLabels));
        LinearLayout box = dialogBox();
        box.addView(label("Asset", 12, MUTED, true));
        box.addView(asset);
        addTo(box, label("Destination", 12, MUTED, true), 12);
        box.addView(to);
        TextView amountLabel = label("Amount (" + selectedNetwork.symbol + ")", 12, MUTED, true);
        addTo(box, amountLabel, 12);
        box.addView(amount);
        asset.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                String symbol = position == 0 ? selectedNetwork.symbol : tokenChoices.get(position - 1).symbol;
                amountLabel.setText("Amount (" + symbol + ")");
            }
            @Override public void onNothingSelected(AdapterView<?> parent) { }
        });
        if (tokenChoices.isEmpty()) addTo(box, notice("No configured stablecoin is available on this network. Import an ERC-20 token to send it."), 8);

        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Prepare transaction")
            .setView(box)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Review", null)
            .create();

        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String destination = to.getText().toString().trim();
            String value = amount.getText().toString().trim();
            int selected = asset.getSelectedItemPosition();
            CustomToken token = selected <= 0 ? null : tokenChoices.get(selected - 1);
            dialog.dismiss();
            prepareTransfer(destination, value, token);
        }));
        dialog.show();
    }

    private void prepareTransfer(String to, String amount) { prepareTransfer(to, amount, false); }

    private void prepareTransfer(String to, String amount, CustomToken token) {
        status("Fetching balance, nonce and network fee…");
        EvmNetwork network = selectedNetwork;
        io.execute(() -> {
            try {
                WalletEngine activeEngine = engine;
                if (walletLocked || activeEngine == null) throw new IllegalStateException("Wallet is locked. Unlock it before preparing a transaction.");
                WalletEngine.PreparedTransfer prepared;
                if (token == null) {
                    prepared = activeEngine.prepare(network, to, amount);
                } else {
                    if (token.chainId != network.chainId) throw new IllegalArgumentException("Token network does not match the selected network.");
                    prepared = activeEngine.prepareTokenTransfer(network, to, amount, token.address, token.decimals, token.symbol);
                }
                BigDecimal usdValue = null;
                if (profile.bigSendUsd > 0 || profile.sessionLimitUsd > 0) usdValue = WalletSecurity.usdValue(prepared);
                BigDecimal finalUsdValue = usdValue;
                runOnUiThread(() -> reviewTransfer(prepared, finalUsdValue));
            } catch (Exception error) {
                runOnUiThread(() -> {
                    status("Transaction not prepared");
                    showError("Cannot prepare transaction", error);
                });
            }
        });
    }

    private void reviewTransfer(WalletEngine.PreparedTransfer transfer, BigDecimal usdValue) {
        String valueLine = usdValue == null ? "\nUSD estimate: unavailable (USD guardrails disabled)"
            : "\nEstimated USD value: $" + usdValue.setScale(2, RoundingMode.HALF_UP).toPlainString()
                + "\nPrice estimate is indicative and may differ from execution value.";
        String message = "Network: " + transfer.network.name
            + "\nTo: " + transfer.to
            + "\nAsset: " + transfer.assetText()
            + "\nAmount: " + transfer.amountText()
            + "\nEstimated network fee: " + transfer.feeText()
            + valueLine
            + "\n\nSigning happens on this device after you confirm.";
        boolean large = usdValue != null && profile.bigSendUsd > 0
            && usdValue.compareTo(BigDecimal.valueOf(profile.bigSendUsd)) >= 0;
        new AlertDialog.Builder(this)
            .setTitle(large ? "Large transfer · first review" : "Review transaction")
            .setMessage(message + (large ? "\n\nThis meets or exceeds your large-send confirmation threshold of $" + profile.bigSendUsd + "." : ""))
            .setNegativeButton("Cancel", null)
            .setPositiveButton(large ? "Continue to final review" : "Sign & broadcast",
                (dialog, which) -> {
                    if (large) showLargeSendConfirmation(transfer, usdValue);
                    else broadcast(transfer, usdValue);
                })
            .show();
    }

    private void showLargeSendConfirmation(WalletEngine.PreparedTransfer transfer, BigDecimal usdValue) {
        new AlertDialog.Builder(this)
            .setTitle("Confirm large transfer")
            .setMessage("You are about to send " + transfer.amountText() + " on " + transfer.network.name
                + "\nRecipient: " + transfer.to
                + "\nIndicative value: $" + usdValue.setScale(2, RoundingMode.HALF_UP).toPlainString()
                + "\nEstimated fee: " + transfer.feeText()
                + "\n\nThis transfer meets your large-send threshold ($" + profile.bigSendUsd + "). Transactions cannot be reversed. Verify the network, recipient, token contract and amount.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("I verified · Sign & broadcast", (dialog, which) -> broadcast(transfer, usdValue))
            .show();
    }

    private void broadcast(WalletEngine.PreparedTransfer transfer, BigDecimal usdValue) {
        if (walletLocked || engine == null) {
            showError("Wallet is locked", new IllegalStateException("Unlock the wallet before broadcasting."));
            return;
        }
        final String walletAddress = engine.address();
        status("Checking spending limit, signing locally and broadcasting…");
        io.execute(() -> {
            WalletSecurity.Reservation reservation = null;
            try {
                if (walletLocked || engine == null) throw new IllegalStateException("Wallet locked before signing; transaction cancelled.");
                reservation = WalletSecurity.reserve(this, walletAddress, usdValue, profile.sessionLimitUsd);
                if (walletLocked || engine == null) throw new IllegalStateException("Wallet locked before signing; transaction cancelled.");
                String hash = engine.broadcast(transfer);
                runOnUiThread(() -> {
                    status("Broadcast: " + hash);
                    new AlertDialog.Builder(this)
                        .setTitle("Transaction broadcast")
                        .setMessage(hash + (usdValue == null ? "" : "\n\nCounted toward the rolling 24-hour spending limit: $" + usdValue.setScale(2, RoundingMode.HALF_UP).toPlainString()))
                        .setPositiveButton("OK", null)
                        .show();
                    refreshBalance();
                });
            } catch (Exception error) {
                if (reservation != null) WalletSecurity.release(this, reservation);
                runOnUiThread(() -> {
                    status("Broadcast failed or was cancelled");
                    showError("Transaction failed", error);
                });
            }
        });
    }

    private void receiveDialog() {
        new AlertDialog.Builder(this)
            .setTitle("Receive on " + selectedNetwork.name)
            .setMessage(engine.address()
                + "\n\nThis EVM address is shared across the supported networks. Make sure the sender uses "
                + selectedNetwork.name + ".")
            .setNegativeButton("Close", null)
            .setPositiveButton("Copy address", (dialog, which) -> copyAddress())
            .show();
    }

    private void settingsDialog() {
        String[] choices = {"Rename wallet", "Change theme", "Manage networks", "Security limits", "Currency", "Layout & navigation"};
        new AlertDialog.Builder(this)
            .setTitle("Customize wallet")
            .setItems(choices, (dialog, which) -> {
                if (which == 0) renameDialog();
                else if (which == 1) themeDialog();
                else if (which == 2) manageNetworksDialog();
                else if (which == 3) securitySettingsDialog();
                else if (which == 4) currencyDialog();
                else layoutSettingsDialog();
            })
            .setNegativeButton("Close", null)
            .show();
    }


    private void securitySettingsDialog() {
        LinearLayout box = dialogBox();
        addTo(box, notice("Enforced controls: the wallet locks after inactivity and whenever the app leaves the foreground. Large sends require a second confirmation. The spending limit is a persistent rolling 24-hour USD cap. Current market-price lookup is required while either USD guard is enabled; unknown-price tokens cannot be sent under an active USD cap. Set a USD limit to 0 only if you intentionally want to disable that guard."), 8);
        EditText lock = input("Auto-lock after inactivity (minutes)"); lock.setInputType(InputType.TYPE_CLASS_NUMBER); lock.setText(Integer.toString(profile.autoLockMin));
        EditText large = input("Large-send extra-confirmation threshold USD (0 = off)"); large.setInputType(InputType.TYPE_CLASS_NUMBER); large.setText(Integer.toString(profile.bigSendUsd));
        EditText limit = input("Rolling 24-hour spending cap USD (0 = off)"); limit.setInputType(InputType.TYPE_CLASS_NUMBER); limit.setText(Integer.toString(profile.sessionLimitUsd));
        box.addView(label("Inactivity lock", 12, MUTED, true)); box.addView(lock); addTo(box, label("Large-send confirmation", 12, MUTED, true), 10); box.addView(large); addTo(box, label("24-hour spending cap", 12, MUTED, true), 10); box.addView(limit);
        AlertDialog d = new AlertDialog.Builder(this).setTitle("Security settings").setView(box).setNegativeButton("Cancel", null).setPositiveButton("Save", null).create();
        d.setOnShowListener(v -> d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(x -> { try { profile=profile.withSettings(Integer.parseInt(lock.getText().toString()), Integer.parseInt(large.getText().toString()), Integer.parseInt(limit.getText().toString()), profile.currency, profile.walletStyle, profile.navigationStyle, profile.assetStyle, profile.actionStyle); profile.save(this); d.dismiss(); render(); } catch(Exception e){ showError("Invalid security settings", e); } })); d.show();
    }

    private void currencyDialog() {
        String[] currencies = {"usd","eur","gbp","jpy","cad","aud","chf","inr","brl"};
        int current = 0; for(int i=0;i<currencies.length;i++) if(currencies[i].equalsIgnoreCase(profile.currency)) current=i;
        new AlertDialog.Builder(this).setTitle("Display currency").setSingleChoiceItems(currencies,current,(d,w)->{ profile=profile.withSettings(profile.autoLockMin,profile.bigSendUsd,profile.sessionLimitUsd,currencies[w],profile.walletStyle,profile.navigationStyle,profile.assetStyle,profile.actionStyle); profile.save(this); d.dismiss(); Toast.makeText(this,"Currency saved",Toast.LENGTH_SHORT).show(); }).setNegativeButton("Cancel",null).show();
    }

    private void layoutSettingsDialog() {
        String[] styles = {"classic","minimal","trader","neon","glass","gallery"};
        String[] nav = {"bottom","icons","floating","text"};
        String[] assets = {"compact","detailed","visual"};
        String[] actions = {"duo","toolbar","round"};
        LinearLayout box = dialogBox();
        Spinner ws = new Spinner(this); ws.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,styles)); ws.setSelection(indexOf(styles,profile.walletStyle));
        Spinner ns = new Spinner(this); ns.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,nav)); ns.setSelection(indexOf(nav,profile.navigationStyle));
        Spinner as = new Spinner(this); as.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,assets)); as.setSelection(indexOf(assets,profile.assetStyle));
        Spinner ac = new Spinner(this); ac.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,actions)); ac.setSelection(indexOf(actions,profile.actionStyle));
        box.addView(label("Wallet style",12,MUTED,true)); box.addView(ws); addTo(box,label("Navigation style",12,MUTED,true),10); box.addView(ns); addTo(box,label("Asset style",12,MUTED,true),10); box.addView(as); addTo(box,label("Action style",12,MUTED,true),10); box.addView(ac);
        new AlertDialog.Builder(this).setTitle("Layout & navigation").setView(box).setNegativeButton("Cancel",null).setPositiveButton("Save",(d,w)->{ profile=profile.withSettings(profile.autoLockMin,profile.bigSendUsd,profile.sessionLimitUsd,profile.currency,String.valueOf(ws.getSelectedItem()),String.valueOf(ns.getSelectedItem()),String.valueOf(as.getSelectedItem()),String.valueOf(ac.getSelectedItem())); profile.save(this); render(); }).show();
    }

    private static int indexOf(String[] values, String target) { for(int i=0;i<values.length;i++) if(values[i].equalsIgnoreCase(target)) return i; return 0; }

    private void renameDialog() {
        EditText name = input("Wallet name");
        name.setSingleLine(true);
        name.setText(profile.name);
        name.setSelection(name.getText().length());
        LinearLayout box = dialogBox();
        box.addView(name);

        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Rename wallet")
            .setView(box)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Save", null)
            .create();

        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String clean = name.getText().toString().trim();
            if (clean.isEmpty()) {
                Toast.makeText(this, "Enter a wallet name", Toast.LENGTH_SHORT).show();
                return;
            }
            profile = WalletProfile.create(clean, profile.theme, profile.networks);
            profile.save(this);
            resetPendingFromProfile();
            dialog.dismiss();
            render();
        }));
        dialog.show();
    }

    private void themeDialog() {
        int current = WalletProfile.themeIndex(profile.theme);
        new AlertDialog.Builder(this)
            .setTitle("Choose theme")
            .setSingleChoiceItems(WalletProfile.THEMES, current, (dialog, which) -> {
                profile = WalletProfile.create(profile.name, WalletProfile.THEMES[which], profile.networks);
                profile.save(this);
                resetPendingFromProfile();
                dialog.dismiss();
                render();
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    private void manageNetworksDialog() {
        List<EvmNetwork> all = EvmNetwork.all();
        String[] labels = new String[all.size()];
        boolean[] checked = new boolean[all.size()];
        LinkedHashSet<String> selected = new LinkedHashSet<>(profile.networks);
        for (int i = 0; i < all.size(); i++) {
            labels[i] = all.get(i).name + " · " + all.get(i).symbol;
            checked[i] = selected.contains(all.get(i).name);
        }

        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Manage networks")
            .setMultiChoiceItems(labels, checked, (d, which, enabled) -> {
                String name = all.get(which).name;
                if (enabled) selected.add(name);
                else selected.remove(name);
            })
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Save", null)
            .create();

        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            if (selected.isEmpty()) {
                Toast.makeText(this, "Keep at least one network enabled", Toast.LENGTH_SHORT).show();
                return;
            }
            profile = WalletProfile.create(profile.name, profile.theme, new ArrayList<>(selected));
            profile.save(this);
            resetPendingFromProfile();
            selectedNetwork = null;
            dialog.dismiss();
            render();
        }));
        dialog.show();
    }

    private void backupDialog() {
        try {
            String mnemonic = seedStore.loadMnemonic();
            new AlertDialog.Builder(this)
                .setTitle("Recovery phrase")
                .setMessage(mnemonic + "\n\nKeep these words offline. Anyone with them can control this wallet.")
                .setPositiveButton("Close", null)
                .show();
        } catch (Exception error) {
            showError("Could not read recovery phrase", error);
        }
    }

    private void confirmReset() {
        new AlertDialog.Builder(this)
            .setTitle("Erase wallet?")
            .setMessage("Make sure you have the recovery phrase. This removes the encrypted wallet and local profile from this phone.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Erase", (dialog, which) -> {
                seedStore.delete();
                WalletProfile.clear(this);
                engine = null;
                selectedNetwork = null;
                profile = WalletProfile.load(this);
                resetPendingFromProfile();
                setupStep = 0;
                render();
            })
            .show();
    }

    private void copyAddress() {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        clipboard.setPrimaryClip(ClipData.newPlainText("wallet address", engine.address()));
        Toast.makeText(this, "Address copied", Toast.LENGTH_SHORT).show();
    }

    private void stepHeader(String step, String eyebrow, String title, String body) {
        content.addView(label("BUILDAWALLET  /  " + step, 11, activeAccent(), true));
        add(label(title, 32, TEXT, true), 10);
        add(label(eyebrow, 13, activeAccent(), true), 8);
        add(label(body, 15, MUTED, false), 8);
    }

    private WalletProfile buildPendingProfile() {
        return WalletProfile.create(pendingName, pendingTheme, new ArrayList<>(pendingNetworks));
    }

    private void resetPendingFromProfile() {
        pendingName = profile.name;
        pendingTheme = profile.theme;
        pendingNetworks.clear();
        pendingNetworks.addAll(profile.networks);
    }

    private int activeAccent() {
        String theme = seedStore != null && seedStore.exists() && profile != null ? profile.theme : pendingTheme;
        return WalletProfile.accentFor(theme);
    }

    private static boolean wordMatches(EditText field, String expected) {
        return field.getText().toString().trim().equalsIgnoreCase(expected);
    }

    private static String numberedMnemonic(String mnemonic) {
        String[] words = mnemonic.split(" ");
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < words.length; i++) {
            if (i > 0) text.append(i % 2 == 0 ? "\n" : "        ");
            text.append(i + 1).append(". ").append(words[i]);
        }
        return text.toString();
    }

    private static String joinNetworks(List<String> networks) {
        StringBuilder out = new StringBuilder();
        for (String network : networks) {
            if (out.length() > 0) out.append(" · ");
            out.append(network);
        }
        return out.toString();
    }

    private void status(String text) {
        if (statusView != null) statusView.setText(text);
    }

    private void showError(String title, Throwable error) {
        new AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(safeMessage(error))
            .setPositiveButton("OK", null)
            .show();
    }

    private static String safeMessage(Throwable error) {
        String message = error == null ? null : error.getMessage();
        return message == null || message.trim().isEmpty() ? "Unknown error" : message;
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(18), dp(18), dp(18), dp(18));
        card.setBackground(pill(CARD, 0xff26324a));
        return card;
    }

    private LinearLayout dialogBox() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(24), dp(8), dp(24), 0);
        return box;
    }

    private EditText input(String hint) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setHintTextColor(0xff67758c);
        field.setTextColor(TEXT);
        field.setSingleLine(false);
        return field;
    }

    private Button button(String text, boolean primary) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(text);
        button.setTextSize(15);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setTextColor(primary ? 0xff061213 : TEXT);
        int accent = activeAccent();
        button.setBackground(pill(primary ? accent : CARD, primary ? accent : 0xff31405a));
        return button;
    }

    private TextView notice(String text) {
        TextView notice = label(text, 12, WARNING, true);
        notice.setPadding(dp(16), dp(15), dp(16), dp(15));
        notice.setBackground(pill(CARD, 0xff6a5834));
        return notice;
    }

    private TextView label(String text, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setLineSpacing(dp(3), 1f);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private void add(View view, int topMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(topMargin);
        content.addView(view, params);
    }

    private void addTo(LinearLayout parent, View view, int topMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(topMargin);
        parent.addView(view, params);
    }

    private GradientDrawable pill(int background, int border) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(background);
        shape.setCornerRadius(dp(17));
        shape.setStroke(dp(1), border);
        return shape;
    }

    private int dp(float pixels) {
        return (int) (pixels * getResources().getDisplayMetrics().density + 0.5f);
    }
}
