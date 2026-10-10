package xyz.buildawallet.studio;

import org.junit.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class SolanaDappTransactionTest {
    private byte[] legacyTransaction() {
        // One zeroed signature, one signer/static key, recent blockhash, no instructions.
        byte[] wire = new byte[134];
        wire[0] = 1;
        int message = 65;
        wire[message] = 1; // required signatures
        wire[message + 1] = 0;
        wire[message + 2] = 0;
        wire[message + 3] = 1; // account key count
        for (int i = 0; i < 32; i++) wire[message + 4 + i] = (byte) (i + 1);
        for (int i = 0; i < 32; i++) wire[message + 36 + i] = (byte) (100 + i);
        wire[message + 68] = 0; // instruction count
        return wire;
    }

    private Object inspect(byte[] wire) throws Exception {
        Method method = NonEvmEngine.class.getDeclaredMethod("inspectSolanaWireTransaction", byte[].class);
        method.setAccessible(true);
        return method.invoke(null, wire);
    }

    private Object field(Object target, String name) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        return field.get(target);
    }

    @Test public void parsesLegacyMainnetTransactionEnvelope() throws Exception {
        Object view = inspect(legacyTransaction());
        assertEquals(1, field(view, "signatureCount"));
        assertEquals(1, field(view, "requiredSignatures"));
        assertEquals(65, field(view, "messageStart"));
        assertEquals(1, ((List<?>) field(view, "accountKeys")).size());
        assertEquals(0, ((List<?>) field(view, "instructions")).size());
    }

    @Test public void parsesVersionedV0MessageWithNoLookupTables() throws Exception {
        byte[] legacy = legacyTransaction();
        byte[] v0 = new byte[legacy.length + 2];
        System.arraycopy(legacy, 0, v0, 0, 65);
        int oldMessage = 65;
        v0[oldMessage] = (byte) 0x80;
        System.arraycopy(legacy, oldMessage, v0, oldMessage + 1, legacy.length - oldMessage);
        // The legacy instruction-count byte is now followed by v0's address-lookup count.
        v0[v0.length - 1] = 0;
        Object view = inspect(v0);
        assertEquals(1, field(view, "requiredSignatures"));
        assertEquals(Boolean.FALSE, field(view, "lookupTables"));
    }

    @Test public void supportsFullUnsigned64BitTokenAmounts() {
        assertEquals(new java.math.BigInteger("18446744073709551615"),
            SolanaToken.toRawAmount("18446744073709.551615", 6));
    }

    @Test public void supportsSPLMintsWithMoreThanEighteenDecimals() {
        assertEquals(new java.math.BigInteger("123"),
            SolanaToken.toRawAmount("0.000000000000000000000123", 24));
    }

    @Test public void rejectsAmountsAboveUnsigned64BitTokenRange() {
        try {
            SolanaToken.toRawAmount("18446744073709.551616", 6);
            throw new AssertionError("Expected amount outside u64 range to be rejected");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("unsigned 64-bit"));
        }
    }

    @Test public void rejectsTruncatedTransaction() throws Exception {
        try {
            inspect(new byte[] {1, 0, 0});
            throw new AssertionError("Expected truncated transaction to be rejected");
        } catch (java.lang.reflect.InvocationTargetException expected) {
            assertTrue(expected.getCause() instanceof IllegalArgumentException);
        }
    }
}
