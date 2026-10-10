package xyz.buildawallet.studio;

import android.net.Uri;

import org.bitcoinj.base.BitcoinNetwork;
import org.bitcoinj.base.Coin;
import org.bitcoinj.base.ScriptType;
import org.bitcoinj.core.Transaction;
import org.bitcoinj.wallet.DeterministicSeed;
import org.bitcoinj.wallet.KeyChainGroupStructure;
import org.bitcoinj.wallet.SendRequest;
import org.bitcoinj.wallet.Wallet;
import org.bitcoinj.wallet.WalletTransaction;
import org.json.JSONArray;
import org.json.JSONObject;
import org.p2p.solanaj.core.Account;
import org.p2p.solanaj.core.PublicKey;
import org.bitcoinj.base.Address;
import org.bitcoinj.base.AddressParser;

import org.p2p.solanaj.programs.SystemProgram;
import org.p2p.solanaj.programs.TokenProgram;
import org.p2p.solanaj.programs.AssociatedTokenProgram;
import org.p2p.solanaj.core.AccountMeta;
import org.p2p.solanaj.core.TransactionInstruction;
import org.p2p.solanaj.rpc.types.SplTokenAccountInfo;
import org.p2p.solanaj.rpc.types.TokenAccountInfo;
import org.p2p.solanaj.rpc.types.TokenResultObjects;
import org.p2p.solanaj.rpc.Cluster;
import org.p2p.solanaj.rpc.RpcClient;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.math.BigInteger;
import java.nio.ByteOrder;
import java.util.stream.Collectors;

final class NonEvmEngine {
    private static final long LAMPORTS_PER_SOL = 1_000_000_000L;
    private static final String BTC_API = "https://blockstream.info/api";
    private final Account solana;
    private final Wallet bitcoin;
    private final RpcClient solanaRpc;

    private NonEvmEngine(String mnemonic) {
        solana = Account.fromMnemonic(Arrays.asList(mnemonic.trim().split("\\s+")), "");
        DeterministicSeed seed = DeterministicSeed.ofMnemonic(mnemonic, "");
        bitcoin = Wallet.fromSeed(BitcoinNetwork.MAINNET, seed, ScriptType.P2WPKH, KeyChainGroupStructure.BIP43);
        solanaRpc = new RpcClient(Cluster.MAINNET);
    }

    static NonEvmEngine fromMnemonic(String mnemonic) {
        return new NonEvmEngine(mnemonic);
    }

    String solanaAddress() {
        return solana.getPublicKey().toBase58();
    }

    String solanaBalance() throws Exception {
        long lamports = solanaRpc.getApi().getBalance(solana.getPublicKey());
        return BigDecimal.valueOf(lamports).divide(BigDecimal.valueOf(LAMPORTS_PER_SOL), 9, RoundingMode.DOWN).stripTrailingZeros().toPlainString() + " SOL";
    }

    String sendSolana(String destination, BigDecimal amount) throws Exception {
        PublicKey to = new PublicKey(destination);
        long lamports = amount.movePointRight(9).longValueExact();
        if (lamports <= 0) throw new IllegalArgumentException("Amount must be greater than zero.");
        long balance = solanaRpc.getApi().getBalance(solana.getPublicKey());
        if (balance < lamports) throw new IllegalArgumentException("Insufficient SOL balance.");
        org.p2p.solanaj.core.Transaction tx = new org.p2p.solanaj.core.Transaction();
        tx.addInstruction(SystemProgram.transfer(solana.getPublicKey(), to, lamports));
        return solanaRpc.getApi().sendTransaction(tx, solana);
    }



    static final String TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

    static final class SolanaMintInfo {
        final String mint, programId, onChainName, onChainSymbol;
        final int decimals;
        final boolean extensionsSupported;
        final String extensionWarning;
        SolanaMintInfo(String mint, String programId, int decimals, String name, String symbol, boolean supported, String warning) {
            this.mint=mint; this.programId=programId; this.decimals=decimals; this.onChainName=name; this.onChainSymbol=symbol; this.extensionsSupported=supported; this.extensionWarning=warning;
        }
    }

