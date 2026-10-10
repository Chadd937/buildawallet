package xyz.buildawallet.studio;

import org.web3j.crypto.Bip32ECKeyPair;
import org.web3j.crypto.Credentials;
import org.web3j.crypto.MnemonicUtils;
import org.web3j.crypto.RawTransaction;
import org.web3j.crypto.TransactionEncoder;
import org.web3j.crypto.WalletUtils;
import org.web3j.protocol.Web3j;
import org.web3j.abi.FunctionEncoder;
import org.web3j.abi.datatypes.Function;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.Type;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.protocol.core.DefaultBlockParameterName;
import org.web3j.protocol.core.methods.response.EthSendTransaction;
import org.web3j.protocol.http.HttpService;
import org.web3j.utils.Convert;
import org.web3j.utils.Numeric;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;

final class WalletEngine {
    private static final int HARDENED = Bip32ECKeyPair.HARDENED_BIT;
    private static final int[] EVM_PATH = {
        44 | HARDENED,
        60 | HARDENED,
        0 | HARDENED,
        0,
        0
    };
    private static final BigInteger NATIVE_TRANSFER_GAS = BigInteger.valueOf(21_000L);
    private static final BigInteger ERC20_TRANSFER_GAS = BigInteger.valueOf(65_000L);
    private static final java.util.Map<Long,String> USDC = java.util.Map.of(
        1L, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        8453L, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        42161L, "0xaf88d065e77c8C2239327C5EDb3A432268e5831",
        10L, "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
        137L, "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        56L, "0x8AC76a51cc950982D68b83f1D09cd849c35F18",
        43114L, "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"
    );

    private final Credentials credentials;

    private WalletEngine(Credentials credentials) {
        this.credentials = credentials;
    }

    static WalletEngine fromMnemonic(String mnemonic) {
        byte[] seed = MnemonicUtils.generateSeed(mnemonic, "");
        Bip32ECKeyPair master = Bip32ECKeyPair.generateKeyPair(seed);
        Bip32ECKeyPair account = Bip32ECKeyPair.deriveKeyPair(master, EVM_PATH);
        return new WalletEngine(Credentials.create(account));
    }

    String address() { return credentials.getAddress(); }

    String balance(EvmNetwork network) throws Exception {
        Web3j web3j = client(network);
        try {
            verifyNetwork(web3j, network);
            var response = web3j.ethGetBalance(address(), DefaultBlockParameterName.LATEST).send();
            if (response.hasError()) throw rpcError(response.getError().getMessage());
            BigInteger wei = response.getBalance();
            return formatNative(wei) + " " + network.symbol;
        } finally {
            web3j.shutdown();
        }
    }

    PreparedTransfer prepare(EvmNetwork network, String to, String amountText) throws Exception {
        if (!WalletUtils.isValidAddress(to)) {
            throw new IllegalArgumentException("Enter a valid EVM destination address.");
        }

        BigDecimal amount;
        try {
            amount = new BigDecimal(amountText.trim());
        } catch (Exception error) {
            throw new IllegalArgumentException("Enter a valid amount.");
        }
        if (amount.signum() <= 0) throw new IllegalArgumentException("Amount must be greater than zero.");

        BigInteger valueWei;
        try {
            valueWei = Convert.toWei(amount, Convert.Unit.ETHER).toBigIntegerExact();
        } catch (ArithmeticException error) {
            throw new IllegalArgumentException("Amount has too many decimal places.");
        }

        Web3j web3j = client(network);
        try {
            verifyNetwork(web3j, network);
            var nonceResponse = web3j.ethGetTransactionCount(
                address(), DefaultBlockParameterName.PENDING).send();
            if (nonceResponse.hasError()) throw rpcError(nonceResponse.getError().getMessage());
            BigInteger nonce = nonceResponse.getTransactionCount();

            var gasResponse = web3j.ethGasPrice().send();
            if (gasResponse.hasError()) throw rpcError(gasResponse.getError().getMessage());
            BigInteger gasPrice = gasResponse.getGasPrice();

            var balanceResponse = web3j.ethGetBalance(
                address(), DefaultBlockParameterName.LATEST).send();
            if (balanceResponse.hasError()) throw rpcError(balanceResponse.getError().getMessage());
            BigInteger balance = balanceResponse.getBalance();
            BigInteger feeWei = gasPrice.multiply(NATIVE_TRANSFER_GAS);
            if (valueWei.add(feeWei).compareTo(balance) > 0) {
                throw new IllegalArgumentException("Insufficient balance for amount plus network fee.");
            }
            return new PreparedTransfer(network, to, valueWei, nonce, gasPrice, NATIVE_TRANSFER_GAS);
        } finally {
            web3j.shutdown();
        }
    }

