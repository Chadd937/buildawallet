package xyz.buildawallet.studio;

import org.web3j.crypto.Bip32ECKeyPair;
import org.web3j.crypto.Credentials;
import org.web3j.crypto.MnemonicUtils;
import org.web3j.crypto.RawTransaction;
import org.web3j.crypto.TransactionEncoder;
import org.web3j.crypto.WalletUtils;
import org.web3j.protocol.Web3j;
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

    String broadcast(PreparedTransfer transfer) throws Exception {
        Web3j web3j = client(transfer.network);
        try {
            verifyNetwork(web3j, transfer.network);
            RawTransaction raw = RawTransaction.createEtherTransaction(
                transfer.nonce,
                transfer.gasPrice,
                transfer.gasLimit,
                transfer.to,
                transfer.valueWei
            );
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

        PreparedTransfer(EvmNetwork network, String to, BigInteger valueWei,
                         BigInteger nonce, BigInteger gasPrice, BigInteger gasLimit) {
            this.network = network;
            this.to = to;
            this.valueWei = valueWei;
            this.nonce = nonce;
            this.gasPrice = gasPrice;
            this.gasLimit = gasLimit;
        }

        String amountText() { return formatNative(valueWei) + " " + network.symbol; }
        String feeText() { return formatNative(gasPrice.multiply(gasLimit)) + " " + network.symbol; }
    }
}
