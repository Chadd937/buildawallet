package xyz.buildawallet.studio;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Local Android wallet preferences only. No keys, phrases or signatures live here. */
final class WalletProfile {
    private static final String PREFS = "wallet_profile_v2";
    private static final String NAME = "name";
    private static final String THEME = "theme";
    private static final String NETWORKS = "networks";
    private static final String AUTO_LOCK = "auto_lock_min", BIG_SEND = "big_send_usd", SESSION_LIMIT = "session_limit_usd", CURRENCY = "currency", WALLET_STYLE = "wallet_style", NAV_STYLE = "navigation_style", ASSET_STYLE = "asset_style", ACTION_STYLE = "action_style";

    static final String[] THEMES = {"Acid Vault", "Pixel Pop", "Clean Signal", "Gold Rush"};

    final String name;
    final String theme;
    final List<String> networks;
    final int autoLockMin, bigSendUsd, sessionLimitUsd;
    final String currency, walletStyle, navigationStyle, assetStyle, actionStyle;

    private WalletProfile(String name, String theme, List<String> networks, int autoLockMin, int bigSendUsd, int sessionLimitUsd, String currency, String walletStyle, String navigationStyle, String assetStyle, String actionStyle) {
        this.name = name;
        this.theme = theme;
        this.networks = List.copyOf(networks);
        this.autoLockMin = autoLockMin; this.bigSendUsd = bigSendUsd; this.sessionLimitUsd = sessionLimitUsd;
        this.currency = currency; this.walletStyle = walletStyle; this.navigationStyle = navigationStyle; this.assetStyle = assetStyle; this.actionStyle = actionStyle;
    }

    static WalletProfile defaults() {
        ArrayList<String> networks = new ArrayList<>();
        networks.add("Ethereum");
        networks.add("Base");
        networks.add("Polygon");
        return create("My Wallet", "Acid Vault", networks);
    }

    static WalletProfile create(String rawName, String rawTheme, List<String> requested) {
        String name = rawName == null ? "" : rawName.trim();
        if (name.isEmpty()) name = "My Wallet";
        if (name.length() > 40) name = name.substring(0, 40);

        String theme = isTheme(rawTheme) ? rawTheme : "Acid Vault";
        ArrayList<String> networks = new ArrayList<>();
        if (requested != null) {
            for (String value : requested) {
                EvmNetwork network = EvmNetwork.byName(value);
                if (network != null && !networks.contains(network.name)) networks.add(network.name);
            }
        }
        if (networks.isEmpty()) networks.add("Ethereum");
        return new WalletProfile(name, theme, networks, 10, 1000, 5000, "usd", "classic", "bottom", "detailed", "duo");
    }

    static WalletProfile load(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.contains(NAME)) return defaults();

        String name = prefs.getString(NAME, "My Wallet");
        String theme = prefs.getString(THEME, "Acid Vault");
        Set<String> stored = prefs.getStringSet(NETWORKS, null);
        ArrayList<String> networks = new ArrayList<>();
        if (stored != null) {
            for (EvmNetwork network : EvmNetwork.all()) {
                if (stored.contains(network.name)) networks.add(network.name);
            }
        }
        WalletProfile base = create(name, theme, networks);
        return new WalletProfile(name, theme, networks, prefs.getInt(AUTO_LOCK, base.autoLockMin), prefs.getInt(BIG_SEND, base.bigSendUsd), prefs.getInt(SESSION_LIMIT, base.sessionLimitUsd), prefs.getString(CURRENCY, base.currency), prefs.getString(WALLET_STYLE, base.walletStyle), prefs.getString(NAV_STYLE, base.navigationStyle), prefs.getString(ASSET_STYLE, base.assetStyle), prefs.getString(ACTION_STYLE, base.actionStyle));
    }

    void save(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(NAME, name)
            .putString(THEME, theme)
            .putStringSet(NETWORKS, new HashSet<>(networks))
            .putInt(AUTO_LOCK, autoLockMin).putInt(BIG_SEND, bigSendUsd).putInt(SESSION_LIMIT, sessionLimitUsd)
            .putString(CURRENCY, currency).putString(WALLET_STYLE, walletStyle).putString(NAV_STYLE, navigationStyle).putString(ASSET_STYLE, assetStyle).putString(ACTION_STYLE, actionStyle)
            .apply();
    }

    WalletProfile withSettings(int autoLockMin, int bigSendUsd, int sessionLimitUsd, String currency, String walletStyle, String navigationStyle, String assetStyle, String actionStyle) { return new WalletProfile(name, theme, networks, Math.max(1, autoLockMin), Math.max(0, bigSendUsd), Math.max(0, sessionLimitUsd), currency, walletStyle, navigationStyle, assetStyle, actionStyle); }

    static void clear(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }

    static int themeIndex(String theme) {
        for (int i = 0; i < THEMES.length; i++) if (THEMES[i].equals(theme)) return i;
        return 0;
    }

    static int accentFor(String theme) {
        if ("Pixel Pop".equals(theme)) return 0xffff6b9e;
        if ("Clean Signal".equals(theme)) return 0xff8da2ff;
        if ("Gold Rush".equals(theme)) return 0xffffd166;
        return 0xff56ebd3;
    }

    private static boolean isTheme(String value) {
        if (value == null) return false;
        for (String theme : THEMES) if (theme.equals(value)) return true;
        return false;
    }
}
