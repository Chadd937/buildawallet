import { publicPlans } from "./plans";

export const BASE_COLLECTOR = "0xBcCA6AED433d9020C50D44560F9679F1B5eB511d";
export const SOLANA_COLLECTOR = "Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC";
export const BASE_MAINNET = "eip155:8453";
export const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const SOLANA_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SNAPSHOT_PRICE_ATOMIC = "10000";

export type Chain = "base" | "solana";
export type ReadKind = "wallet" | "usdc" | "transaction" | "snapshot";
export type AccessMode = "x402" | "subscription";

const resources: Record<Chain, string> = {
  base: "/machine/wallet?address={address}",
  solana: "/machine/solana-wallet?address={address}",
};

export function quote(chain: Chain, kind: ReadKind, access: AccessMode) {
  const network = chain === "base" ? BASE_MAINNET : SOLANA_MAINNET;
  if (access === "x402") {
    if (kind !== "wallet") return null;
    return {
      chain, network, kind, access, resource: resources[chain], mcpTool: `${chain}_wallet_payg`,
      price: { amountUSDC: "0.01", amountAtomic: SNAPSHOT_PRICE_ATOMIC, decimals: 6, scheme: "exact" },
      paymentOptions: [
        { network: BASE_MAINNET, asset: BASE_USDC, collector: BASE_COLLECTOR },
        { network: SOLANA_MAINNET, asset: SOLANA_USDC, collector: SOLANA_COLLECTOR },
      ],
      guidance: "Check the resource's current HTTP 402 challenge before signing. Network fees are separate. A quote does not reserve a price or submit payment.",
    };
  }
  const units = kind === "snapshot" ? 2 : 1;
  return {
    chain, network, kind, access, resource: `/machine/v1/${chain}/${kind}/{${kind === "transaction" ? "tx" : "address"}}`,
    mcpTool: kind === "snapshot" ? `${chain}_snapshot` : `${chain}_${kind}`,
    units, plans: publicPlans().map(({ id, name, units: quota, durationDays }) => ({ id, name, quota, durationDays })),
    guidance: "Requires an active API plan and bearer API key. This quote does not consume units.",
  };
}