    /** Read-only ERC-20 balance for a user-imported contract. */
    String tokenBalance(EvmNetwork network, String tokenAddress, int decimals) throws Exception {
        if (!WalletUtils.isValidAddress(tokenAddress)) throw new IllegalArgumentException("Invalid token contract address.");
        if (decimals < 0 || decimals > 36) throw new IllegalArgumentException("Token decimals must be between 0 and 36.");
        Web3j web3j = client(network);
        try {
            verifyNetwork(web3j, network);
            Function fn = new Function("balanceOf",
                java.util.List.of(new Address(address())),
                java.util.List.of(new org.web3j.abi.TypeReference<Uint256>() {}));
            var response = web3j.ethCall(
                org.web3j.protocol.core.methods.request.Transaction.createEthCallTransaction(address(), tokenAddress, FunctionEncoder.encode(fn)),
                DefaultBlockParameterName.LATEST).send();
            if (response.hasError()) throw rpcError(response.getError().getMessage());
            BigInteger raw = Numeric.toBigInt(response.getValue());
            return formatToken(raw, decimals);
        } finally { web3j.shutdown(); }
    }

    String usdcBalance(EvmNetwork network) throws Exception {
        String token = usdcAddress(network);
        Web3j web3j = client(network);
        try {
            verifyNetwork(web3j, network);
            Function fn = new Function("balanceOf",
                java.util.List.of(new Address(address())),
                java.util.List.of(new org.web3j.abi.TypeReference<Uint256>() {}));
            var response = web3j.ethCall(
                org.web3j.protocol.core.methods.request.Transaction.createEthCallTransaction(address(), token, FunctionEncoder.encode(fn)),
                DefaultBlockParameterName.LATEST).send();
            if (response.hasError()) throw rpcError(response.getError().getMessage());
            BigInteger raw = Numeric.toBigInt(response.getValue());
            return formatToken(raw, 6) + " USDC";
        } finally { web3j.shutdown(); }
    }

    PreparedTransfer prepareUsdc(EvmNetwork network, String to, String amountText) throws Exception {
        return prepareTokenTransfer(network, to, amountText, usdcAddress(network), 6, "USDC");
    }

    /** Prepare any ERC-20 transfer, including user-imported tokens. */
    PreparedTransfer prepareTokenTransfer(EvmNetwork network, String to, String amountText,
                                          String tokenAddress, int decimals, String symbol) throws Exception {
        if (!WalletUtils.isValidAddress(to)) throw new IllegalArgumentException("Enter a valid EVM destination address.");
        if (!WalletUtils.isValidAddress(tokenAddress)) throw new IllegalArgumentException("Invalid token contract address.");
        if (decimals < 0 || decimals > 36) throw new IllegalArgumentException("Token decimals must be between 0 and 36.");
        if (symbol == null || !symbol.matches("[A-Za-z0-9._-]{1,16}")) throw new IllegalArgumentException("Invalid token symbol.");

        BigDecimal amount;
        try { amount = new BigDecimal(amountText.trim()); }
        catch (Exception error) { throw new IllegalArgumentException("Enter a valid token amount."); }
        if (amount.signum() <= 0) throw new IllegalArgumentException("Amount must be greater than zero.");
        BigInteger raw;
        try { raw = amount.movePointRight(decimals).toBigIntegerExact(); }
        catch (ArithmeticException error) { throw new IllegalArgumentException("Amount has too many decimal places for this token."); }
        if (raw.signum() <= 0) throw new IllegalArgumentException("Amount is too small for this token.");

        Web3j web3j = client(network);
        try {
            verifyNetwork(web3j, network);
            Function balanceFn = new Function("balanceOf", java.util.List.of(new Address(address())),
                java.util.List.of(new org.web3j.abi.TypeReference<Uint256>() {}));
            var balanceResponse = web3j.ethCall(
                org.web3j.protocol.core.methods.request.Transaction.createEthCallTransaction(address(), tokenAddress, FunctionEncoder.encode(balanceFn)),
                DefaultBlockParameterName.LATEST).send();
            if (balanceResponse.hasError()) throw rpcError(balanceResponse.getError().getMessage());
            if (balanceResponse.getValue() == null || balanceResponse.getValue().length() < 3) {
                throw new IllegalStateException("Token contract did not return a valid balance. Confirm the contract and network.");
            }
            if (Numeric.toBigInt(balanceResponse.getValue()).compareTo(raw) < 0) {
                throw new IllegalArgumentException("Insufficient " + symbol + " balance.");
            }

            Function transfer = new Function("transfer",
                java.util.List.of(new Address(to), new Uint256(raw)), java.util.List.of());
            String data = FunctionEncoder.encode(transfer);
            var estimate = web3j.ethEstimateGas(
                org.web3j.protocol.core.methods.request.Transaction.createEthCallTransaction(address(), tokenAddress, data)).send();
            if (estimate.hasError() || estimate.getAmountUsed() == null || estimate.getAmountUsed().signum() <= 0) {
                throw rpcError(estimate.getError() == null ? "Could not estimate token transfer gas." : estimate.getError().getMessage());
            }
            BigInteger gasLimit = estimate.getAmountUsed().multiply(BigInteger.valueOf(120)).divide(BigInteger.valueOf(100));
            var nonceResponse = web3j.ethGetTransactionCount(address(), DefaultBlockParameterName.PENDING).send();
            if (nonceResponse.hasError()) throw rpcError(nonceResponse.getError().getMessage());
            var gasResponse = web3j.ethGasPrice().send();
            if (gasResponse.hasError() || gasResponse.getGasPrice() == null) throw rpcError(gasResponse.getError() == null ? "Could not fetch gas price." : gasResponse.getError().getMessage());
            BigInteger gasPrice = gasResponse.getGasPrice();
            BigInteger feeWei = gasPrice.multiply(gasLimit);
            var nativeBalance = web3j.ethGetBalance(address(), DefaultBlockParameterName.LATEST).send();
            if (nativeBalance.hasError()) throw rpcError(nativeBalance.getError().getMessage());
            if (nativeBalance.getBalance().compareTo(feeWei) < 0) {
                throw new IllegalArgumentException("Insufficient " + network.symbol + " to pay the token transfer network fee.");
            }
            return PreparedTransfer.token(network, tokenAddress, to, raw, nonceResponse.getTransactionCount(),
                gasPrice, gasLimit, data, symbol, decimals);
        } finally { web3j.shutdown(); }
    }

