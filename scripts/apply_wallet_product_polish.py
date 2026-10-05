from pathlib import Path

root = Path(__file__).resolve().parents[1]
main_path = root / "android-studio/app/src/main/java/xyz/buildawallet/studio/MainActivity.java"
gradle_path = root / "android-studio/app/build.gradle"

text = main_path.read_text()
text = text.replace(
    "    private TextView balanceView;\n    private TextView statusView;",
    "    private TextView balanceView;\n    private TextView assetBalanceView;\n    private TextView statusView;",
)

start = text.index("    private void renderWallet() {")
end = text.index("    private void refreshBalance() {")

replacement = r'''    private void renderWallet() {
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

'''

text = text[:start] + replacement + text[end:]
text = text.replace(
    "                    if (network == selectedNetwork) balanceView.setText(balance);",
    "                    if (network == selectedNetwork) {\n                        balanceView.setText(balance);\n                        if (assetBalanceView != null) assetBalanceView.setText(balance);\n                    }",
)
text = text.replace(
    "                    if (network == selectedNetwork) balanceView.setText(\"Unavailable\");",
    "                    if (network == selectedNetwork) {\n                        balanceView.setText(\"Unavailable\");\n                        if (assetBalanceView != null) assetBalanceView.setText(\"Unavailable\");\n                    }",
)

main_path.write_text(text)

gradle = gradle_path.read_text()
gradle = gradle.replace("versionCode 3", "versionCode 4").replace("versionName '1.2.0'", "versionName '1.3.0'")
gradle_path.write_text(gradle)
