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

    static final String[] THEMES = {"Acid Vault", "Pixel Pop", "Clean Signal", "Gold Rush"};

    final String name;
    final String theme;
    final List<String> networks;

    private WalletProfile(String name, String theme, List<String> networks) {
        this.name = name;
        this.theme = theme;
        this.networks = List.copyOf(networks);
    }

    static WalletProfile defaults() {
        ArrayList<String> networks = new ArrayList<>();
        networks.add("Ethereum");
        networks.add("Base");
        networks.add("Polygon");
        return new WalletProfile("My Wallet", "Acid Vault", networks);
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
        return new WalletProfile(name, theme, networks);
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
        return create(name, theme, networks);
    }

    void save(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(NAME, name)
            .putString(THEME, theme)
            .putStringSet(NETWORKS, new HashSet<>(networks))
            .apply();
    }

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
