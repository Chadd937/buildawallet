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
        String name = "";
        String symbol = "";
        if (extensions != null) for (TokenResultObjects.Extension extension : extensions) {
            if (extension == null || extension.getState() == null) continue;
            if ("tokenMetadata".equalsIgnoreCase(extension.getExtensionType())) {
                if (extension.getState().getName() != null) name = extension.getState().getName();
                if (extension.getState().getSymbol() != null) symbol = extension.getState().getSymbol();
            }
        }
        return new SolanaMintInfo(mint.toBase58(), programId, decimals, name, symbol, supported, warning);
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


    String previewSolanaTokenTransfer(SolanaToken token, String destinationText, String amountText) throws Exception {
        PublicKey destination = new PublicKey(destinationText.trim());
        if (destination.equals(solana.getPublicKey())) throw new IllegalArgumentException("Recipient is this wallet's own address.");
        SolanaMintInfo info = inspectSolanaMint(token.mint);
        if (!info.extensionsSupported) throw new IllegalArgumentException(info.extensionWarning);
        if (info.decimals != token.decimals || !info.programId.equals(token.programId)) {
            throw new IllegalArgumentException("Imported token metadata no longer matches the on-chain mint. Re-import it before sending.");
        }
        BigInteger raw = SolanaToken.toRawAmount(amountText, info.decimals);

        TokenAccountInfo accounts = solanaRpc.getApi().getTokenAccountsByOwner(
            solana.getPublicKey(), Map.of("mint", info.mint), Map.of("encoding", "jsonParsed"));
        BigInteger available = BigInteger.ZERO;
        if (accounts != null && accounts.getValue() != null) for (TokenAccountInfo.Value account : accounts.getValue()) {
            TokenResultObjects.Value rawAccount = account.getAccount();
            TokenResultObjects.Data data = rawAccount == null ? null : rawAccount.getData();
            TokenResultObjects.ParsedData parsed = data == null ? null : data.getParsed();
            TokenResultObjects.TokenInfo parsedInfo = parsed == null ? null : parsed.getInfo();
            if (parsedInfo != null && parsedInfo.getTokenAmount() != null && parsedInfo.getTokenAmount().getAmount() != null)
                available = available.add(new BigInteger(parsedInfo.getTokenAmount().getAmount()));
        }
        if (available.compareTo(raw) < 0) throw new IllegalArgumentException("Insufficient " + token.symbol + " balance.");

        PublicKey mint = new PublicKey(info.mint);
        PublicKey tokenProgram = new PublicKey(info.programId);
        PublicKey destinationAta = associatedTokenAddress(destination, mint, tokenProgram);
        org.p2p.solanaj.rpc.types.AccountInfo existing = solanaRpc.getApi().getAccountInfo(destinationAta);
        long rent = 0L;
        if (existing == null || existing.getValue() == null) {
            long size = TokenProgram.PROGRAM_ID.toBase58().equals(info.programId) ? 165L : 170L;
            rent = solanaRpc.getApi().getMinimumBalanceForRentExemption(size);
        }
        long feeBuffer = 100_000L;
        long required = Math.addExact(feeBuffer, rent);
        long solBalance = solanaRpc.getApi().getBalance(solana.getPublicKey());
        if (solBalance < required) throw new IllegalArgumentException("Insufficient SOL to cover the estimated transaction fee"
            + (rent > 0 ? " and recipient token-account rent" : "") + ".");
        BigDecimal fee = BigDecimal.valueOf(feeBuffer).movePointLeft(9);
        String result = "Estimated network-fee buffer: about " + fee.stripTrailingZeros().toPlainString() + " SOL.";
        if (rent > 0) result += "\nRecipient associated token account is missing; refundable rent deposit estimate: "
            + BigDecimal.valueOf(rent).movePointLeft(9).stripTrailingZeros().toPlainString() + " SOL.";
        return result;
    }

    /** Local-sign and broadcast a checked SPL transfer; unsupported Token-2022 extensions fail closed. */
    String sendSolanaToken(String mintText, String destinationText, String amountText, int expectedDecimals,
                           String expectedProgramId) throws Exception {
        PublicKey destination = new PublicKey(destinationText.trim());
        if (destination.equals(solana.getPublicKey())) throw new IllegalArgumentException("Recipient is this wallet's own address.");
        SolanaMintInfo mintInfo = inspectSolanaMint(mintText);
        if (!mintInfo.extensionsSupported) throw new IllegalArgumentException(mintInfo.extensionWarning);
        if (mintInfo.decimals != expectedDecimals || !mintInfo.programId.equals(expectedProgramId)) {
            throw new IllegalArgumentException("Imported token metadata no longer matches the on-chain mint. Re-import it before sending.");
        }
        BigInteger raw = SolanaToken.toRawAmount(amountText, mintInfo.decimals);

        PublicKey mint = new PublicKey(mintInfo.mint);
        PublicKey tokenProgram = new PublicKey(mintInfo.programId);
        TokenAccountInfo sourceAccounts = solanaRpc.getApi().getTokenAccountsByOwner(
            solana.getPublicKey(), Map.of("mint", mint.toBase58()), Map.of("encoding", "jsonParsed"));
        if (sourceAccounts == null || sourceAccounts.getValue() == null || sourceAccounts.getValue().isEmpty()) {
            throw new IllegalArgumentException("No source token account exists for this mint.");
        }
        PublicKey source = new PublicKey(sourceAccounts.getValue().get(0).getPubkey());
        TokenResultObjects.TokenInfo sourceInfo = parsedTokenAccount(source);
        if (sourceInfo == null || !mint.toBase58().equals(sourceInfo.getMint())
                || !solanaAddress().equals(sourceInfo.getOwner()) || sourceInfo.getTokenAmount() == null) {
            throw new IllegalStateException("Source token account owner or mint did not match the wallet.");
        }
        BigInteger sourceBalance = new BigInteger(sourceInfo.getTokenAmount().getAmount());
        if (sourceBalance.compareTo(raw) < 0) throw new IllegalArgumentException("Insufficient " + mintInfo.onChainSymbol + " balance.");

        PublicKey destinationAta = associatedTokenAddress(destination, mint, tokenProgram);
        org.p2p.solanaj.rpc.types.AccountInfo destinationInfo = solanaRpc.getApi().getAccountInfo(destinationAta);
        org.p2p.solanaj.core.Transaction tx = new org.p2p.solanaj.core.Transaction();
        if (destinationInfo == null || destinationInfo.getValue() == null) {
            tx.addInstruction(createAssociatedTokenIdempotent(solana.getPublicKey(), destination, mint, tokenProgram));
        } else {
            TokenResultObjects.TokenInfo parsedDestination = parsedTokenAccount(destinationAta);
            if (parsedDestination == null || !mint.toBase58().equals(parsedDestination.getMint())
                    || !destination.toBase58().equals(parsedDestination.getOwner())) {
                throw new IllegalStateException("Recipient associated token account does not match the expected mint and owner.");
            }
        }

        if (TokenProgram.PROGRAM_ID.toBase58().equals(mintInfo.programId)) {
            tx.addInstruction(TokenProgram.transferChecked(source, destinationAta, raw.longValueExact(),
                (byte) mintInfo.decimals, solana.getPublicKey(), mint));
        } else {
            byte[] data = java.nio.ByteBuffer.allocate(10).order(ByteOrder.LITTLE_ENDIAN)
                .put((byte) 12).putLong(raw.longValueExact()).put((byte) mintInfo.decimals).array();
            List<AccountMeta> keys = List.of(
                new AccountMeta(source, false, true),
                new AccountMeta(mint, false, false),
                new AccountMeta(destinationAta, false, true),
                new AccountMeta(solana.getPublicKey(), true, false));
            tx.addInstruction(new TransactionInstruction(tokenProgram, keys, data));
        }
        return solanaRpc.getApi().sendTransaction(tx, solana);
    }

    private TokenResultObjects.TokenInfo parsedTokenAccount(PublicKey account) throws Exception {
        SplTokenAccountInfo response = solanaRpc.getApi().getSplTokenAccountInfo(account);
        if (response == null || response.getValue() == null || response.getValue().getData() == null
                || response.getValue().getData().getParsed() == null) return null;
        return response.getValue().getData().getParsed().getInfo();
    }

    private static PublicKey associatedTokenAddress(PublicKey owner, PublicKey mint, PublicKey tokenProgram) {
        return PublicKey.findProgramAddress(List.of(owner.toByteArray(), tokenProgram.toByteArray(), mint.toByteArray()),
            AssociatedTokenProgram.PROGRAM_ID).getAddress();
    }

    private static TransactionInstruction createAssociatedTokenIdempotent(PublicKey payer, PublicKey owner,
                                                                           PublicKey mint, PublicKey tokenProgram) {
        PublicKey ata = associatedTokenAddress(owner, mint, tokenProgram);
        List<AccountMeta> keys = List.of(
            new AccountMeta(payer, true, true),
            new AccountMeta(ata, false, true),
            new AccountMeta(owner, false, false),
            new AccountMeta(mint, false, false),
            new AccountMeta(SystemProgram.PROGRAM_ID, false, false),
            new AccountMeta(tokenProgram, false, false));
        return new TransactionInstruction(AssociatedTokenProgram.PROGRAM_ID, keys, new byte[] {1});
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
