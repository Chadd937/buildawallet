package xyz.buildawallet.studio;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
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
import android.widget.Toast;

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

    private SecureSeedStore seedStore;
    private WalletProfile profile;
    private WalletEngine engine;
    private LinearLayout content;
    private TextView balanceView;
    private TextView assetBalanceView;
    private TextView statusView;
    private Spinner networkSpinner;
    private List<EvmNetwork> enabledNetworks;
    private EvmNetwork selectedNetwork;

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

    @Override protected void onDestroy() {
        io.shutdownNow();
        super.onDestroy();
    }

    private void render() {
        content.removeAllViews();
        if (seedStore.exists()) renderWallet();
        else renderOnboarding();
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
            engine = WalletEngine.fromMnemonic(seedStore.loadMnemonic());
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
        add(actions, 14);

        add(sectionTitle("Assets", "Live balance on the selected network"), 28);
        LinearLayout assetCard = card();
        assetCard.setBackground(pill(0xff0f1115, 0xff24272e));
        LinearLayout assetRow = new LinearLayout(this);
        assetRow.setOrientation(LinearLayout.HORIZONTAL);
        assetRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView tokenIcon = label(selectedNetwork.symbol.substring(0, 1), 16, 0xff080a0d, true);
        tokenIcon.setGravity(Gravity.CENTER);
        tokenIcon.setBackground(pill(accent, accent));
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dp(42), dp(42));
        assetRow.addView(tokenIcon, iconParams);

        LinearLayout assetMeta = new LinearLayout(this);
        assetMeta.setOrientation(LinearLayout.VERTICAL);
        assetMeta.setPadding(dp(12), 0, 0, 0);
        assetMeta.addView(label(selectedNetwork.symbol, 16, TEXT, true));
        assetMeta.addView(label(selectedNetwork.name + " · native asset", 11, MUTED, false));
        assetRow.addView(assetMeta, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        assetBalanceView = label("—", 15, TEXT, true);
        assetBalanceView.setGravity(Gravity.END);
        assetRow.addView(assetBalanceView);
        assetCard.addView(assetRow);
        add(assetCard, 10);

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

    private void sendDialog() {
        EditText to = input("0x destination");
        Spinner asset = new Spinner(this);
        asset.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item,
            new String[] { selectedNetwork.symbol, "USDC" }));
        EditText amount = input("0.01");
        amount.setSingleLine(true);
        amount.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);

        LinearLayout box = dialogBox();
        box.addView(label("Asset", 12, MUTED, true));
        box.addView(asset);
        addTo(box, label("Destination", 12, MUTED, true), 12);
        box.addView(to);
        addTo(box, label("Amount (" + selectedNetwork.symbol + ")", 12, MUTED, true), 12);
        box.addView(amount);

        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("Prepare transaction")
            .setView(box)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Review", null)
            .create();

        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String destination = to.getText().toString().trim();
            String value = amount.getText().toString().trim();
            dialog.dismiss();
            boolean usdc = "USDC".equals(String.valueOf(asset.getSelectedItem()));
            prepareTransfer(destination, value, usdc);
        }));
        dialog.show();
    }

    private void prepareTransfer(String to, String amount) { prepareTransfer(to, amount, false); }

    private void prepareTransfer(String to, String amount, boolean usdc) {
        status("Fetching nonce and network fee…");
        EvmNetwork network = selectedNetwork;
        io.execute(() -> {
            try {
                WalletEngine.PreparedTransfer prepared = usdc
                    ? engine.prepareUsdc(network, to, amount)
                    : engine.prepare(network, to, amount);
                runOnUiThread(() -> reviewTransfer(prepared));
            } catch (Exception error) {
                runOnUiThread(() -> {
                    status("Transaction not prepared");
                    showError("Cannot prepare transaction", error);
                });
            }
        });
    }

    private void reviewTransfer(WalletEngine.PreparedTransfer transfer) {
        String message = "Network: " + transfer.network.name
            + "\nTo: " + transfer.to
            + "\nAmount: " + transfer.amountText()
            + "\nEstimated network fee: " + transfer.feeText()
            + "\n\nSigning happens on this device after you press Sign & broadcast.";

        new AlertDialog.Builder(this)
            .setTitle("Review transaction")
            .setMessage(message)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Sign & broadcast", (dialog, which) -> broadcast(transfer))
            .show();
    }

    private void broadcast(WalletEngine.PreparedTransfer transfer) {
        status("Signing locally and broadcasting…");
        io.execute(() -> {
            try {
                String hash = engine.broadcast(transfer);
                runOnUiThread(() -> {
                    status("Broadcast: " + hash);
                    new AlertDialog.Builder(this)
                        .setTitle("Transaction broadcast")
                        .setMessage(hash)
                        .setPositiveButton("OK", null)
                        .show();
                    refreshBalance();
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    status("Broadcast failed");
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
        String[] choices = {"Rename wallet", "Change theme", "Manage networks"};
        new AlertDialog.Builder(this)
            .setTitle("Customize wallet")
            .setItems(choices, (dialog, which) -> {
                if (which == 0) renameDialog();
                else if (which == 1) themeDialog();
                else manageNetworksDialog();
            })
            .setNegativeButton("Close", null)
            .show();
    }

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
