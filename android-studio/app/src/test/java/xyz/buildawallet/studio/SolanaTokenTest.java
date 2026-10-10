package xyz.buildawallet.studio;

import org.junit.Test;
import java.math.BigInteger;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

public class SolanaTokenTest {
    @Test public void convertsSplAmountUsingMintDecimals() {
        assertEquals(new BigInteger("1234567"), SolanaToken.toRawAmount("1.234567", 6));
        assertEquals(new BigInteger("42"), SolanaToken.toRawAmount("42", 0));
    }

    @Test public void rejectsAmountsWithExcessDecimals() {
        try {
            SolanaToken.toRawAmount("1.0000001", 6);
            fail("Expected too many decimal places to be rejected");
        } catch (IllegalArgumentException expected) {
            assertEquals("Amount has too many decimal places for this token.", expected.getMessage());
        }
    }

    @Test public void rejectsZeroAndNegativeAmounts() {
        for (String amount : new String[] {"0", "-1"}) {
            try {
                SolanaToken.toRawAmount(amount, 9);
                fail("Expected invalid amount to be rejected: " + amount);
            } catch (IllegalArgumentException expected) {
                assertEquals("Amount must be greater than zero.", expected.getMessage());
            }
        }
    }

    @Test public void rejectsValuesOutsideSignedTransferRange() {
        try {
            SolanaToken.toRawAmount("9223372036.854775808", 9);
            fail("Expected u64 value outside Java signed long range to be rejected");
        } catch (IllegalArgumentException expected) {
            assertEquals("Amount is outside the supported SPL token transfer range.", expected.getMessage());
        }
    }
}