    static String configuredUsdcAddress(EvmNetwork network) { return usdcAddress(network); }

    private static String usdcAddress(EvmNetwork network) {
        String value = USDC.get(network.chainId);
        if (value == null) throw new IllegalArgumentException("USDC is not configured on " + network.name + ".");
        return value;
    }

    static String formatToken(BigInteger value, int decimals) {
        return new BigDecimal(value).divide(BigDecimal.TEN.pow(decimals), decimals, RoundingMode.DOWN).stripTrailingZeros().toPlainString();
    }



    String dappRead(EvmNetwork network, String method, org.json.JSONArray params) throws Exception {
        Web3j web3j = client(network);
        try {
            verifyNetwork(web3j, network);
            switch (method) {
                case "eth_chainId": return "0x" + Long.toHexString(network.chainId);
                case "net_version": return Long.toString(network.chainId);
                case "eth_accounts": return new org.json.JSONArray().put(address()).toString();
                case "eth_getBalance": return Numeric.toHexStringWithPrefix(web3j.ethGetBalance(params.getString(0), DefaultBlockParameterName.LATEST).send().getBalance());
                case "eth_blockNumber": return Numeric.toHexStringWithPrefix(web3j.ethBlockNumber().send().getBlockNumber());
                case "eth_gasPrice": return Numeric.toHexStringWithPrefix(web3j.ethGasPrice().send().getGasPrice());
                case "eth_getTransactionCount": return Numeric.toHexStringWithPrefix(web3j.ethGetTransactionCount(params.getString(0), DefaultBlockParameterName.PENDING).send().getTransactionCount());
                case "eth_call": {
                    org.json.JSONObject call = params.getJSONObject(0);
                    String from = call.optString("from", address());
                    String to = call.getString("to");
                    String data = call.optString("data", "0x");
                    var result = web3j.ethCall(org.web3j.protocol.core.methods.request.Transaction.createEthCallTransaction(from, to, data), DefaultBlockParameterName.LATEST).send();
                    if (result.hasError()) throw rpcError(result.getError().getMessage());
                    return result.getValue();
                }
                default: throw new UnsupportedOperationException("Unsupported dapp RPC method: " + method);
            }
        } finally { web3j.shutdown(); }
    }

