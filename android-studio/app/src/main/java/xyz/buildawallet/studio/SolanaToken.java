package xyz.buildawallet.studio;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** User-imported Solana fungible token display metadata, scoped to a mint address. */
final class SolanaToken {
    final String name;
    final String symbol;
    final String mint;
    final int decimals;
    final String programId;

    SolanaToken(String name, String symbol, String mint, int decimals, String programId) {
        this.name = name;
        this.symbol = symbol;
        this.mint = mint;
        this.decimals = decimals;
        this.programId = programId;
    }

    static java.math.BigInteger toRawAmount(String amountText, int decimals) {
        if (decimals < 0 || decimals > 255) throw new IllegalArgumentException("Token decimals must be between 0 and 255.");
        java.math.BigDecimal amount;
        try { amount = new java.math.BigDecimal(amountText.trim()); }
        catch (Exception error) { throw new IllegalArgumentException("Enter a valid token amount."); }
        if (amount.signum() <= 0) throw new IllegalArgumentException("Amount must be greater than zero.");
        java.math.BigInteger raw;
        try { raw = amount.movePointRight(decimals).toBigIntegerExact(); }
        catch (ArithmeticException error) { throw new IllegalArgumentException("Amount has too many decimal places for this token."); }
        java.math.BigInteger maxU64 = java.math.BigInteger.ONE.shiftLeft(64).subtract(java.math.BigInteger.ONE);
        if (raw.signum() <= 0 || raw.compareTo(maxU64) > 0) {
            throw new IllegalArgumentException("Amount exceeds the SPL token program's unsigned 64-bit transfer range.");
        }
        return raw;
    }

    static List<SolanaToken> load(Context context) {
        SharedPreferences prefs = context.getSharedPreferences("solana_custom_tokens_v1", Context.MODE_PRIVATE);
        ArrayList<SolanaToken> out = new ArrayList<>();
        try {
            JSONArray list = new JSONArray(prefs.getString("tokens", "[]"));
            for (int i = 0; i < list.length(); i++) {
                JSONObject o = list.optJSONObject(i);
                if (o == null) continue;
                String name = o.optString("name", "").trim();
                String symbol = o.optString("symbol", "").trim();
                String mint = o.optString("mint", "").trim();
                String programId = o.optString("programId", "").trim();
                int decimals = o.optInt("decimals", -1);
                if (name.isEmpty() || symbol.isEmpty() || mint.isEmpty() || programId.isEmpty()
                        || decimals < 0 || decimals > 18) continue;
                out.add(new SolanaToken(name, symbol, mint, decimals, programId));
            }
        } catch (Exception ignored) { }
        return out;
    }

    static void save(Context context, SolanaToken token) {
        SharedPreferences prefs = context.getSharedPreferences("solana_custom_tokens_v1", Context.MODE_PRIVATE);
        JSONArray next = new JSONArray();
        try {
            JSONArray current = new JSONArray(prefs.getString("tokens", "[]"));
            for (int i = 0; i < current.length(); i++) {
                JSONObject o = current.optJSONObject(i);
                if (o == null || o.optString("mint", "").equals(token.mint)) continue;
                next.put(o);
            }
            JSONObject item = new JSONObject();
            item.put("name", token.name);
            item.put("symbol", token.symbol);
            item.put("mint", token.mint);
            item.put("decimals", token.decimals);
            item.put("programId", token.programId);
            next.put(item);
        } catch (Exception e) {
            throw new IllegalArgumentException("Could not save SPL token metadata.", e);
        }
        if (!prefs.edit().putString("tokens", next.toString()).commit()) {
            throw new IllegalStateException("Could not persist imported SPL token metadata.");
        }
    }

    static void remove(Context context, SolanaToken token) {
        SharedPreferences prefs = context.getSharedPreferences("solana_custom_tokens_v1", Context.MODE_PRIVATE);
        try {
            JSONArray current = new JSONArray(prefs.getString("tokens", "[]"));
            JSONArray next = new JSONArray();
            for (int i = 0; i < current.length(); i++) {
                JSONObject o = current.optJSONObject(i);
                if (o != null && !o.optString("mint", "").equals(token.mint)) next.put(o);
            }
            prefs.edit().putString("tokens", next.toString()).commit();
        } catch (Exception ignored) { }
    }
}
