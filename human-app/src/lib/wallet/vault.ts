import { deriveAccounts, isValidMnemonic, normalizePhrase, publicAddresses, type PublicAddresses } from "./derive";

/**
 * Encrypted, browser-local vault. The recovery phrase is encrypted with
 * AES-256-GCM using a PBKDF2-SHA256 (600k iterations) key from the user's password.
 * Nothing secret ever leaves the device.
 */
export type VaultMeta = { addresses: PublicAddresses; createdAt: number; version: 2; walletName: string };
type VaultRecord = VaultMeta & { id: "primary"; ciphertext: string; salt: string; iv: string; iterations: number; deviceKey?: CryptoKey };

const DB_NAME = "buildawallet-vault";
const STORE = "vault";
const ID = "primary";
const ITERATIONS = 600_000;

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function openDb(): Promise<IDBDatabase> {
  if (!globalThis.crypto?.subtle || !globalThis.indexedDB) {
    return Promise.reject(new Error("This browser can't create a secure local vault. Use a current Chrome, Firefox, Safari or Edge."));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open the local vault."));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve((r ? (r as IDBRequest).result : undefined) as T);
      t.onerror = () => reject(t.error ?? new Error("Vault operation failed."));
    });
  } finally {
    db.close();
  }
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function passwordProblems(pw: string): string[] {
  const out: string[] = [];
  if (pw.length < 10) out.push("At least 10 characters");
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) out.push("Mix letters and numbers");
  return out;
}

export async function saveVault(phrase: string, password: string, walletName: string) {
  const canonical = normalizePhrase(phrase);
  if (!isValidMnemonic(canonical)) throw new Error("That recovery phrase isn't a valid 12 or 24-word BIP-39 phrase.");
  const problems = passwordProblems(password);
  if (problems.length) throw new Error(`Password: ${problems.join(", ")}.`);
  const addresses = publicAddresses(deriveAccounts(canonical));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(canonical)));
  const rec: VaultRecord = {
    id: ID, version: 2, createdAt: Date.now(), walletName, addresses,
    ciphertext: b64(ct), salt: b64(salt), iv: b64(iv), iterations: ITERATIONS,
  };
  await tx("readwrite", (s) => s.put(rec));
  return addresses;
}

/**
 * Passwordless save: encrypts the phrase with a random, non-extractable AES-GCM key
 * that lives only in this browser's IndexedDB (it cannot be exported or read back).
 */
export async function saveDeviceVault(phrase: string, walletName: string) {
  const canonical = normalizePhrase(phrase);
  if (!isValidMnemonic(canonical)) throw new Error("That recovery phrase isn't a valid 12 or 24-word BIP-39 phrase.");
  const addresses = publicAddresses(deriveAccounts(canonical));
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(canonical)));
  const rec: VaultRecord = {
    id: ID, version: 2, createdAt: Date.now(), walletName, addresses,
    ciphertext: b64(ct), salt: "", iv: b64(iv), iterations: 0, deviceKey: key,
  };
  await tx("readwrite", (s) => s.put(rec));
  return canonical;
}

export async function isDeviceVault() {
  const r = await readRecord();
  return !!r?.deviceKey;
}

async function readRecord(): Promise<VaultRecord | null> {
  const r = await tx<VaultRecord | undefined>("readonly", (s) => s.get(ID));
  return r ?? null;
}

export async function getVaultMeta(): Promise<VaultMeta | null> {
  const r = await readRecord();
  return r ? { addresses: r.addresses, createdAt: r.createdAt, version: 2, walletName: r.walletName } : null;
}

export async function unlockVault(password = ""): Promise<string> {
  const r = await readRecord();
  if (!r) throw new Error("No wallet is stored in this browser.");
  if (r.deviceKey) {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(r.iv) as BufferSource }, r.deviceKey, unb64(r.ciphertext) as BufferSource);
    return new TextDecoder().decode(pt);
  }
  try {
    const key = await deriveKey(password, unb64(r.salt), r.iterations);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(r.iv) as BufferSource }, key, unb64(r.ciphertext) as BufferSource);
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error("Wrong password.");
  }
}

export async function renameVault(walletName: string) {
  const r = await readRecord();
  if (r) await tx("readwrite", (s) => s.put({ ...r, walletName }));
}

export async function eraseVault() {
  await tx("readwrite", (s) => s.delete(ID));
}