    String signPersonalMessage(String message) {
        org.web3j.crypto.Sign.SignatureData sig = org.web3j.crypto.Sign.signPrefixedMessage(message.getBytes(java.nio.charset.StandardCharsets.UTF_8), credentials.getEcKeyPair());
        byte[] out = new byte[65];
        System.arraycopy(sig.getR(), 0, out, 0, 32); System.arraycopy(sig.getS(), 0, out, 32, 32); System.arraycopy(sig.getV(), 0, out, 64, 1);
        return Numeric.toHexString(out);
    }

    String decodeContractCall(EvmNetwork network, String contract, String data) throws Exception {
        if (data == null || data.isEmpty() || "0x".equalsIgnoreCase(data)) {
            return "Plain native-asset transfer; no contract calldata was supplied.";
        }
        if (!data.matches("(?i)^0x[0-9a-f]*$") || data.length() < 10) {
            return "Malformed or incomplete contract calldata. Do not sign unless you understand the request.";
        }
        String hex = data.substring(2).toLowerCase(java.util.Locale.ROOT);
        String selector = hex.substring(0, 8);
        String words = hex.substring(8);
        if ("a9059cbb".equals(selector) && words.length() >= 128) {
            String recipient = abiAddress(words, 0);
            BigInteger raw = abiUint(words, 64);
            TokenMetadata token = readTokenMetadata(network, contract);
            return "ERC-20 TRANSFER\nToken: " + token.symbol + " (" + contract + ")"
                + "\nRecipient: " + recipient + "\nAmount: " + (token.decimalsKnown ? formatToken(raw, token.decimals) + " " + token.symbol : raw + " raw units (decimals unavailable)")
                + "\n\nThis moves tokens immediately if the token contract behaves as expected. Verify the contract and recipient.";
        }
        if ("095ea7b3".equals(selector) && words.length() >= 128) {
            String spender = abiAddress(words, 0);
            BigInteger raw = abiUint(words, 64);
            TokenMetadata token = readTokenMetadata(network, contract);
            boolean unlimited = raw.equals(BigInteger.ONE.shiftLeft(256).subtract(BigInteger.ONE));
            return "ERC-20 APPROVAL\nToken: " + token.symbol + " (" + contract + ")"
                + "\nSpender: " + spender + "\nAllowance: " + (unlimited ? "UNLIMITED" : (token.decimalsKnown ? formatToken(raw, token.decimals) + " " + token.symbol : raw + " raw units"))
                + (unlimited ? "\n\nHIGH RISK: this grants the spender permission to transfer any amount of this token until the allowance is revoked." :
                    "\n\nThe spender can transfer up to this allowance from your wallet. Verify the spender address.");
        }
        if ("23b872dd".equals(selector) && words.length() >= 192) {
            String owner = abiAddress(words, 0);
            String recipient = abiAddress(words, 64);
            BigInteger raw = abiUint(words, 128);
            TokenMetadata token = readTokenMetadata(network, contract);
            return "ERC-20 TRANSFER FROM\nToken: " + token.symbol + " (" + contract + ")"
                + "\nFrom: " + owner + "\nRecipient: " + recipient
                + "\nAmount: " + (token.decimalsKnown ? formatToken(raw, token.decimals) + " " + token.symbol : raw + " raw units (decimals unavailable)")
                + "\n\nThis contract call attempts to move tokens from the displayed owner. Confirm the allowance and both addresses.";
        }
        if (("39509351".equals(selector) || "a457c2d7".equals(selector)) && words.length() >= 128) {
            String spender = abiAddress(words, 0);
            BigInteger raw = abiUint(words, 64);
            TokenMetadata token = readTokenMetadata(network, contract);
            return ("39509351".equals(selector) ? "INCREASE TOKEN ALLOWANCE" : "DECREASE TOKEN ALLOWANCE")
                + "\nToken: " + token.symbol + " (" + contract + ")\nSpender: " + spender
                + "\nChange: " + (token.decimalsKnown ? formatToken(raw, token.decimals) + " " + token.symbol : raw + " raw units (decimals unavailable)")
                + "\n\nAllowance changes can let another address move tokens from your wallet.";
        }
        if ("a22cb465".equals(selector) && words.length() >= 128) {
            String operator = abiAddress(words, 0);
            boolean approved = abiUint(words, 64).signum() != 0;
            return "NFT / OPERATOR APPROVAL\nCollection contract: " + contract + "\nOperator: " + operator
                + "\nApproved: " + approved + "\n\nIf enabled, this operator may transfer NFTs or other assets covered by the contract.";
        }
        if ("7ff36ab5".equals(selector) || "38ed1739".equals(selector) || "18cbafe5".equals(selector)
                || "4a25d94a".equals(selector)) {
            return decodeRouterSwap(selector, words, contract);
        }
        if ("d0e30db0".equals(selector)) return "WRAPPED-NATIVE DEPOSIT\nContract: " + contract + "\nThis deposits the transaction's native value into the contract.";
        if ("2e1a7d4d".equals(selector) && words.length() >= 64) {
            return "WRAPPED-NATIVE WITHDRAW\nContract: " + contract + "\nAmount (raw units): " + abiUint(words, 0);
        }
        if ("ac9650d8".equals(selector) || "5ae401dc".equals(selector)) {
            return "MULTICALL\nContract: " + contract + "\nThis request batches multiple contract operations. Nested calls are not fully decoded; review the full calldata and only proceed if you trust the target contract.";
        }
        return "UNKNOWN CONTRACT METHOD\nContract: " + contract + "\nFunction selector: 0x" + selector
            + "\nCalldata length: " + data.length() + " characters"
            + "\n\nThe wallet cannot safely determine all effects of this contract call. It may transfer assets, change permissions, or execute multiple operations. Do not sign unless you independently understand it.";
    }

