import { HDNodeWallet, JsonRpcProvider, formatEther, isAddress, parseEther } from "ethers";
import {
  clearLocalVault,
  createLocalVault,
  getLocalVaultMeta,
  restoreLocalVault,
  unlockPhrase,
  type BrowserWalletMeta,
} from "@/lib/browser-vault";

export type { BrowserWalletMeta } from "@/lib/browser-vault";

export type BrowserChain = { name: string; chainId: number; symbol: string; explorer: string; rpc: string };

export const browserChains: Record<string, BrowserChain> = {
  Ethereum: { name: "Ethereum", chainId: 1, symbol: "ETH", explorer: "https://etherscan.io", rpc: "https://ethereum-rpc.publicnode.com" },
  Base: { name: "Base", chainId: 8453, symbol: "ETH", explorer: "https://basescan.org", rpc: "https://mainnet.base.org" },
  Polygon: { name: "Polygon", chainId: 137, symbol: "POL", explorer: "https://polygonscan.com", rpc: "https://polygon-bor-rpc.publicnode.com" },
  Arbitrum: { name: "Arbitrum", chainId: 42161, symbol: "ETH", explorer: "https://arbiscan.io", rpc: "https://arb1.arbitrum.io/rpc" },
  Optimism: { name: "Optimism", chainId: 10, symbol: "ETH", explorer: "https://optimistic.etherscan.io", rpc: "https://mainnet.optimism.io" },
  Avalanche: { name: "Avalanche", chainId: 43114, symbol: "AVAX", explorer: "https://snowtrace.io", rpc: "https://api.avax.network/ext/bc/C/rpc" },
  "BNB Chain": { name: "BNB Chain", chainId: 56, symbol: "BNB", explorer: "https://bscscan.com", rpc: "https://bsc-dataseed.binance.org" },
};

export const createBrowserWallet = createLocalVault;
export const restoreBrowserWallet = restoreLocalVault;
export const getBrowserWalletMeta = getLocalVaultMeta;
export const exportRecoveryPhrase = unlockPhrase;
export const clearBrowserWallet = clearLocalVault;

function configFor(chain: string) {
  const config = browserChains[chain];
  if (!config) throw new Error(`${chain} is not supported by the browser wallet yet.`);
  return config;
}

function providerFor(chain: string) {
  const config = configFor(chain);
  return new JsonRpcProvider(config.rpc, { chainId: config.chainId, name: config.name.toLowerCase().replace(/\s+/g, "-") });
}

export async function getNativeBalance(chain: string, address: string) {
  const provider = providerFor(chain);
  try { return formatEther(await provider.getBalance(address)); }
  finally { provider.destroy(); }
}

export async function estimateNativeTransfer(chain: string, address: string, to: string, amount: string) {
  if (!isAddress(to)) throw new Error("Enter a valid destination address.");
  const value = parseEther(amount);
  if (value <= 0n) throw new Error("Enter an amount greater than zero.");
  const provider = providerFor(chain);
  try {
    const [gasLimit, feeData] = await Promise.all([
      provider.estimateGas({ from: address, to, value }),
      provider.getFeeData(),
    ]);
    const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
    return { estimatedFee: formatEther(gasLimit * gasPrice), symbol: configFor(chain).symbol };
  } finally { provider.destroy(); }
}

export async function sendNativeTransfer(chain: string, password: string, to: string, amount: string) {
  if (!isAddress(to)) throw new Error("Enter a valid destination address.");
  const value = parseEther(amount);
  if (value <= 0n) throw new Error("Enter an amount greater than zero.");
  const phrase = await unlockPhrase(password);
  const provider = providerFor(chain);
  try {
    const wallet = HDNodeWallet.fromPhrase(phrase).connect(provider);
    const transaction = await wallet.sendTransaction({ to, value });
    return { hash: transaction.hash, explorer: `${configFor(chain).explorer}/tx/${transaction.hash}` };
  } finally { provider.destroy(); }
}
