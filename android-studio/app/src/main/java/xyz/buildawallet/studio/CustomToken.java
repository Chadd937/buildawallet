package xyz.buildawallet.studio;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

/** User-imported ERC-20 display metadata, scoped to a chain and stored locally. */
final class CustomToken {
    final long chainId;
    final String name;
    final String symbol;
    final String address;
    final int decimals;

    CustomToken(long chainId, String name, String symbol, String address, int decimals) {
        this.chainId = chainId;
        this.name = name;
        this.symbol = symbol;
        this.address = address;
        this.decimals = decimals;
    }

    static List<CustomToken> load(Context context, long chainId) {
        SharedPreferences prefs = context.getSharedPreferences("custom_tokens_v1", Context.MODE_PRIVATE);
        String raw = prefs.getString("tokens", "[]");
        ArrayList<CustomToken> out = new ArrayList<>();
        try {
            JSONArray list = new JSONArray(raw);
            for (int i = 0; i < list.length(); i++) {
                JSONObject o = list.optJSONObject(i);
                if (o == null || o.optLong("chainId", -1) != chainId) continue;
                String name = o.optString("name", "").trim();
                String symbol = o.optString("symbol", "").trim();
                String address = o.optString("address", "").trim();
                int decimals = o.optInt("decimals", -1);
                if (name.isEmpty() || symbol.isEmpty() || !org.web3j.crypto.WalletUtils.isValidAddress(address) || decimals < 0 || decimals > 36) continue;
                out.add(new CustomToken(chainId, name, symbol, address, decimals));
            }
        } catch (Exception ignored) { }
        return out;
    }

    static void save(Context context, CustomToken token) {
        SharedPreferences prefs = context.getSharedPreferences("custom_tokens_v1", Context.MODE_PRIVATE);
        JSONArray list;
        try { list = new JSONArray(prefs.getString("tokens", "[]")); }
        catch (Exception ignored) { list = new JSONArray(); }
        JSONArray next = new JSONArray();
        try {
            for (int i = 0; i < list.length(); i++) {
                JSONObject o = list.optJSONObject(i);
                if (o == null) continue;
                if (o.optLong("chainId", -1) == token.chainId && o.optString("address", "").equalsIgnoreCase(token.address)) continue;
                next.put(o);
            }
            JSONObject o = new JSONObject();
            o.put("chainId", token.chainId);
            o.put("name", token.name);
            o.put("symbol", token.symbol);
            o.put("address", token.address);
            o.put("decimals", token.decimals);
            next.put(o);
            prefs.edit().putString("tokens", next.toString()).apply();
        } catch (Exception e) {
            throw new IllegalArgumentException("Could not save imported token metadata.", e);
        }
    }

    static void remove(Context context, CustomToken token) {
        SharedPreferences prefs = context.getSharedPreferences("custom_tokens_v1", Context.MODE_PRIVATE);
        JSONArray list;
        try { list = new JSONArray(prefs.getString("tokens", "[]")); }
        catch (Exception ignored) { return; }
        JSONArray next = new JSONArray();
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o == null) continue;
            if (o.optLong("chainId", -1) == token.chainId && o.optString("address", "").equalsIgnoreCase(token.address)) continue;
            next.put(o);
        }
        prefs.edit().putString("tokens", next.toString()).apply();
    }
}
