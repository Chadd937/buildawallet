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

        content.addView(label("BUILDAWALLET  /  SELF CUSTODY", 11, activeAccent(), true));
        add(label(profile.name, 32, TEXT, true), 8);
        add(label(profile.theme + " · Mainnet wallet", 13, MUTED, false), 3);

        LinearLayout balanceCard = card();
        balanceView = label("—", 35, TEXT, true);
        balanceCard.addView(label("Available native balance", 12, MUTED, false));
        addTo(balanceCard, balanceView, 8);
        add(balanceCard, 22);

        networkSpinner = new Spinner(this);
        ArrayAdapter<EvmNetwork> adapter = new ArrayAdapter<>(
            this, android.R.layout.simple_spinner_dropdown_item, enabledNetworks);
        networkSpinner.setAdapter(adapter);
        int selectedIndex = Math.max(0, enabledNetworks.indexOf(selectedNetwork));
        networkSpinner.setSelection(selectedIndex);
        networkSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                selectedNetwork = enabledNetworks.get(position);
                refreshBalance();
            }
            @Override public void onNothingSelected(AdapterView<?> parent) {}
        });
        add(networkSpinner, 15);

        LinearLayout addressCard = card();
        addressCard.addView(label("Receive address", 12, MUTED, false));
        TextView addressView = label(engine.address(), 12, TEXT, true);
        addressView.setTextIsSelectable(true);
        addTo(addressCard, addressView, 7);
        add(addressCard, 14);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        Button send = button("Send", true);
        send.setOnClickListener(v -> sendDialog());
        Button receive = button("Receive", false);
        receive.setOnClickListener(v -> receiveDialog());
        actions.addView(send, new LinearLayout.LayoutParams(0, dp(54), 1f));
        LinearLayout.LayoutParams receiveParams = new LinearLayout.LayoutParams(0, dp(54), 1f);
        receiveParams.leftMargin = dp(10);
        actions.addView(receive, receiveParams);
        add(actions, 16);

        Button copy = button("Copy receive address", false);
        copy.setOnClickListener(v -> copyAddress());
        add(copy, 10);

        statusView = label("Ready", 12, MUTED, false);
        add(statusView, 18);

        add(label("Security & settings", 18, TEXT, true), 28);
        Button settings = button("Customize wallet", false);
        settings.setOnClickListener(v -> settingsDialog());
        add(settings, 12);

        Button backup = button("Show recovery phrase", false);
        backup.setOnClickListener(v -> backupDialog());
        add(backup, 10);

        Button reset = button("Erase wallet from this phone", false);
        reset.setTextColor(0xffff8f9a);
        reset.setOnClickListener(v -> confirmReset());
        add(reset, 10);

        add(notice("Before sending, verify the selected network, destination, amount and displayed network fee. Signing happens only on this device after confirmation."), 20);
        refreshBalance();
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
                    if (network == selectedNetwork) balanceView.setText(balance);
                    status("Connected · chain " + network.chainId);
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    if (network == selectedNetwork) balanceView.setText("Unavailable");
                    status("RPC error: " + safeMessage(error));
                });
            }
        });
    }

    private void sendDialog() {
        EditText to = input("0x destination");
        EditText amount = input("0.01");
        amount.setSingleLine(true);
        amount.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);

        LinearLayout box = dialogBox();
        box.addView(label("Destination", 12, MUTED, true));
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
            prepareTransfer(destination, value);
        }));
        dialog.show();
    }

    private void prepareTransfer(String to, String amount) {
        status("Fetching nonce and network fee…");
        EvmNetwork network = selectedNetwork;
        io.execute(() -> {
            try {
                WalletEngine.PreparedTransfer prepared = engine.prepare(network, to, amount);
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
