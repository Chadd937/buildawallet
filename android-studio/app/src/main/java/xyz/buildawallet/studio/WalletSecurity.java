package xyz.buildawallet.studio;

import android.content.Context;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/** Local transaction guardrails. USD estimates are indicative market data, not guaranteed execution prices. */
final class WalletSecurity {
    private static final String PREFS = "wallet_security_limits_v1";
    private static final long WINDOW_MS = 24L * 60L * 60L * 1000L;

    private WalletSecurity() { }

    static BigDecimal usdValue(WalletEngine.PreparedTransfer transfer) throws Exception {
        BigDecimal amount = new BigDecimal(transfer.valueWei).movePointLeft(
            transfer.assetToken == null ? 18 : transfer.tokenDecimals);
        BigDecimal price = transfer.assetToken == null
            ? nativePrice(transfer.network)
            : tokenPrice(transfer.network, transfer.assetToken);
        if (price.signum() <= 0) throw new IllegalStateException("No trustworthy USD price is available for this asset.");
        return amount.multiply(price).setScale(8, RoundingMode.HALF_UP);
    }

    static BigDecimal nativeUsdValue(EvmNetwork network, BigDecimal nativeAmount) throws Exception {
        BigDecimal price = nativePrice(network);
        if (price.signum() <= 0) throw new IllegalStateException("No trustworthy USD price is available for " + network.symbol + ".");
        return nativeAmount.multiply(price).setScale(8, RoundingMode.HALF_UP);
    }

    static BigDecimal tokenUsdValue(EvmNetwork network, String tokenAddress, BigDecimal tokenAmount) throws Exception {
        BigDecimal price = tokenPrice(network, tokenAddress);
        if (price.signum() <= 0) throw new IllegalStateException("No trustworthy USD price is available for this token.");
        return tokenAmount.multiply(price).setScale(8, RoundingMode.HALF_UP);
    }

    static BigDecimal coinUsdValue(String coinId, BigDecimal amount) throws Exception {
        if (!"bitcoin".equals(coinId) && !"solana".equals(coinId)) {
            throw new IllegalArgumentException("Unsupported price asset.");
        }
        JSONObject root = getJson("https://api.coingecko.com/api/v3/simple/price?ids=" + enc(coinId) + "&vs_currencies=usd");
        JSONObject item = root.optJSONObject(coinId);
        if (item == null || !item.has("usd") || item.isNull("usd")) throw new IllegalStateException("USD price feed did not return a price for " + coinId + ".");
        return amount.multiply(new BigDecimal(item.get("usd").toString())).setScale(8, RoundingMode.HALF_UP);
    }

    private static BigDecimal nativePrice(EvmNetwork network) throws Exception {
        String id;
        switch ((int) network.chainId) {
            case 1:
            case 8453:
            case 42161:
            case 10: id = "ethereum"; break;
            case 137: id = "polygon-ecosystem-token"; break;
            case 56: id = "binancecoin"; break;
            case 43114: id = "avalanche-2"; break;
            default: throw new IllegalStateException("No USD price mapping exists for " + network.name + ".");
        }
        JSONObject root = getJson("https://api.coingecko.com/api/v3/simple/price?ids="
            + enc(id) + "&vs_currencies=usd");
        JSONObject item = root.optJSONObject(id);
        if (item == null || !item.has("usd") || item.isNull("usd")) throw new IllegalStateException("USD price feed did not return a price for " + network.symbol + ".");
        return new BigDecimal(item.get("usd").toString());
    }

    private static BigDecimal tokenPrice(EvmNetwork network, String tokenAddress) throws Exception {
        String platform;
        switch ((int) network.chainId) {
            case 1: platform = "ethereum"; break;
            case 8453: platform = "base"; break;
            case 42161: platform = "arbitrum-one"; break;
            case 10: platform = "optimistic-ethereum"; break;
            case 137: platform = "polygon-pos"; break;
            case 56: platform = "binance-smart-chain"; break;
            case 43114: platform = "avalanche"; break;
            default: throw new IllegalStateException("No token-price platform mapping exists for " + network.name + ".");
        }
        JSONObject root = getJson("https://api.coingecko.com/api/v3/simple/token_price/" + platform
            + "?contract_addresses=" + enc(tokenAddress.toLowerCase(java.util.Locale.ROOT)) + "&vs_currencies=usd");
        JSONObject item = root.optJSONObject(tokenAddress.toLowerCase(java.util.Locale.ROOT));
        if (item == null || !item.has("usd") || item.isNull("usd")) {
            throw new IllegalStateException("No USD market price is available for this token. The active USD spending limit cannot safely value it, so sending is blocked. You may set the 24-hour USD limit to 0 to disable that limit explicitly.");
        }
        return new BigDecimal(item.get("usd").toString());
    }

