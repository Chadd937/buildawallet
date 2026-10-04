import { base58 } from "@scure/base";
import { ed25519 } from "@noble/curves/ed25519.js";
import { verifyMessage } from "viem";
import { challenge, createSession } from "./billing.server";
import { machineChain, validAddress } from "./chains";

export async function authenticate(nonce: string, signature: string) {
  const row = await challenge(nonce); if (!row) throw new RangeError("Challenge is invalid or expired");
  const message = `BuildAWallet.xyz machine API login\nChain: ${row.chain}\nWallet: ${row.wallet}\nNonce: ${nonce}\nIssued: ${Math.floor(new Date(row.issued_at).getTime() / 1000)}\n\nSigning proves wallet control. It does not authorize a payment or transaction.`;
  const chain = machineChain(row.chain); if (!chain || !validAddress(chain, row.wallet)) throw new RangeError("Stored wallet is invalid");
  let verified = false;
  if (row.chain === "base") {
    if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new RangeError("Valid EVM signature required");
    verified = await verifyMessage({ address: row.wallet as `0x${string}`, message, signature: signature as `0x${string}` });
  } else {
    if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) throw new RangeError("Valid Solana signature required");
    try { verified = ed25519.verify(base58.decode(signature), new TextEncoder().encode(message), base58.decode(row.wallet), { zip215: false }); } catch { verified = false; }
  }
  if (!verified) throw new RangeError("Signature does not match the challenge wallet");
  return createSession(nonce, row.chain as "base" | "solana", row.wallet);
}
