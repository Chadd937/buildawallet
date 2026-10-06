import { address, getAddressEncoder, getProgramDerivedAddress } from "@solana/addresses";
import { base58 } from "@scure/base";
import { SOLANA_COLLECTOR, SOLANA_COLLECTOR_ATA, SOLANA_USDC } from "@/lib/machine/config";

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

export async function usdcTokenAccount(owner: string) {
  const encode = getAddressEncoder();
  const [account] = await getProgramDerivedAddress({
    programAddress: address(ATA_PROGRAM),
    seeds: [
      encode.encode(address(owner)),
      encode.encode(address(TOKEN_PROGRAM)),
      encode.encode(address(SOLANA_USDC)),
    ],
  });
  return account as string;
}

function compact(n: number) {
  const out: number[] = [];
  do {
    const byte = n & 127;
    n >>>= 7;
    out.push(n ? byte | 128 : byte);
  } while (n);
  return out;
}
function amountBytes(amount: string) {
  if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n || BigInt(amount) > 0xffffffffffffffffn)
    throw new Error("Invalid Solana amount");
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(amount), true);
  return [...bytes];
}

/** Shared by the server and device, so the device verifies the exact reviewed intent. */
export async function treasurySolanaMessage(intent: {
  asset: "native" | "usdc";
  to: string;
  amountAtomic: string;
  recentBlockhash: string;
}) {
  const keys =
    intent.asset === "native"
      ? [SOLANA_COLLECTOR, intent.to, SYSTEM_PROGRAM]
      : [
          SOLANA_COLLECTOR,
          SOLANA_COLLECTOR_ATA,
          await usdcTokenAccount(intent.to),
          intent.to,
          SOLANA_USDC,
          TOKEN_PROGRAM,
          SYSTEM_PROGRAM,
          ATA_PROGRAM,
        ];
  if (new Set(keys).size !== keys.length)
    throw new Error("Choose a different receiving wallet address");
  const bytes = [1, 0, intent.asset === "native" ? 1 : 5, ...compact(keys.length)];
  for (const key of keys) {
    const decoded = base58.decode(key);
    if (decoded.length !== 32) throw new Error("Invalid Solana address");
    bytes.push(...decoded);
  }
  const blockhash = base58.decode(intent.recentBlockhash);
  if (blockhash.length !== 32) throw new Error("Invalid Solana blockhash");
  bytes.push(...blockhash);
  const instructions =
    intent.asset === "native"
      ? [{ program: 2, accounts: [0, 1], data: [2, 0, 0, 0, ...amountBytes(intent.amountAtomic)] }]
      : [
          // Idempotent ATA creation supports a receiving wallet's first USDC transfer.
          { program: 7, accounts: [0, 2, 3, 4, 6, 5], data: [1] },
          {
            program: 5,
            accounts: [1, 4, 2, 0],
            data: [12, ...amountBytes(intent.amountAtomic), 6],
          },
        ];
  bytes.push(...compact(instructions.length));
  for (const ix of instructions)
    bytes.push(
      ix.program,
      ...compact(ix.accounts.length),
      ...ix.accounts,
      ...compact(ix.data.length),
      ...ix.data,
    );
  return Uint8Array.from(bytes);
}