    private String decodeRouterSwap(String selector, String words, String router) {
        try {
            BigInteger amountIn = BigInteger.ZERO;
            BigInteger amountOutMin;
            int pathOffsetWord;
            int recipientWord;
            if ("7ff36ab5".equals(selector)) {
                amountOutMin = abiUint(words, 0);
                pathOffsetWord = 64;
                recipientWord = 128;
            } else {
                amountIn = abiUint(words, 0);
                amountOutMin = abiUint(words, 64);
                pathOffsetWord = 128;
                recipientWord = 192;
            }
            String recipient = abiAddress(words, recipientWord);
            int pathOffsetBytes = abiUint(words, pathOffsetWord).intValueExact();
            int pathStart = pathOffsetBytes * 2;
            int count = new BigInteger(words.substring(pathStart, pathStart + 64), 16).intValueExact();
            if (count < 2 || count > 8) throw new IllegalArgumentException("Invalid swap path");
            StringBuilder path = new StringBuilder();
            for (int i = 0; i < count; i++) {
                if (i > 0) path.append(" → ");
                path.append("0x").append(words, pathStart + 64 + i * 64 + 24, pathStart + 64 + (i + 1) * 64);
            }
            String kind = "7ff36ab5".equals(selector) ? "NATIVE → TOKEN SWAP"
                : ("18cbafe5".equals(selector) || "4a25d94a".equals(selector) ? "TOKEN → NATIVE SWAP" : "TOKEN SWAP");
            return kind + "\nRouter: " + router
                + (amountIn.signum() > 0 ? "\nInput amount (raw units): " + amountIn : "")
                + "\nMinimum output (raw units): " + amountOutMin
                + "\nToken path: " + path + "\nRecipient: " + recipient
                + "\n\nSwap output is variable and can be affected by slippage, liquidity, and MEV. Token decimals are not inferred for this router summary; inspect the dapp quote and transaction details.";
        } catch (Exception ignored) {
            return "DEX SWAP CALL DETECTED\nRouter: " + router
                + "\nThe swap selector is recognized, but its parameters could not be safely decoded. Review the calldata and quote independently.";
        }
    }

    private TokenMetadata readTokenMetadata(EvmNetwork network, String contract) {
        Web3j web3j = client(network);
        try {
            verifyNetwork(web3j, network);
            String symbol = callTokenString(web3j, contract, "0x95d89b41");
            int decimals = 18;
            boolean decimalsKnown = false;
            try {
                String result = callRaw(web3j, contract, "0x313ce567");
                String hex = result.startsWith("0x") ? result.substring(2) : result;
                if (hex.length() >= 64) {
                    int parsed = new BigInteger(hex.substring(hex.length() - 64), 16).intValueExact();
                    if (parsed >= 0 && parsed <= 36) { decimals = parsed; decimalsKnown = true; }
                }
            } catch (Exception ignored) { }
            if (symbol == null || !symbol.matches("[A-Za-z0-9._-]{1,16}")) symbol = "TOKEN";
            return new TokenMetadata(symbol, decimals, decimalsKnown);
        } catch (Exception ignored) {
            return new TokenMetadata("TOKEN", 18, false);
        } finally { web3j.shutdown(); }
    }

