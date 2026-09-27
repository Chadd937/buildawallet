package xyz.buildawallet.studio;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Design data only. Never parse or retain keys, phrases, signatures or credentials. */
final class Blueprint {
    final String name;
    final List<String> networks;
    final List<String> assets;
    final String style;
    final String accent;

    private Blueprint(String name, List<String> networks, List<String> assets,
                      String style, String accent) {
        this.name = name;
        this.networks = Collections.unmodifiableList(networks);
        this.assets = Collections.unmodifiableList(assets);
        this.style = style;
        this.accent = accent;
    }

    static Blueprint parse(String json) throws JSONException {
        if (json == null || json.length() > 65536) {
            throw new JSONException("The design file must be smaller than 64 KB.");
        }
        JSONObject data = new JSONObject(json);
        String name = data.optString("name", "My wallet").trim();
        if (name.isEmpty()) name = "My wallet";
        name = bounded(name, 40);
        List<String> networks = readIds(data, "networks");
        List<String> assets = readIds(data, "assets");
        if (networks.isEmpty()) {
            throw new JSONException("Choose at least one chain in the Studio before exporting.");
        }
        return new Blueprint(name, networks, assets,
            bounded(data.optString("style", "st_glass"), 32),
            bounded(data.optString("accent", "a_green"), 32));
    }

    private static List<String> readIds(JSONObject data, String key) throws JSONException {
        JSONArray values = data.optJSONArray(key);
        ArrayList<String> result = new ArrayList<>();
        if (values == null) return result;
        if (values.length() > 32) throw new JSONException("Too many " + key + " choices.");
        for (int i = 0; i < values.length(); i++) {
            Object value = values.get(i);
            if (!(value instanceof String)) throw new JSONException("Invalid " + key + " choice.");
            String id = (String) value;
            if (!id.matches("[a-z0-9_]{1,32}")) throw new JSONException("Invalid " + key + " choice.");
            if (!result.contains(id)) result.add(id);
        }
        return result;
    }

    private static String bounded(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }
}
