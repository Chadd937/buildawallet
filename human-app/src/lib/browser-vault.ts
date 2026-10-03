import { HDNodeWallet } from "ethers";

export type BrowserWalletMeta = { address: string; createdAt: number; version: 1 };
type BrowserWalletVault = BrowserWalletMeta & { id: "primary"; ciphertext: string; salt: string; iv: string };

const DB_NAME = "buildawallet-browser-wallet";
const STORE_NAME = "vault";
const VAULT_ID = "primary";
const ITERATIONS = 250_000;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function openDb(): Promise<IDBDatabase> {
  if (!globalThis.crypto?.subtle || !globalThis.indexedDB) throw new Error("This browser cannot create the secure local wallet vault.");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the local wallet vault."));
  });
}

async function readVault(): Promise<BrowserWalletVault | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(VAULT_ID);
      request.onsuccess = () => resolve((request.result as BrowserWalletVault | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Could not read the local wallet vault."));
    });
  } finally { db.close(); }
}

async function writeVault(vault: BrowserWalletVault) {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(vault);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not save the local wallet vault."));
    });
  } finally { db.close(); }
}

async function deriveKey(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptPhrase(phrase: string, password: string) {
  if (password.length < 10) throw new Error("Use a wallet password with at least 10 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(phrase));
  return { ciphertext: bytesToBase64(new Uint8Array(ciphertext)), salt: bytesToBase64(salt), iv: bytesToBase64(iv) };
}

export async function unlockPhrase(password: string) {
  const vault = await readVault();
  if (!vault) throw new Error("No browser wallet is stored on this device.");
  try {
    const key = await deriveKey(password, base64ToBytes(vault.salt));
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(vault.iv) }, key, base64ToBytes(vault.ciphertext));
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("Could not unlock this wallet. Check the wallet password.");
  }
}

async function savePhrase(phrase: string, password: string) {
  let wallet: HDNodeWallet;
  try { wallet = HDNodeWallet.fromPhrase(phrase.trim().replace(/\s+/g, " ")); }
  catch { throw new Error("Enter a valid BIP-39 recovery phrase."); }
  const canonical = wallet.mnemonic?.phrase ?? phrase.trim();
  const encrypted = await encryptPhrase(canonical, password);
  await writeVault({ id: VAULT_ID, address: wallet.address, createdAt: Date.now(), version: 1, ...encrypted });
  return { address: wallet.address, phrase: canonical };
}

export async function createLocalVault(password: string) {
  const wallet = HDNodeWallet.createRandom();
  const phrase = wallet.mnemonic?.phrase;
  if (!phrase) throw new Error("Could not create a recovery phrase in this browser.");
  return savePhrase(phrase, password);
}

export async function restoreLocalVault(phrase: string, password: string) { return savePhrase(phrase, password); }

export async function getLocalVaultMeta(): Promise<BrowserWalletMeta | null> {
  const vault = await readVault();
  return vault ? { address: vault.address, createdAt: vault.createdAt, version: 1 } : null;
}

export async function clearLocalVault() {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(VAULT_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not erase the local wallet."));
    });
  } finally { db.close(); }
}