    private String callTokenString(Web3j web3j, String contract, String selector) throws Exception {
        String result = callRaw(web3j, contract, selector);
        String hex = result.startsWith("0x") ? result.substring(2) : result;
        if (hex.length() < 64) return null;
        try {
            int offset = new BigInteger(hex.substring(0, 64), 16).intValueExact() * 2;
            if (offset >= 0 && offset + 64 <= hex.length()) {
                int length = new BigInteger(hex.substring(offset, offset + 64), 16).intValueExact();
                int start = offset + 64;
                if (length >= 0 && start + length * 2 <= hex.length()) {
                    byte[] bytes = Numeric.hexStringToByteArray(hex.substring(start, start + length * 2));
                    String text = new String(bytes, java.nio.charset.StandardCharsets.UTF_8).trim();
                    if (!text.isEmpty()) return text;
                }
            }
        } catch (Exception ignored) { }
        try {
            byte[] bytes = Numeric.hexStringToByteArray(hex.substring(0, 64));
            int length = 0;
            while (length < bytes.length && bytes[length] != 0) length++;
            String text = new String(bytes, 0, length, java.nio.charset.StandardCharsets.UTF_8).trim();
            return text.isEmpty() ? null : text;
        } catch (Exception ignored) { return null; }
    }

    private String callRaw(Web3j web3j, String contract, String data) throws Exception {
        var response = web3j.ethCall(
            org.web3j.protocol.core.methods.request.Transaction.createEthCallTransaction(address(), contract, data),
            DefaultBlockParameterName.LATEST).send();
        if (response.hasError()) throw rpcError(response.getError().getMessage());
        return response.getValue();
    }

    private static String abiAddress(String words, int offset) {
        if (words.length() < offset + 64) throw new IllegalArgumentException("Missing ABI address");
        return "0x" + words.substring(offset + 24, offset + 64);
    }

    private static BigInteger abiUint(String words, int offset) {
        if (words.length() < offset + 64) throw new IllegalArgumentException("Missing ABI integer");
        return new BigInteger(words.substring(offset, offset + 64), 16);
    }

    static final class DappSpendEstimate {
        final BigDecimal usdValue;
        final boolean fullyValued;
        final String selector;
        DappSpendEstimate(BigDecimal usdValue, boolean fullyValued, String selector) {
            this.usdValue = usdValue; this.fullyValued = fullyValued; this.selector = selector;
        }
    }

    private static final class TokenMetadata {
        final String symbol;
        final int decimals;
        final boolean decimalsKnown;
        TokenMetadata(String symbol, int decimals, boolean decimalsKnown) {
            this.symbol = symbol; this.decimals = decimals; this.decimalsKnown = decimalsKnown;
        }
    }

