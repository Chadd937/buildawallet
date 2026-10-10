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
import org.p2p.solanaj.utils.Base58;
import org.p2p.solanaj.utils.TweetNaclFast;
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



    private static final String SOLANA_MAINNET_RPC = "https://api.mainnet-beta.solana.com";

    /** Parse and summarize a dapp-provided legacy or v0 transaction before any signing prompt. */
    String previewSolanaDappTransaction(String encodedTransaction) throws Exception {
        byte[] wire = decodeSolanaWireTransaction(encodedTransaction);
        SolanaWireView view = inspectSolanaWireTransaction(wire);
        StringBuilder preview = new StringBuilder();
        preview.append("Network: Solana mainnet-beta")
            .append("\nFee payer: ").append(view.accountKeys.isEmpty() ? "unavailable" : view.accountKeys.get(0))
            .append("\nWallet signer: ").append(solanaAddress())
            .append("\nRequired signatures: ").append(view.requiredSignatures)
            .append("\nInstructions: ").append(view.instructions.size())
            .append("\nRecent blockhash: ").append(view.blockhash)
            .append("\n\nInstruction review:");
        int index = 0;
        for (SolanaWireInstruction instruction : view.instructions) {
            preview.append("\n\n").append(++index).append(". ").append(instruction.label)
                .append("\nProgram: ").append(instruction.program)
                .append("\nAccounts: ").append(instruction.accounts.size());
            if (!instruction.detail.isEmpty()) preview.append("\n").append(instruction.detail);
            if (instruction.unknown) preview.append("\nHIGH RISK: this program's effects are not decoded by this wallet.");
        }
        if (view.lookupTables) preview.append("\n\nAddress lookup tables are present. Some resolved accounts are not visible in the static account list.");
        JSONObject simulation = (JSONObject) solanaRpcCall("simulateTransaction",
            new JSONArray().put(encodedTransaction).put(new JSONObject()
                .put("encoding", "base64").put("commitment", "confirmed")
                .put("sigVerify", false).put("replaceRecentBlockhash", true)));
        JSONObject result = simulation.optJSONObject("value");
        if (result == null) throw new IllegalStateException("Solana mainnet did not return a transaction simulation result.");
        Object simError = result.opt("err");
        JSONArray logs = result.optJSONArray("logs");
        if (simError != null && simError != JSONObject.NULL) {
            StringBuilder failure = new StringBuilder("Solana mainnet simulation failed: ").append(simError);
            if (logs != null) {
                int start = Math.max(0, logs.length() - 8);
                for (int i = start; i < logs.length(); i++) failure.append("\n").append(logs.optString(i));
            }
            throw new IllegalStateException(failure.toString());
        }
        preview.append("\n\nMainnet simulation: passed (not a guarantee of execution).");
        if (logs != null && logs.length() > 0) {
            preview.append("\nSimulation logs:");
            int start = Math.max(0, logs.length() - 6);
            for (int i = start; i < logs.length(); i++) preview.append("\n").append(logs.optString(i));
        }
        preview.append("\n\nReview every instruction and program. Unknown programs can move assets or grant permissions.");
        return preview.toString();
    }

    /** Signs only the wallet's required signer slot; all other signatures are preserved. */
    String signSolanaDappTransaction(String encodedTransaction) throws Exception {
        byte[] wire = decodeSolanaWireTransaction(encodedTransaction);
        SolanaWireView view = inspectSolanaWireTransaction(wire);
        if (view.requiredSignatures != view.signatureCount) {
            throw new IllegalArgumentException("Transaction signature slots do not match its required signer count.");
        }
        int signerIndex = -1;
        for (int i = 0; i < view.requiredSignatures; i++) {
            if (solanaAddress().equals(view.accountKeys.get(i))) { signerIndex = i; break; }
        }
        if (signerIndex < 0) throw new IllegalArgumentException("This transaction does not require the connected BuildAWallet Solana account to sign.");
        byte[] message = Arrays.copyOfRange(wire, view.messageStart, wire.length);
        byte[] signature = new TweetNaclFast.Signature(new byte[0], solana.getSecretKey()).detached(message);
        if (signature == null || signature.length != 64) throw new IllegalStateException("Solana transaction signing failed.");
        System.arraycopy(signature, 0, wire, view.signatureSlotsStart + signerIndex * 64, 64);
        return android.util.Base64.encodeToString(wire, android.util.Base64.NO_WRAP);
    }

    /** Signs and submits a dapp transaction only after the caller has displayed the review prompt. */
    String sendSolanaDappTransaction(String encodedTransaction) throws Exception {
        String signed = signSolanaDappTransaction(encodedTransaction);
        Object result = solanaRpcCall("sendTransaction",
            new JSONArray().put(signed).put(new JSONObject()
                .put("encoding", "base64").put("preflightCommitment", "confirmed")
                .put("skipPreflight", false).put("maxRetries", 3)));
        String signature = result instanceof String ? (String) result : "";
        if (signature.isEmpty()) throw new IllegalStateException("Solana mainnet RPC did not return a transaction signature.");
        return signature;
    }

    String signSolanaDappMessage(String encodedMessage) throws Exception {
        byte[] message;
        try { message = android.util.Base64.decode(encodedMessage, android.util.Base64.DEFAULT); }
        catch (IllegalArgumentException e) { throw new IllegalArgumentException("Invalid base64 message.", e); }
        if (message.length == 0 || message.length > 16384) throw new IllegalArgumentException("Message must contain 1 to 16,384 bytes.");
        byte[] signature = new TweetNaclFast.Signature(new byte[0], solana.getSecretKey()).detached(message);
        if (signature == null || signature.length != 64) throw new IllegalStateException("Solana message signing failed.");
        return android.util.Base64.encodeToString(signature, android.util.Base64.NO_WRAP);
    }

    private Object solanaRpcCall(String method, JSONArray params) throws Exception {
        JSONObject request = new JSONObject().put("jsonrpc", "2.0").put("id", 1).put("method", method).put("params", params);
        HttpURLConnection connection = (HttpURLConnection) new URL(SOLANA_MAINNET_RPC).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(30000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json");
        try (OutputStream output = connection.getOutputStream()) {
            output.write(request.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        int code = connection.getResponseCode();
        BufferedReader reader = new BufferedReader(new InputStreamReader(
            code >= 400 ? connection.getErrorStream() : connection.getInputStream()));
        String body = reader.lines().collect(Collectors.joining("\n"));
        reader.close();
        connection.disconnect();
        if (code < 200 || code >= 300) throw new IllegalStateException("Solana mainnet RPC returned HTTP " + code + ".");
        JSONObject response = new JSONObject(body);
        JSONObject error = response.optJSONObject("error");
        if (error != null) throw new IllegalStateException("Solana mainnet RPC " + method + " failed: " + error.optString("message", error.toString()));
        Object result = response.opt("result");
        if (result == null || result == JSONObject.NULL) throw new IllegalStateException("Solana mainnet RPC returned an invalid " + method + " response.");
        return result;
    }

    private static byte[] decodeSolanaWireTransaction(String encoded) {
        if (encoded == null || encoded.length() > 200000) throw new IllegalArgumentException("Missing or oversized Solana transaction.");
        try {
            byte[] wire = android.util.Base64.decode(encoded, android.util.Base64.DEFAULT);
            if (wire.length < 1 + 64 + 3 + 32 || wire.length > 1232) {
                throw new IllegalArgumentException("Solana transaction size is outside the supported packet range.");
            }
            return wire;
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid serialized Solana transaction.", e);
        }
    }

    private static final class SolanaWireInstruction {
        final String program, label, detail;
        final List<Integer> accounts;
        final boolean unknown;
        SolanaWireInstruction(String program, String label, String detail, List<Integer> accounts, boolean unknown) {
            this.program = program; this.label = label; this.detail = detail; this.accounts = accounts; this.unknown = unknown;
        }
    }

    private static final class SolanaWireView {
        int signatureCount, signatureSlotsStart, messageStart, requiredSignatures;
        String blockhash;
        boolean lookupTables;
        final List<String> accountKeys = new ArrayList<>();
        final List<SolanaWireInstruction> instructions = new ArrayList<>();
    }

    private static int readShortVec(byte[] bytes, int[] offset) {
        int value = 0, shift = 0;
        for (int i = 0; i < 3; i++) {
            if (offset[0] >= bytes.length) throw new IllegalArgumentException("Truncated Solana transaction.");
            int b = bytes[offset[0]++] & 0xff;
            value |= (b & 0x7f) << shift;
            if ((b & 0x80) == 0) return value;
            shift += 7;
        }
        throw new IllegalArgumentException("Invalid Solana compact length.");
    }

    private static SolanaWireView inspectSolanaWireTransaction(byte[] wire) {
        SolanaWireView view = new SolanaWireView();
        int[] cursor = {0};
        view.signatureCount = readShortVec(wire, cursor);
        view.signatureSlotsStart = cursor[0];
        if (view.signatureCount < 1 || view.signatureCount > 32 || cursor[0] + view.signatureCount * 64 >= wire.length) {
            throw new IllegalArgumentException("Invalid Solana transaction signature section.");
        }
        view.messageStart = cursor[0] + view.signatureCount * 64;
        cursor[0] = view.messageStart;
        int first = wire[cursor[0]] & 0xff;
        boolean versioned = (first & 0x80) != 0;
        if (versioned) {
            int version = first & 0x7f;
            if (version != 0) throw new IllegalArgumentException("Unsupported Solana transaction message version: " + version);
            cursor[0]++;
        }
        if (cursor[0] + 3 > wire.length) throw new IllegalArgumentException("Truncated Solana message header.");
        view.requiredSignatures = wire[cursor[0]] & 0xff;
        cursor[0] += 3;
        if (view.requiredSignatures < 1 || view.requiredSignatures > view.signatureCount) {
            throw new IllegalArgumentException("Invalid Solana required signer count.");
        }
        int keyCount = readShortVec(wire, cursor);
        if (keyCount < view.requiredSignatures || keyCount > 64 || cursor[0] + keyCount * 32 + 32 > wire.length) {
            throw new IllegalArgumentException("Invalid Solana account key list.");
        }
        for (int i = 0; i < keyCount; i++) {
            view.accountKeys.add(Base58.encode(Arrays.copyOfRange(wire, cursor[0], cursor[0] + 32)));
            cursor[0] += 32;
        }
        view.blockhash = Base58.encode(Arrays.copyOfRange(wire, cursor[0], cursor[0] + 32));
        cursor[0] += 32;
        int instructionCount = readShortVec(wire, cursor);
        if (instructionCount > 64) throw new IllegalArgumentException("Too many Solana instructions.");
        for (int i = 0; i < instructionCount; i++) {
            if (cursor[0] >= wire.length) throw new IllegalArgumentException("Truncated Solana instruction.");
            int programIndex = wire[cursor[0]++] & 0xff;
            int accountCount = readShortVec(wire, cursor);
            if (accountCount > 128 || cursor[0] + accountCount > wire.length) throw new IllegalArgumentException("Invalid Solana instruction account list.");
            List<Integer> accounts = new ArrayList<>();
            for (int j = 0; j < accountCount; j++) accounts.add(wire[cursor[0]++] & 0xff);
            int dataLength = readShortVec(wire, cursor);
            if (dataLength > 1024 || cursor[0] + dataLength > wire.length) throw new IllegalArgumentException("Invalid Solana instruction data.");
            byte[] data = Arrays.copyOfRange(wire, cursor[0], cursor[0] + dataLength);
            cursor[0] += dataLength;
            String program = programIndex < view.accountKeys.size() ? view.accountKeys.get(programIndex) : "address-lookup-index-" + programIndex;
            String label = "Unrecognized program instruction";
            String detail = "Instruction data bytes: " + data.length + "; prefix: " + bytesToHex(Arrays.copyOf(data, Math.min(12, data.length)));
            boolean unknown = true;
            if ("11111111111111111111111111111111".equals(program) && data.length >= 12 && littleU32(data, 0) == 2) {
                BigInteger lamports = littleU64Big(data, 4);
                label = "System Program · SOL transfer";
                detail = "Amount: " + new BigDecimal(lamports).movePointLeft(9).stripTrailingZeros().toPlainString() + " SOL";
                if (accounts.size() >= 2) detail += "\nFrom: " + accountKey(view, accounts.get(0)) + "\nTo: " + accountKey(view, accounts.get(1));
                unknown = false;
            } else if ((TokenProgram.PROGRAM_ID.toBase58().equals(program) || TOKEN_2022_PROGRAM_ID.equals(program))
                    && data.length >= 9 && ((data[0] & 0xff) == 3 || ((data[0] & 0xff) == 12 && data.length >= 10))) {
                boolean checked = (data[0] & 0xff) == 12;
                BigInteger raw = littleU64Big(data, 1);
                label = checked ? "SPL Token · checked transfer" : "SPL Token · transfer (raw units)";
                detail = checked
                    ? "Amount: " + new BigDecimal(raw).movePointLeft(data[9] & 0xff).stripTrailingZeros().toPlainString()
                        + " (raw units: " + raw + "; decimals: " + (data[9] & 0xff) + ")"
                    : "Raw token amount: " + raw;
                if (accounts.size() >= 3) detail += "\nSource: " + accountKey(view, accounts.get(0))
                    + "\nDestination: " + accountKey(view, accounts.get(checked ? 2 : 1));
                unknown = false;
            } else if ((TokenProgram.PROGRAM_ID.toBase58().equals(program) || TOKEN_2022_PROGRAM_ID.equals(program))
                    && data.length >= 19 && (data[0] & 0xff) == 26 && (data[1] & 0xff) == 1) {
                BigInteger raw = littleU64Big(data, 2);
                int decimals = data[10] & 0xff;
                BigInteger fee = littleU64Big(data, 11);
                label = "Token-2022 · transfer with fee";
                detail = "Amount: " + new BigDecimal(raw).movePointLeft(decimals).stripTrailingZeros().toPlainString()
                    + "\nExpected fee: " + new BigDecimal(fee).movePointLeft(decimals).stripTrailingZeros().toPlainString()
                    + "\nRaw amount: " + raw + "; raw fee: " + fee + "; decimals: " + decimals;
                if (accounts.size() >= 3) detail += "\nSource: " + accountKey(view, accounts.get(0))
                    + "\nMint: " + accountKey(view, accounts.get(1))
                    + "\nDestination: " + accountKey(view, accounts.get(2));
                unknown = false;
            } else if ((TokenProgram.PROGRAM_ID.toBase58().equals(program) || TOKEN_2022_PROGRAM_ID.equals(program))
                    && data.length >= 9 && ((data[0] & 0xff) == 4 || (data[0] & 0xff) == 7 || (data[0] & 0xff) == 8
                        || ((data[0] & 0xff) >= 13 && (data[0] & 0xff) <= 15 && data.length >= 10))) {
                int opcode = data[0] & 0xff;
                boolean checked = opcode >= 13 && opcode <= 15;
                BigInteger raw = littleU64Big(data, 1);
                label = (opcode == 4 || opcode == 13) ? "SPL Token · APPROVAL (HIGH RISK)"
                    : (opcode == 7 || opcode == 14) ? "SPL Token · MINT TOKENS (HIGH RISK)" : "SPL Token · BURN TOKENS (HIGH RISK)";
                detail = "Raw amount: " + raw + (checked ? "\nDecimals: " + (data[9] & 0xff) : "");
                if (accounts.size() >= 2) detail += "\nAccount: " + accountKey(view, accounts.get(0))
                    + "\nOther account: " + accountKey(view, accounts.get(1));
                unknown = false;
            } else if ((TokenProgram.PROGRAM_ID.toBase58().equals(program) || TOKEN_2022_PROGRAM_ID.equals(program))
                    && data.length > 0 && ((data[0] & 0xff) == 5 || (data[0] & 0xff) == 6
                        || (data[0] & 0xff) == 9 || (data[0] & 0xff) == 10 || (data[0] & 0xff) == 11)) {
                int opcode = data[0] & 0xff;
                label = opcode == 5 ? "SPL Token · REVOKE APPROVAL (HIGH RISK)"
                    : opcode == 6 ? "SPL Token · CHANGE AUTHORITY (HIGH RISK)"
                    : opcode == 9 ? "SPL Token · CLOSE ACCOUNT (HIGH RISK)"
                    : opcode == 10 ? "SPL Token · FREEZE ACCOUNT (HIGH RISK)"
                    : "SPL Token · THAW ACCOUNT (HIGH RISK)";
                detail = "Instruction data: " + bytesToHex(Arrays.copyOf(data, Math.min(32, data.length)));
                if (!accounts.isEmpty()) detail += "\nAccount: " + accountKey(view, accounts.get(0));
                unknown = false;
            } else if ((TokenProgram.PROGRAM_ID.toBase58().equals(program) || TOKEN_2022_PROGRAM_ID.equals(program))
                    && data.length > 0 && (data[0] & 0xff) == 17) {
                label = "SPL Token · sync wrapped SOL balance";
                unknown = false;
            } else if ("ComputeBudget111111111111111111111111111111".equals(program)) {
                label = "Compute Budget";
                unknown = false;
            } else if ("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr".equals(program)) {
                label = "Solana Memo";
                detail = new String(data, java.nio.charset.StandardCharsets.UTF_8);
                unknown = false;
            } else if (AssociatedTokenProgram.PROGRAM_ID.toBase58().equals(program)) {
                label = "Associated Token Account operation";
                unknown = false;
            }
            view.instructions.add(new SolanaWireInstruction(program, label, detail, accounts, unknown));
        }
        if (versioned) {
            int lookupCount = readShortVec(wire, cursor);
            view.lookupTables = lookupCount > 0;
            for (int i = 0; i < lookupCount; i++) {
                if (cursor[0] + 32 > wire.length) throw new IllegalArgumentException("Truncated Solana address lookup table.");
                cursor[0] += 32;
                int writableCount = readShortVec(wire, cursor);
                if (cursor[0] + writableCount > wire.length) throw new IllegalArgumentException("Truncated writable lookup indices.");
                cursor[0] += writableCount;
                int readonlyCount = readShortVec(wire, cursor);
                if (cursor[0] + readonlyCount > wire.length) throw new IllegalArgumentException("Truncated readonly lookup indices.");
                cursor[0] += readonlyCount;
            }
        }
        if (cursor[0] != wire.length) throw new IllegalArgumentException("Unexpected trailing data in serialized Solana transaction.");
        return view;
    }

    private static String accountKey(SolanaWireView view, int index) {
        return index >= 0 && index < view.accountKeys.size() ? view.accountKeys.get(index) : "lookup-table account " + index;
    }

    private static BigInteger littleU64Big(byte[] bytes, int offset) {
        byte[] bigEndian = new byte[8];
        for (int i = 0; i < 8; i++) bigEndian[7 - i] = bytes[offset + i];
        return new BigInteger(1, bigEndian);
    }

    private static long littleU32(byte[] bytes, int offset) {
        return (bytes[offset] & 0xffL) | ((bytes[offset + 1] & 0xffL) << 8)
            | ((bytes[offset + 2] & 0xffL) << 16) | ((bytes[offset + 3] & 0xffL) << 24);
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
        if (decimals < 0 || decimals > 255) throw new IllegalArgumentException("Mint decimals are outside the SPL token program range (0–255).");
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
        boolean hasSufficientSourceAccount = false;
        if (accounts != null && accounts.getValue() != null) for (TokenAccountInfo.Value account : accounts.getValue()) {
            if (account == null || account.getPubkey() == null) continue;
            TokenResultObjects.TokenInfo parsedInfo = parsedTokenAccount(new PublicKey(account.getPubkey()));
            if (parsedInfo == null || !info.mint.equals(parsedInfo.getMint())
                    || !solanaAddress().equals(parsedInfo.getOwner()) || parsedInfo.getTokenAmount() == null) continue;
            if (new BigInteger(parsedInfo.getTokenAmount().getAmount()).compareTo(raw) >= 0) {
                hasSufficientSourceAccount = true;
                break;
            }
        }
        if (!hasSufficientSourceAccount) throw new IllegalArgumentException("No single source token account has enough " + token.symbol + " to cover this transfer.");

        PublicKey mint = new PublicKey(info.mint);
        PublicKey tokenProgram = new PublicKey(info.programId);
        PublicKey destinationAta = associatedTokenAddress(destination, mint, tokenProgram);
        org.p2p.solanaj.rpc.types.AccountInfo existing = solanaRpc.getApi().getAccountInfo(destinationAta);
        long rent = 0L;
        if (existing == null || existing.getValue() == null) {
            long size = TokenProgram.PROGRAM_ID.toBase58().equals(info.programId) ? 165L : 170L;
            rent = solanaRpc.getApi().getMinimumBalanceForRentExemption(size);
        } else {
            TokenResultObjects.TokenInfo recipientInfo = parsedTokenAccount(destinationAta);
            if (recipientInfo == null || !info.mint.equals(recipientInfo.getMint())
                    || !destination.toBase58().equals(recipientInfo.getOwner())) {
                throw new IllegalStateException("Recipient associated token account does not match the expected mint and owner.");
            }
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
        PublicKey source = null;
        for (TokenAccountInfo.Value candidate : sourceAccounts.getValue()) {
            if (candidate == null || candidate.getPubkey() == null) continue;
            PublicKey candidateKey = new PublicKey(candidate.getPubkey());
            TokenResultObjects.TokenInfo candidateInfo = parsedTokenAccount(candidateKey);
            if (candidateInfo == null || !mint.toBase58().equals(candidateInfo.getMint())
                    || !solanaAddress().equals(candidateInfo.getOwner()) || candidateInfo.getTokenAmount() == null) {
                continue;
            }
            BigInteger candidateBalance = new BigInteger(candidateInfo.getTokenAmount().getAmount());
            if (candidateBalance.compareTo(raw) >= 0) { source = candidateKey; break; }
        }
        if (source == null) throw new IllegalArgumentException("No single source token account has enough " + mintInfo.onChainSymbol + " to cover this transfer.");

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

        byte[] data = java.nio.ByteBuffer.allocate(10).order(ByteOrder.LITTLE_ENDIAN)
            .put((byte) 12).putLong(raw.longValue()).put((byte) mintInfo.decimals).array();
        List<AccountMeta> keys = List.of(
            new AccountMeta(source, false, true),
            new AccountMeta(mint, false, false),
            new AccountMeta(destinationAta, false, true),
            new AccountMeta(solana.getPublicKey(), true, false));
        tx.addInstruction(new TransactionInstruction(tokenProgram, keys, data));
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
        String body = reader.lines().collect(Collectors.joining("\n"));
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
        String response = reader.lines().collect(Collectors.joining("\n"));
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
