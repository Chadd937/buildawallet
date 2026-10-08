package xyz.buildawallet.studio;

import org.bitcoinj.base.BitcoinNetwork;
import org.bitcoinj.base.ScriptType;
import org.bitcoinj.wallet.DeterministicSeed;
import org.bitcoinj.wallet.KeyChainGroupStructure;
import org.bitcoinj.wallet.Wallet;
import org.p2p.solanaj.core.Account;
import org.p2p.solanaj.core.PublicKey;
import org.p2p.solanaj.core.Transaction;
import org.p2p.solanaj.programs.SystemProgram;
import org.p2p.solanaj.rpc.Cluster;
import org.p2p.solanaj.rpc.RpcClient;

import java.math.BigDecimal;
import java.math.RoundingMode;

final class NonEvmEngine {
    private static final long LAMPORTS_PER_SOL = 1_000_000_000L;
    private final Account solana;
    private final Wallet bitcoin;
    private final RpcClient solanaRpc;

    private NonEvmEngine(String mnemonic) {
        solana = Account.fromMnemonic(java.util.Arrays.asList(mnemonic.trim().split("\\s+")), "");
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
        Transaction tx = new Transaction();
        tx.addInstruction(SystemProgram.transfer(solana.getPublicKey(), to, lamports));
        return solanaRpc.getApi().sendTransaction(tx, solana);
    }

    String bitcoinAddress() {
        return bitcoin.currentReceiveAddress().toString();
    }

    void close() {
        // RpcClient is lightweight and owns no persistent native resources.
    }
}