    DappSpendEstimate estimateDappSpend(EvmNetwork network, org.json.JSONObject tx) throws Exception {
        Web3j web3j = client(network);
        try {
            verifyNetwork(web3j, network);
            String to = tx.optString("to", "");
            if (!WalletUtils.isValidAddress(to)) throw new IllegalArgumentException("Dapp destination is invalid.");
            String data = tx.optString("data", tx.optString("input", "0x"));
            String hex = data.startsWith("0x") ? data.substring(2).toLowerCase(java.util.Locale.ROOT) : data.toLowerCase(java.util.Locale.ROOT);
            String selector = hex.length() >= 8 ? hex.substring(0, 8) : "";
            String words = hex.length() >= 8 ? hex.substring(8) : "";
            BigInteger valueWei = tx.has("value") ? Numeric.toBigInt(tx.getString("value")) : BigInteger.ZERO;
            if (valueWei.signum() < 0) throw new IllegalArgumentException("Dapp transaction has a negative native value.");
            BigInteger gas = tx.has("gas") ? Numeric.toBigInt(tx.getString("gas")) : BigInteger.ZERO;
            if (gas.signum() <= 0) {
                var estimate = web3j.ethEstimateGas(
                    org.web3j.protocol.core.methods.request.Transaction.createEthCallTransaction(address(), to, data)).send();
                if (estimate.hasError() || estimate.getAmountUsed() == null || estimate.getAmountUsed().signum() <= 0) {
                    throw rpcError(estimate.getError() == null ? "Could not estimate dapp transaction gas." : estimate.getError().getMessage());
                }
                gas = estimate.getAmountUsed().multiply(BigInteger.valueOf(120)).divide(BigInteger.valueOf(100));
            }
            BigInteger gasPrice;
            if (tx.has("maxFeePerGas")) gasPrice = Numeric.toBigInt(tx.getString("maxFeePerGas"));
            else if (tx.has("gasPrice")) gasPrice = Numeric.toBigInt(tx.getString("gasPrice"));
            else {
                var gasResponse = web3j.ethGasPrice().send();
                if (gasResponse.hasError() || gasResponse.getGasPrice() == null) throw rpcError("Could not fetch the dapp transaction gas price.");
                gasPrice = gasResponse.getGasPrice();
            }
            BigDecimal totalUsd = WalletSecurity.nativeUsdValue(network,
                new BigDecimal(valueWei.add(gas.multiply(gasPrice))).movePointLeft(18));
            boolean fullyValued = true;
            if ("a9059cbb".equals(selector) && words.length() >= 128) {
                TokenMetadata token = readTokenMetadata(network, to);
                if (!token.decimalsKnown) throw new IllegalStateException("Cannot enforce the USD spending cap because this token's decimals could not be read.");
                BigDecimal amount = new BigDecimal(abiUint(words, 64)).movePointLeft(token.decimals);
                totalUsd = totalUsd.add(WalletSecurity.tokenUsdValue(network, to, amount));
            } else if ("23b872dd".equals(selector) && words.length() >= 192) {
                TokenMetadata token = readTokenMetadata(network, to);
                if (!token.decimalsKnown) throw new IllegalStateException("Cannot enforce the USD spending cap because this token's decimals could not be read.");
                BigDecimal amount = new BigDecimal(abiUint(words, 128)).movePointLeft(token.decimals);
                totalUsd = totalUsd.add(WalletSecurity.tokenUsdValue(network, to, amount));
            } else if ("38ed1739".equals(selector) || "18cbafe5".equals(selector)
                    || "4a25d94a".equals(selector)) {
                int pathOffsetWord = 128;
                int amountOffset = 0;
                int pathStart = abiUint(words, pathOffsetWord).intValueExact() * 2;
                String tokenIn = "0x" + words.substring(pathStart + 64 + 24, pathStart + 128);
                TokenMetadata token = readTokenMetadata(network, tokenIn);
                if (!token.decimalsKnown) throw new IllegalStateException("Cannot enforce the USD spending cap because the input token's decimals could not be read.");
                BigDecimal amount = new BigDecimal(abiUint(words, amountOffset)).movePointLeft(token.decimals);
                totalUsd = totalUsd.add(WalletSecurity.tokenUsdValue(network, tokenIn, amount));
            } else if ("7ff36ab5".equals(selector) || "39509351".equals(selector)
                    || "a457c2d7".equals(selector) || "095ea7b3".equals(selector)
                    || "a22cb465".equals(selector) || "d0e30db0".equals(selector)
                    || "2e1a7d4d".equals(selector)) {
                // Recognized methods: approvals are not counted as spent funds, but are decoded and warned about separately.
            } else if (!hex.isEmpty()) {
                fullyValued = false;
            }
            return new DappSpendEstimate(totalUsd, fullyValued, selector);
        } finally { web3j.shutdown(); }
    }

    String dappSendTransaction(EvmNetwork network, org.json.JSONObject tx) throws Exception {
        Web3j web3j = client(network);
        try {
            verifyNetwork(web3j, network);
            String from = tx.optString("from", "");
            if (!from.equalsIgnoreCase(address())) throw new IllegalArgumentException("Dapp transaction account does not match this wallet.");
            String to = tx.optString("to", "");
            if (!WalletUtils.isValidAddress(to)) throw new IllegalArgumentException("Dapp transaction destination is invalid.");
            BigInteger nonce = tx.has("nonce") ? Numeric.toBigInt(tx.getString("nonce")) : web3j.ethGetTransactionCount(address(), DefaultBlockParameterName.PENDING).send().getTransactionCount();
            BigInteger value = tx.has("value") ? Numeric.toBigInt(tx.getString("value")) : BigInteger.ZERO;
            String data = tx.optString("data", tx.optString("input", "0x"));
            BigInteger gas = tx.has("gas") ? Numeric.toBigInt(tx.getString("gas")) : web3j.ethEstimateGas(org.web3j.protocol.core.methods.request.Transaction.createEthCallTransaction(address(), to, data)).send().getAmountUsed();
            if (gas == null || gas.signum() <= 0) gas = BigInteger.valueOf(21000);
            BigInteger gasPrice = tx.has("gasPrice") ? Numeric.toBigInt(tx.getString("gasPrice")) : web3j.ethGasPrice().send().getGasPrice();
            BigInteger maxPriority = tx.has("maxPriorityFeePerGas") ? Numeric.toBigInt(tx.getString("maxPriorityFeePerGas")) : gasPrice;
            BigInteger maxFee = tx.has("maxFeePerGas") ? Numeric.toBigInt(tx.getString("maxFeePerGas")) : gasPrice;
            RawTransaction raw;
            if (tx.has("maxFeePerGas") || tx.has("maxPriorityFeePerGas")) raw = RawTransaction.createTransaction(network.chainId, nonce, gas, to, value, data, maxPriority, maxFee);
            else raw = RawTransaction.createTransaction(nonce, gasPrice, gas, to, value, data);
            byte[] signed = TransactionEncoder.signMessage(raw, network.chainId, credentials);
            EthSendTransaction sent = web3j.ethSendRawTransaction(Numeric.toHexString(signed)).send();
            if (sent.hasError()) throw rpcError(sent.getError().getMessage());
            return sent.getTransactionHash();
        } finally { web3j.shutdown(); }
    }