    SolanaMintInfo inspectSolanaMint(String mintText) throws Exception {
        PublicKey mint = new PublicKey(mintText.trim());
        SplTokenAccountInfo response = solanaRpc.getApi().getSplTokenAccountInfo(mint);
        if (response == null || response.getValue() == null) throw new IllegalArgumentException("Mint account does not exist on Solana mainnet.");
        String programId = response.getValue().getOwner();
        if (!TokenProgram.PROGRAM_ID.toBase58().equals(programId) && !TOKEN_2022_PROGRAM_ID.equals(programId)) throw new IllegalArgumentException("Address is not owned by the original SPL Token program or Token-2022.");
        TokenResultObjects.Data data = response.getValue().getData();
        TokenResultObjects.ParsedData parsed = data == null ? null : data.getParsed();
        TokenResultObjects.TokenInfo info = parsed == null ? null : parsed.getInfo();
        if (info == null || !"mint".equalsIgnoreCase(parsed.getType()) || !info.isInitialized()) throw new IllegalArgumentException("Address is not an initialized SPL mint.");
        int decimals = info.getDecimals();
        if (decimals < 0 || decimals > 18) throw new IllegalArgumentException("Mint decimals are outside the wallet's supported safe range (0–18).");
        ArrayList<String> unsupported = new ArrayList<>();
        List<TokenResultObjects.Extension> extensions = info.getExtensions();
        if (extensions != null) for (TokenResultObjects.Extension extension : extensions) {
            String type = extension == null ? "unknown" : extension.getExtensionType();
            if (type == null || (!"metadataPointer".equalsIgnoreCase(type) && !"tokenMetadata".equalsIgnoreCase(type))) unsupported.add(type == null ? "unknown" : type);
        }
        boolean supported = unsupported.isEmpty();
        String warning = supported ? "" : "Unsupported Token-2022 extension(s): " + String.join(", ", unsupported) + ". Sending is blocked until these semantics are implemented and reviewed.";
        return new SolanaMintInfo(mint.toBase58(), programId, decimals, response.getTokenName().orElse(""), response.getTokenSymbol().orElse(""), supported, warning);
    }

    String solanaTokenBalance(String mintText) throws Exception {
        SolanaMintInfo info = inspectSolanaMint(mintText);
        TokenAccountInfo accounts = solanaRpc.getApi().getTokenAccountsByOwner(solana.getPublicKey(), Map.of("mint", info.mint), Map.of("encoding", "jsonParsed"));
        BigInteger total = BigInteger.ZERO;
        if (accounts != null && accounts.getValue() != null) for (TokenAccountInfo.Value account : accounts.getValue()) {
            TokenResultObjects.Value raw = account.getAccount();
            TokenResultObjects.Data data = raw == null ? null : raw.getData();
            TokenResultObjects.ParsedData parsed = data == null ? null : data.getParsed();
            TokenResultObjects.TokenInfo token = parsed == null ? null : parsed.getInfo();
            TokenResultObjects.TokenAmountInfo amount = token == null ? null : token.getTokenAmount();
            if (amount != null && amount.getAmount() != null) total = total.add(new BigInteger(amount.getAmount()));
        }
        return WalletEngine.formatToken(total, info.decimals);
    }

    String bitcoinAddress() {
        return bitcoin.currentReceiveAddress().toString();
    }

    String bitcoinBalance() throws Exception {
        JSONObject j = new JSONObject(httpGet(BTC_API + "/address/" + Uri.encode(bitcoinAddress())));
        JSONObject chain = j.getJSONObject("chain_stats");
        JSONObject mempool = j.getJSONObject("mempool_stats");
        long sats = chain.getLong("funded_txo_sum") - chain.getLong("spent_txo_sum")
            + mempool.getLong("funded_txo_sum") - mempool.getLong("spent_txo_sum");
        return formatBtc(sats);
    }

