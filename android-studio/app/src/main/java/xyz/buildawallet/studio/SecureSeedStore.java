package xyz.buildawallet.studio;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.web3j.crypto.MnemonicUtils;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SecureSeedStore {
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "buildawallet.wallet.seed.v1";
    private static final String PREFS = "wallet_secrets";
    private static final String IV = "seed_iv";
    private static final String CIPHER = "seed_cipher";

    private final SharedPreferences prefs;

    SecureSeedStore(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    boolean exists() {
        return prefs.contains(IV) && prefs.contains(CIPHER);
    }

    /** Generate a new BIP-39 phrase without persisting it. Persist only after backup verification. */
    String generateMnemonic() {
        byte[] entropy = new byte[16];
        new SecureRandom().nextBytes(entropy);
        return MnemonicUtils.generateMnemonic(entropy);
    }

    String createMnemonic() throws Exception {
        String mnemonic = generateMnemonic();
        save(mnemonic);
        return mnemonic;
    }

    void importMnemonic(String mnemonic) throws Exception {
        String normalized = normalize(mnemonic);
        if (!MnemonicUtils.validateMnemonic(normalized)) {
            throw new IllegalArgumentException("That recovery phrase is not a valid BIP-39 mnemonic.");
        }
        save(normalized);
    }

    String loadMnemonic() throws Exception {
        String ivText = prefs.getString(IV, null);
        String cipherText = prefs.getString(CIPHER, null);
        if (ivText == null || cipherText == null) throw new IllegalStateException("No wallet exists yet.");

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(),
            new GCMParameterSpec(128, Base64.decode(ivText, Base64.NO_WRAP)));
        byte[] clear = cipher.doFinal(Base64.decode(cipherText, Base64.NO_WRAP));
        return new String(clear, StandardCharsets.UTF_8);
    }

    boolean matchesMnemonic(String candidate) throws Exception {
        String normalizedCandidate = normalize(candidate);
        if (!MnemonicUtils.validateMnemonic(normalizedCandidate)) return false;
        String stored = loadMnemonic();
        return normalize(stored).equals(normalizedCandidate);
    }

    void delete() {
        prefs.edit().clear().apply();
        try {
            KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
            keyStore.load(null);
            if (keyStore.containsAlias(KEY_ALIAS)) keyStore.deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) {
            // Encrypted seed material has already been removed from app storage.
        }
    }

    private void save(String mnemonic) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] encrypted = cipher.doFinal(normalize(mnemonic).getBytes(StandardCharsets.UTF_8));
        prefs.edit()
            .putString(IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .putString(CIPHER, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .apply();
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;

        KeyGenerator generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    private static String normalize(String mnemonic) {
        return mnemonic == null ? "" : mnemonic.trim().toLowerCase().replaceAll("\\s+", " ");
    }
}
