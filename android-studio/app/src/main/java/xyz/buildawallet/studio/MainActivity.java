package xyz.buildawallet.studio;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONException;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int PICK_BLUEPRINT = 7;
    private static final String DESIGN_PREFS = "wallet_design";
    private static final int BG = 0xff070a14;
    private static final int CARD = 0xff121827;
    private static final int TEXT = 0xfff5f7fb;
    private static final int MUTED = 0xff9aabc3;
    private static final int ACCENT = 0xff56ebd3;

    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private SecureSeedStore seedStore;
    private Blueprint blueprint;
    private WalletEngine engine;
    private LinearLayout content;
    private TextView balanceView;
    private TextView statusView;
    private Spinner networkSpinner;
    private List<EvmNetwork> enabledNetworks;
    private EvmNetwork selectedNetwork;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        seedStore = new SecureSeedStore(this);
        blueprint = loadBlueprint();

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BG);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(20), dp(30), dp(20), dp(36));
        scroll.addView(content);
        setContentView(scroll);

        render();
        applyDesignIntent(getIntent(), false);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyDesignIntent(intent, true);
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
        content.addView(label("BUILD A WALLET  /  SELF CUSTODY", 11, ACCENT, true));
        add(label(blueprint.name, 34, TEXT, true), 10);
        add(label("Create a new wallet on this phone or restore one with a BIP-39 recovery phrase. Keys are encrypted with Android Keystore and never sent to BuildAWallet.", 15, MUTED, false), 8);

        Button create = button("Create new wallet", true);
        create.setOnClickListener(v -> createWallet());
        add(create, 26);

        Button restore = button("Restore from recovery phrase", false);
        restore.setOnClickListener(v -> restoreWalletDialog());
        add(restore, 10);

        Button design = button("Import BuildAWallet design JSON", false);
        design.setOnClickListener(v -> chooseDesign());
        add(design, 10);

        add(notice("Supported in v1: Ethereum, Base, Polygon, Arbitrum, Optimism, Avalanche C-Chain and BNB Chain. Seed phrases stay on-device."), 24);
    }

    private void createWallet() {
        try {
            String mnemonic = seedStore.createMnemonic();
            new AlertDialog.Builder(this)
                .setTitle("Write down your recovery phrase")
                .setMessage(mnemonic + "\n\nAnyone with these words controls the wallet. BuildAWallet cannot recover them for you.")
                .setCancelable(false)
                .setNegativeButton("Erase and cancel", (dialog, which) -> {
                    seedStore.delete();
                    render();
                })
                .setPositiveButton("I wrote it down", (dialog, which) -> render())
                .show();
        } catch (Exception error) {
            showError("Could not create wallet", error);
        }
    }

    private void restoreWalletDialog() {
        EditText phrase = input("twelve or twenty-four words");
        phrase.setMinLines(3);
        phrase.setGravity(Gravity.TOP);
        phrase.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);

        LinearLayout box = dialogBox();
        box.addView(phrase);

        new AlertDialog.Builder(this)
            .setTitle("Restore wallet")
            .setMessage("Enter your BIP-39 recovery phrase. It is processed only on this device.")
            .setView(box)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Restore", (dialog, which) -> {
                try {
                    seedStore.importMnemonic(phrase.getText().toString());
                    render();
                } catch (Exception error) {
                    showError("Could not restore wallet", error);
                }
            })
            .show();
    }

    private void renderWallet() {
        try {
            engine = WalletEngine.fromMnemonic(seedStore.loadMnemonic());
        } catch (Exception error) {
            showError("Could not unlock wallet", error);
            seedStore.delete();
            renderOnboarding();
            return;
        }

        enabledNetworks = EvmNetwork.fromRequested(blueprint.networks);
        selectedNetwork = enabledNetworks.get(0);

        content.addView(label("BUILD A WALLET  /  MAINNET", 11, ACCENT, true));
        add(label(blueprint.name, 31, TEXT, true), 8);
        add(label(blueprint.theme + " · Self custody", 13, MUTED, false), 2);

        LinearLayout balanceCard = card();
        balanceView = label("—", 34, TEXT, true);
        balanceCard.addView(label("Available balance", 12, MUTED, false));
        addTo(balanceCard, balanceView, 8);
        add(balanceCard, 22);

        TextView addressView = label(engine.address(), 12, MUTED, false);
        addressView.setTextIsSelectable(true);
        add(addressView, 14);

        Button copy = button("Copy receive address", false);
        copy.setOnClickListener(v -> copyAddress());
        add(copy, 10);

        networkSpinner = new Spinner(this);
        ArrayAdapter<EvmNetwork> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, enabledNetworks);
        networkSpinner.setAdapter(adapter);
        networkSpinner.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) {
                selectedNetwork = enabledNetworks.get(position);
                refreshBalance();
            }
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) {}
        });
        add(networkSpinner, 18);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        Button send = button("Send", true);
        send.setOnClickListener(v -> sendDialog());
        Button receive = button("Receive", false);
        receive.setOnClickListener(v -> receiveDialog());
        actions.addView(send, new LinearLayout.LayoutParams(0, dp(52), 1f));
        LinearLayout.LayoutParams receiveParams = new LinearLayout.LayoutParams(0, dp(52), 1f);
        receiveParams.leftMargin = dp(10);
        actions.addView(receive, receiveParams);
        add(actions, 16);

        Button backup = button("Show recovery phrase", false);
        backup.setOnClickListener(v -> backupDialog());
        add(backup, 10);

        Button design = button("Import another BuildAWallet design", false);
        design.setOnClickListener(v -> chooseDesign());
        add(design, 10);

        Button reset = button("Erase wallet from this phone", false);
        reset.setTextColor(0xffff8f9a);
        reset.setOnClickListener(v -> confirmReset());
        add(reset, 10);

        statusView = label("Ready", 12, MUTED, false);
        add(statusView, 18);
        add(notice("Before sending, verify the network, destination, amount and displayed fee. Transactions are signed on-device only after your confirmation."), 18);

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
        amount.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);

        LinearLayout box = dialogBox();
        box.addView(label("Destination", 12, MUTED, true));
        box.addView(to);
        addTo(box, label("Amount (" + selectedNetwork.symbol + ")", 12, MUTED, true), 12);
        box.addView(amount);

        new AlertDialog.Builder(this)
            .setTitle("Prepare transaction")
            .setView(box)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Review", (dialog, which) -> prepareTransfer(to.getText().toString().trim(), amount.getText().toString().trim()))
            .show();
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
            .setMessage(engine.address() + "\n\nOnly send assets supported by this EVM address on the selected network.")
            .setNegativeButton("Close", null)
            .setPositiveButton("Copy", (dialog, which) -> copyAddress())
            .show();
    }

    private void backupDialog() {
        try {
            String mnemonic = seedStore.loadMnemonic();
            new AlertDialog.Builder(this)
                .setTitle("Recovery phrase")
                .setMessage(mnemonic + "\n\nNever paste these words into a website or support chat.")
                .setPositiveButton("Close", null)
                .show();
        } catch (Exception error) {
            showError("Could not read recovery phrase", error);
        }
    }

    private void confirmReset() {
        new AlertDialog.Builder(this)
            .setTitle("Erase wallet?")
            .setMessage("Make sure you have the recovery phrase. This removes the encrypted phrase from this device.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Erase", (dialog, which) -> {
                seedStore.delete();
                engine = null;
                render();
            })
            .show();
    }

    private void chooseDesign() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        startActivityForResult(intent, PICK_BLUEPRINT);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_BLUEPRINT || resultCode != RESULT_OK || data == null) return;
        Uri uri = data.getData();
        if (uri == null) return;
        try (InputStream stream = getContentResolver().openInputStream(uri)) {
            if (stream == null) throw new IOException("Could not open the selected file.");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = stream.read(buffer)) != -1) {
                if (out.size() + count > 65536) throw new IOException("The design file exceeds 64 KB.");
                out.write(buffer, 0, count);
            }
            Blueprint next = Blueprint.parse(out.toString(StandardCharsets.UTF_8.name()));
            getSharedPreferences(DESIGN_PREFS, MODE_PRIVATE).edit().putString("blueprint", next.toJson().toString()).apply();
            blueprint = next;
            render();
            Toast.makeText(this, "Design applied", Toast.LENGTH_SHORT).show();
        } catch (IOException | JSONException error) {
            showError("Cannot import design", error);
        }
    }

    private Blueprint loadBlueprint() {
        String json = getSharedPreferences(DESIGN_PREFS, MODE_PRIVATE).getString("blueprint", null);
        if (json == null) return Blueprint.defaults();
        try {
            return Blueprint.parse(json);
        } catch (JSONException error) {
            return Blueprint.defaults();
        }
    }

    private void applyDesignIntent(Intent intent, boolean notify) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri uri = intent.getData();
        if (uri == null || !"buildawallet".equals(uri.getScheme()) || !"import".equals(uri.getHost())) return;
        String json = uri.getQueryParameter("data");
        if (json == null || json.length() > 65536) {
            if (notify) showError("Cannot apply design", new IllegalArgumentException("Invalid design link."));
            return;
        }
        try {
            Blueprint next = Blueprint.parse(json);
            getSharedPreferences(DESIGN_PREFS, MODE_PRIVATE).edit().putString("blueprint", next.toJson().toString()).apply();
            blueprint = next;
            render();
            if (notify) Toast.makeText(this, "BuildAWallet design applied", Toast.LENGTH_SHORT).show();
        } catch (JSONException error) {
            if (notify) showError("Cannot apply design", error);
        }
    }

    private void copyAddress() {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        clipboard.setPrimaryClip(ClipData.newPlainText("wallet address", engine.address()));
        Toast.makeText(this, "Address copied", Toast.LENGTH_SHORT).show();
    }

    private void status(String text) {
        if (statusView != null) statusView.setText(text);
    }

    private void showError(String title, Throwable error) {
        new AlertDialog.Builder(this).setTitle(title).setMessage(safeMessage(error)).setPositiveButton("OK", null).show();
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
        button.setBackground(pill(primary ? ACCENT : CARD, primary ? ACCENT : 0xff31405a));
        return button;
    }

    private TextView notice(String text) {
        TextView notice = label(text, 12, 0xffffd38a, true);
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
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(topMargin);
        content.addView(view, params);
    }

    private void addTo(LinearLayout parent, View view, int topMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
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