    private static JSONObject getJson(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(5000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "BuildAWallet-Android/1.3");
        try {
            int code = connection.getResponseCode();
            InputStream stream = code >= 200 && code < 300 ? connection.getInputStream() : connection.getErrorStream();
            if (stream == null) throw new IllegalStateException("USD price service returned HTTP " + code + ".");
            StringBuilder body = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
            }
            if (code < 200 || code >= 300) throw new IllegalStateException("USD price service returned HTTP " + code + ".");
            return new JSONObject(body.toString());
        } finally {
            connection.disconnect();
        }
    }

    private static String enc(String value) throws Exception {
        return URLEncoder.encode(value, "UTF-8");
    }

    static synchronized Reservation reserve(Context context, String walletAddress, BigDecimal usdAmount, int limitUsd) {
        if (limitUsd <= 0) return new Reservation(null, null, BigDecimal.ZERO);
        if (usdAmount == null || usdAmount.signum() < 0) throw new IllegalArgumentException("Could not value this transaction for the USD spending limit.");
        String walletKey = walletAddress.toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]", "");
        String eventsKey = "events_usd_" + walletKey;
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        org.json.JSONArray stored;
        try { stored = new org.json.JSONArray(prefs.getString(eventsKey, "[]")); }
        catch (Exception error) {
            throw new IllegalStateException("The saved spending-limit history could not be read. Transactions are blocked until the local limit history is repaired.", error);
        }
        org.json.JSONArray active = new org.json.JSONArray();
        BigDecimal spent = BigDecimal.ZERO;
        try {
            for (int i = 0; i < stored.length(); i++) {
                JSONObject event = stored.optJSONObject(i);
                if (event == null) throw new IllegalStateException("Invalid spending-limit history entry.");
                long timestamp = event.getLong("timestamp");
                if (timestamp > now) throw new IllegalStateException("Spending-limit history contains a future timestamp.");
                if (now - timestamp >= WINDOW_MS) continue;
                BigDecimal amount = new BigDecimal(event.getString("amount"));
                if (amount.signum() < 0) throw new IllegalStateException("Invalid spending-limit history amount.");
                active.put(event);
                spent = spent.add(amount);
            }
        } catch (Exception error) {
            throw new IllegalStateException("The saved spending-limit history is invalid. Transactions are blocked for safety.", error);
        }
        BigDecimal total = spent.add(usdAmount);
        if (total.compareTo(BigDecimal.valueOf(limitUsd)) > 0) {
            throw new IllegalStateException("This transaction would exceed your rolling 24-hour spending limit. Already counted: $"
                + spent.setScale(2, RoundingMode.HALF_UP).toPlainString() + "; this transaction: $"
                + usdAmount.setScale(2, RoundingMode.HALF_UP).toPlainString() + "; limit: $"
                + limitUsd + ".");
        }
        String reservationId = java.util.UUID.randomUUID().toString();
        JSONObject event = new JSONObject();
        try {
            event.put("id", reservationId);
            event.put("timestamp", now);
            event.put("amount", usdAmount.toPlainString());
            active.put(event);
        } catch (Exception error) {
            throw new IllegalStateException("Could not prepare the spending-limit reservation.", error);
        }
        boolean saved = prefs.edit().putString(eventsKey, active.toString()).commit();
        if (!saved) throw new IllegalStateException("Could not persist the spending-limit reservation. Transaction cancelled for safety.");
        return new Reservation(walletAddress.toLowerCase(java.util.Locale.ROOT), reservationId, usdAmount);
    }

    static synchronized void release(Context context, Reservation reservation) {
        if (reservation == null || reservation.wallet == null || reservation.id == null) return;
        String walletKey = reservation.wallet.replaceAll("[^a-z0-9]", "");
        String eventsKey = "events_usd_" + walletKey;
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        org.json.JSONArray stored;
        try { stored = new org.json.JSONArray(prefs.getString(eventsKey, "[]")); }
        catch (Exception error) { return; }
        org.json.JSONArray next = new org.json.JSONArray();
        for (int i = 0; i < stored.length(); i++) {
            JSONObject event = stored.optJSONObject(i);
            if (event == null || reservation.id.equals(event.optString("id"))) continue;
            next.put(event);
        }
        prefs.edit().putString(eventsKey, next.toString()).commit();
    }

    static final class Reservation {
        final String wallet;
        final String id;
        final BigDecimal amount;
        Reservation(String wallet, String id, BigDecimal amount) {
            this.wallet = wallet;
            this.id = id;
            this.amount = amount;
        }
    }
}
