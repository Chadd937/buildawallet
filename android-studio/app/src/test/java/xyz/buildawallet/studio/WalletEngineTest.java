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
}
