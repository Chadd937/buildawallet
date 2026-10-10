package xyz.buildawallet.studio;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class WalletEngineTest {
    @Test public void derivesStandardEthereumAccount() {
        String mnemonic = "test test test test test test test test test test test junk";
        assertEquals(
            "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
            WalletEngine.fromMnemonic(mnemonic).address().toLowerCase()
        );
    }

    @Test public void networkLookupMatchesBase() {
        assertEquals(8453L, EvmNetwork.byName("Base").chainId);
    }

    @Test public void preparedCustomTokenTransferDisplaysCorrectDecimalsAndSymbol() {
        EvmNetwork network = EvmNetwork.byName("Base");
        WalletEngine.PreparedTransfer transfer = WalletEngine.PreparedTransfer.token(
            network,
            "0x1111111111111111111111111111111111111111",
            "0x2222222222222222222222222222222222222222",
            new java.math.BigInteger("123456789"),
            java.math.BigInteger.ONE,
            java.math.BigInteger.valueOf(1000),
            java.math.BigInteger.valueOf(65000),
            "0xa9059cbb",
            "MYT",
            6
        );
        assertEquals("MYT", transfer.assetText());
        assertEquals("123.456789 MYT", transfer.amountText());
        assertEquals("0.000000000000065", transfer.feeText().split(" ")[0]);
    }
}
