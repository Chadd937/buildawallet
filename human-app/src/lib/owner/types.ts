export type TreasuryChain = "base" | "solana";
export type TreasuryAsset = "usdc" | "native";
export type TreasuryReceipt = {
  source: string;
  chain: TreasuryChain;
  tx: string;
  payer: string | null;
  plan: string | null;
  amountAtomic: string;
  paidAt: string;
};
export type CollectorBalance = {
  chain: TreasuryChain;
  address: string;
  nativeSymbol: string;
  nativeDecimals: number;
  nativeAtomic: string | null;
  usdcAtomic: string | null;
  error: string | null;
  explorer: string;
};
export type TreasurySnapshot = {
  observedAt: string;
  collectors: CollectorBalance[];
  ledger: {
    receipts: TreasuryReceipt[];
    totals: { source: string; chain: TreasuryChain; count: number; amountAtomic: string }[];
    error: string | null;
  };
};
export type WithdrawalQuote = {
  chain: TreasuryChain;
  asset: TreasuryAsset;
  from: string;
  to: string;
  amount: string;
  amountAtomic: string;
  decimals: number;
  expiresAt: string;
  networkFeeAtomic: string;
  accountRentAtomic: string;
  unsignedTransaction?: Record<string, string>;
  messageBase64?: string;
  recentBlockhash?: string;
};
