package xyz.buildawallet.studio;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Public wallet design metadata only. Never parse or retain keys, phrases or signatures here. */
final class Blueprint {
    final String name;
    final String avatar;
    final List<String> networks;
    final List<String> features;
    final String theme;

    private Blueprint(String name, String avatar, List<String> networks,
                      List<String> features, String theme) {
        this.name = name;
        this.avatar = avatar;
        this.networks = Collections.unmodifiableList(networks);
        this.features = Collections.unmodifiableList(features);
        this.theme = theme;
    }

    static Blueprint defaults() {
        ArrayList<String> networks = new ArrayList<>();
        networks.add("Ethereum");
        networks.add("Base");
        networks.add("Polygon");
        return new Blueprint("My Wallet", "M", networks, new ArrayList<>(), "Acid Vault");
    }

    static Blueprint parse(String json) throws JSONException {
        if (json == null || json.length() > 65536) {
            throw new JSONException("The design file must be smaller than 64 KB.");
        }
        JSONObject data = new JSONObject(json);
        String name = bounded(data.optString("name", "My Wallet").trim(), 40);
        if (name.isEmpty()) name = "My Wallet";
        String avatar = bounded(data.optString("avatar", name.substring(0, 1)), 4);

        List<String> networks = readStrings(data, data.has("chains") ? "chains" : "networks");
        List<String> supported = new ArrayList<>();
        for (String network : networks) {
            if (EvmNetwork.byName(network) != null && !supported.contains(network)) {
                supported.add(network);
            }
        }
        if (supported.isEmpty()) {
            supported.add("Ethereum");
            supported.add("Base");
            supported.add("Polygon");
        }

        List<String> features = readStrings(data, "features");
        String theme = bounded(data.optString("theme",
            data.optString("style", "Acid Vault")), 40);
        return new Blueprint(name, avatar, supported, features, theme);
    }

    JSONObject toJson() throws JSONException {
        return new JSONObject()
            .put("name", name)
            .put("avatar", avatar)
            .put("chains", new JSONArray(networks))
            .put("features", new JSONArray(features))
            .put("theme", theme);
    }

    private static List<String> readStrings(JSONObject data, String key) throws JSONException {
        JSONArray values = data.optJSONArray(key);
        ArrayList<String> result = new ArrayList<>();
        if (values == null) return result;
        if (values.length() > 32) throw new JSONException("Too many " + key + " choices.");
        for (int i = 0; i < values.length(); i++) {
            Object raw = values.get(i);
            if (!(raw instanceof String)) throw new JSONException("Invalid " + key + " choice.");
            String value = bounded(((String) raw).trim(), 64);
            if (!value.isEmpty() && !result.contains(value)) result.add(value);
        }
        return result;
    }

    private static String bounded(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }
}