    String sendBitcoin(String destination, BigDecimal amountBtc, long feeRateSatVb) throws Exception {
        if (!destination.startsWith("bc1")) throw new IllegalArgumentException("Bitcoin mainnet destination must be a native SegWit bc1 address.");
        if (destination.equals(bitcoinAddress())) throw new IllegalArgumentException("You can't send Bitcoin to your own receive address.");
        if (amountBtc.signum() <= 0) throw new IllegalArgumentException("Amount must be greater than zero.");
        long sats = amountBtc.movePointRight(8).longValueExact();
        if (sats <= 0) throw new IllegalArgumentException("Amount is below one satoshi.");
        long rate = Math.max(1L, Math.min(feeRateSatVb, 500L));

        JSONArray utxos = new JSONArray(httpGet(BTC_API + "/address/" + Uri.encode(bitcoinAddress()) + "/utxo"));
        loadConfirmedUtxosIntoWallet(utxos);

        Address destinationAddress = AddressParser.getDefault(BitcoinNetwork.MAINNET).parseAddress(destination);
        SendRequest req = SendRequest.to(destinationAddress, Coin.valueOf(sats));
        req.feePerKb = Coin.valueOf(Math.multiplyExact(rate, 1000L));
        bitcoin.completeTx(req);
        bitcoin.commitTx(req.tx);

        String raw = bytesToHex(req.tx.bitcoinSerialize());
        String response = httpPost(BTC_API + "/tx", raw);
        return response.trim();
    }

    private void loadConfirmedUtxosIntoWallet(JSONArray utxos) throws Exception {
        for (int i = 0; i < utxos.length(); i++) {
            JSONObject u = utxos.getJSONObject(i);
            JSONObject status = u.getJSONObject("status");
            if (!status.optBoolean("confirmed", false)) continue;
            String txid = u.getString("txid");
            int vout = u.getInt("vout");
            if (bitcoin.getTransaction(org.bitcoinj.base.Sha256Hash.wrap(txid)) != null) continue;
            String raw = httpGet(BTC_API + "/tx/" + txid + "/hex");
            byte[] bytes = hexToBytes(raw.trim());
            org.bitcoinj.core.Transaction funding = org.bitcoinj.core.Transaction.read(ByteBuffer.wrap(bytes));
            bitcoin.addWalletTransaction(new WalletTransaction(WalletTransaction.Pool.UNSPENT, funding));
            if (vout >= funding.getOutputs().size()) throw new IllegalStateException("Bitcoin UTXO output index is invalid.");
        }
    }

    private static String formatBtc(long sats) {
        return BigDecimal.valueOf(sats).movePointLeft(8).stripTrailingZeros().toPlainString() + " BTC";
    }

    private static String httpGet(String endpoint) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(endpoint).openConnection();
        c.setRequestMethod("GET");
        c.setConnectTimeout(12000);
        c.setReadTimeout(20000);
        c.setRequestProperty("Accept", "application/json,text/plain");
        int code = c.getResponseCode();
        BufferedReader reader = new BufferedReader(new InputStreamReader(
            code >= 400 ? c.getErrorStream() : c.getInputStream()));
        String body = reader.lines().collect(Collectors.joining("\\n"));
        reader.close();
        c.disconnect();
        if (code < 200 || code >= 300) throw new IllegalStateException("Bitcoin service returned HTTP " + code + ": " + body);
        return body;
    }

    private static String httpPost(String endpoint, String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(endpoint).openConnection();
        c.setRequestMethod("POST");
        c.setConnectTimeout(12000);
        c.setReadTimeout(20000);
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "text/plain");
        try (OutputStream out = c.getOutputStream()) {
            out.write(body.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        int code = c.getResponseCode();
        BufferedReader reader = new BufferedReader(new InputStreamReader(
            code >= 400 ? c.getErrorStream() : c.getInputStream()));
        String response = reader.lines().collect(Collectors.joining("\\n"));
        reader.close();
        c.disconnect();
        if (code < 200 || code >= 300) throw new IllegalStateException("Bitcoin broadcast returned HTTP " + code + ": " + response);
        return response;
    }

    private static byte[] hexToBytes(String s) {
        if ((s.length() & 1) != 0) throw new IllegalArgumentException("Invalid transaction hex.");
        byte[] out = new byte[s.length() / 2];
        for (int i = 0; i < out.length; i++) out[i] = (byte) Integer.parseInt(s.substring(i * 2, i * 2 + 2), 16);
        return out;
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) out.append(String.format("%02x", b & 0xff));
        return out.toString();
    }

    void close() {
        // RpcClient is lightweight and owns no persistent native resources.
    }
}