    String broadcast(PreparedTransfer transfer) throws Exception {
        Web3j web3j = client(transfer.network);
        try {
            verifyNetwork(web3j, transfer.network);
            RawTransaction raw = transfer.assetToken == null
                ? RawTransaction.createEtherTransaction(transfer.nonce, transfer.gasPrice, transfer.gasLimit, transfer.to, transfer.valueWei)
                : RawTransaction.createTransaction(transfer.nonce, transfer.gasPrice, transfer.gasLimit, transfer.assetToken, BigInteger.ZERO, transfer.data);
            byte[] signed = TransactionEncoder.signMessage(
                raw, transfer.network.chainId, credentials);
            String encoded = Numeric.toHexString(signed);

            EthSendTransaction response = web3j.ethSendRawTransaction(encoded).send();
            if (response.hasError()) throw rpcError(response.getError().getMessage());
            String hash = response.getTransactionHash();
            if (hash == null || hash.isEmpty()) {
                throw new IllegalStateException("RPC returned no transaction hash.");
            }
            return hash;
        } finally {
            web3j.shutdown();
        }
    }

    static String formatNative(BigInteger wei) {
        BigDecimal value = new BigDecimal(wei)
            .divide(BigDecimal.TEN.pow(18), 8, RoundingMode.DOWN)
            .stripTrailingZeros();
        return value.scale() < 0 ? value.setScale(0).toPlainString() : value.toPlainString();
    }

    private static Web3j client(EvmNetwork network) {
        return Web3j.build(new HttpService(network.rpcUrl));
    }

    private static void verifyNetwork(Web3j web3j, EvmNetwork expected) throws Exception {
        var response = web3j.ethChainId().send();
        if (response.hasError()) throw rpcError(response.getError().getMessage());
        BigInteger actual = response.getChainId();
        if (actual == null || actual.longValue() != expected.chainId) {
            throw new IllegalStateException(
                "RPC chain mismatch. Expected " + expected.chainId + " but received " + actual + ".");
        }
    }

    private static IllegalStateException rpcError(String message) {
        return new IllegalStateException(
            message == null || message.trim().isEmpty() ? "RPC request failed." : message);
    }

    static final class PreparedTransfer {
        final EvmNetwork network;
        final String to;
        final BigInteger valueWei;
        final BigInteger nonce;
        final BigInteger gasPrice;
        final BigInteger gasLimit;
        final String assetToken;
        final String data;
        final String tokenSymbol;
        final int tokenDecimals;

        PreparedTransfer(EvmNetwork network, String to, BigInteger valueWei, BigInteger nonce,
                         BigInteger gasPrice, BigInteger gasLimit) {
            this(network, to, valueWei, nonce, gasPrice, gasLimit, null, null, null, 18);
        }

        private PreparedTransfer(EvmNetwork network, String to, BigInteger valueWei, BigInteger nonce,
                         BigInteger gasPrice, BigInteger gasLimit, String assetToken, String data,
                         String tokenSymbol, int tokenDecimals) {
            this.network = network; this.to = to; this.valueWei = valueWei; this.nonce = nonce;
            this.gasPrice = gasPrice; this.gasLimit = gasLimit; this.assetToken = assetToken; this.data = data;
            this.tokenSymbol = tokenSymbol; this.tokenDecimals = tokenDecimals;
        }

        static PreparedTransfer token(EvmNetwork network, String token, String to, BigInteger value, BigInteger nonce,
                                      BigInteger gasPrice, BigInteger gasLimit, String data, String symbol, int decimals) {
            return new PreparedTransfer(network, to, value, nonce, gasPrice, gasLimit, token, data, symbol, decimals);
        }

        String assetText() { return assetToken == null ? network.symbol : tokenSymbol; }

        String amountText() {
            return assetToken == null ? formatNative(valueWei) + " " + network.symbol
                : formatToken(valueWei, tokenDecimals) + " " + tokenSymbol;
        }
        String feeText() { return formatNative(gasPrice.multiply(gasLimit)) + " " + network.symbol; }
    }
}
