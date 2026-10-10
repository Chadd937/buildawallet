// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ hitRateLimit: vi.fn() }));
vi.mock("@/lib/db/storage.server", () => storage);
const billing = vi.hoisted(() => ({ consumeApiKey: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/machine/billing.server", () => ({
  ...billing,
  confirmPayment: vi.fn(),
  issueApiKey: vi.fn(),
  issueChallenge: vi.fn(),
  revokeApiKey: vi.fn(),
  statusForSession: vi.fn(),
}));
import { handleMachineRequest } from "@/lib/machine/router.server";
import { prepareBaseTransaction, prepareSolanaTransaction } from "@/lib/machine/transactions.server";
import { handleWalletRoute } from "@/lib/machine/wallets.server";
import { isValidMnemonic, deriveAccounts, publicAddresses } from "@/lib/wallet/derive";

beforeEach(() => {
  vi.clearAllMocks();
  billing.consumeApiKey.mockResolvedValue(null);
});
describe("Machine routing and wallet safety", () => {
  it("serves both canonical and public-route discovery", async () => {
    for (const path of ["/machine/v1/chains", "/api/public/machine/v1/chains"]) {
      const r = await handleMachineRequest(new Request(`https://buildawallet.xyz${path}`));
      expect(r.status).toBe(200);
      expect((await r.json()).chains).toHaveLength(9);
    }
  });
  it("refuses invalid credentials before reading upstream data", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const r = await handleMachineRequest(
      new Request(
        "https://buildawallet.xyz/machine/v1/base/wallet/0x0000000000000000000000000000000000000001",
        { headers: { authorization: "Bearer garbage" } },
      ),
    );
    expect(r.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("refuses exhausted quotas before dispatching a broadcast", async () => {
    billing.consumeApiKey.mockResolvedValue({ remaining: 0 });
    const spy = vi.spyOn(globalThis, "fetch");
    const r = await handleMachineRequest(
      new Request("https://buildawallet.xyz/machine/v1/base/transaction/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signedTransaction: "0xab" }),
      }),
    );
    expect(r.status).toBe(429);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("requires explicit consent before generating keys on the server", async () => {
    const r = await handleWalletRoute(
      new Request("https://buildawallet.xyz/machine/v1/wallets/generate", {
        method: "POST",
        body: "{}",
      }),
      ["generate"],
    );
    expect(r?.status).toBe(400);
    expect(await r?.text()).not.toContain('"mnemonic":');
  });
  it("returns an opt-in wallet once and writes only the rate-limit counter", async () => {
    storage.hitRateLimit.mockResolvedValue(true);
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    const r = await handleWalletRoute(
      new Request("https://buildawallet.xyz/machine/v1/wallets/generate", {
        method: "POST",
        body: JSON.stringify({ acknowledgeCustodyRisk: true }),
      }),
      ["generate"],
    );
    expect(r?.status).toBe(201);
    expect(r?.headers.get("cache-control")).toContain("no-store");
    const data = await r!.json();
    expect(isValidMnemonic(data.mnemonic)).toBe(true);
    expect(data.stored).toBe(false);
    expect(storage.hitRateLimit).toHaveBeenCalledTimes(1);
    expect(storage.hitRateLimit.mock.calls[0]!.slice(1)).toEqual([5, 3600]);
    expect(JSON.stringify(storage.hitRateLimit.mock.calls)).not.toContain(data.mnemonic);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    error.mockRestore();
  });
  it("derives known mainnet addresses from a public BIP-39 test vector", () => {
    const addresses = publicAddresses(
      deriveAccounts(
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      ),
    );
    expect(addresses.evm).toBe("0x9858EfFD232B4033E47d90003D41EC34EcaEda94");
    expect(addresses.bitcoin).toBe("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
    expect(addresses.solana).toBe("HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk");
  });
});

describe("Solana SPL transaction support", () => {
  const tokenProgram = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const mint = "So11111111111111111111111111111111111111112";
  const from = "Ew8mbrKwD6LGaSX28a6XGmXqeQSs2hykRibjXVhftTRC";
  const to = "SysvarRent111111111111111111111111111111111";
  const sourceTokenAccount = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const destinationTokenAccount = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

  function mockSolanaRpc(extensions: any[] = [], programId = tokenProgram) {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(init.body as string);
      const { method, params } = request;
      let result: any;
      if (method === "getGenesisHash") result = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
      else if (method === "getLatestBlockhash") result = { value: { blockhash: "11111111111111111111111111111111" } };
      else if (method === "getAccountInfo") {
        const address = params[0];
        if (address === mint) result = { value: { owner: programId, data: { parsed: {
          type: "mint", info: { isInitialized: true, decimals: 6, extensions },
        } } } };
        else if (address === sourceTokenAccount) result = { value: { owner: programId, data: { parsed: {
          type: "account", info: { mint, owner: from, tokenAmount: { amount: "2500000" } },
        } } } };
        else if (address === destinationTokenAccount) result = { value: { owner: programId, data: { parsed: {
          type: "account", info: { mint, owner: to, tokenAmount: { amount: "0" } },
        } } } };
        else result = { value: null };
      } else result = null;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    }));
  }

  it("prepares a checked custom SPL transfer after validating mint and token accounts", async () => {
    mockSolanaRpc();
    const prepared = await prepareSolanaTransaction("https://solana.example", {
      from, to, asset: "spl", amountAtomic: "1000000",
      tokenMint: mint, tokenDecimals: 6, tokenProgramId: tokenProgram,
      sourceTokenAccount, destinationTokenAccount,
    });
    expect(prepared).toMatchObject({
      chain: "solana", asset: "spl", token: mint, tokenProgram, tokenDecimals: 6, amountAtomic: "1000000",
    });
    expect(prepared.transactionBase64).toBeTruthy();
  });

  it("blocks Token-2022 mints with unsupported transfer extensions", async () => {
    const token2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
    mockSolanaRpc([{ extension: "transferHook" }], token2022);
    await expect(prepareSolanaTransaction("https://solana.example", {
      from, to, asset: "spl", amountAtomic: "1000000",
      tokenMint: mint, tokenDecimals: 6, tokenProgramId: token2022,
      sourceTokenAccount, destinationTokenAccount,
    })).rejects.toThrow("Unsupported Token-2022 mint extensions");
  });
});

describe("multi-chain EVM transaction support", () => {
  it("prepares Arbitrum native and USDC transfers using the configured chain ID and token", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const { method } = JSON.parse(init.body as string);
      const values: Record<string, any> = {
        eth_chainId: "0xa4b1",
        eth_getTransactionCount: "0x7",
        eth_estimateGas: "0x5208",
        eth_maxPriorityFeePerGas: "0x3b9aca00",
        eth_getBlockByNumber: { baseFeePerGas: "0x3b9aca00" },
      };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: values[method] }));
    }));
    const native = await prepareBaseTransaction("https://arb.example", {
      from: "0xBcCA6AED433d9020C50D44560F9679F1B5eB511d",
      to: "0x1111111111111111111111111111111111111111",
      asset: "native",
      amountAtomic: "1000",
    }, "arbitrum");
    expect(native).toMatchObject({ chain: "arbitrum", unsignedTransaction: { chainId: "0xa4b1" } });
    const usdc = await prepareBaseTransaction("https://arb.example", {
      from: "0xBcCA6AED433d9020C50D44560F9679F1B5eB511d",
      to: "0x1111111111111111111111111111111111111111",
      asset: "usdc",
      amountAtomic: "1250000",
    }, "arbitrum");
    expect(usdc.chain).toBe("arbitrum");
    expect(usdc.token).toBe("0xaf88d065e77c8C2239327C5EDb3A432268e5831");
    expect((usdc.unsignedTransaction as Record<string, string>)["data"]).toMatch(/^0xa9059cbb/);
  });

  it("prepares custom ERC-20 transfers only after validating on-chain decimals and balance", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const { method, params } = JSON.parse(init.body as string);
      let result: any;
      if (method === "eth_chainId") result = "0xa4b1";
      else if (method === "eth_call") result = params[0].data === "0x313ce567" ? "0x6" : "0x1e8480";
      else if (method === "eth_getTransactionCount") result = "0x7";
      else if (method === "eth_estimateGas") result = "0x11170";
      else if (method === "eth_maxPriorityFeePerGas") result = "0x3b9aca00";
      else if (method === "eth_getBlockByNumber") result = { baseFeePerGas: "0x3b9aca00" };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    }));
    const prepared = await prepareBaseTransaction("https://arb.example", {
      from: "0xBcCA6AED433d9020C50D44560F9679F1B5eB511d",
      to: "0x2222222222222222222222222222222222222222",
      asset: "erc20",
      tokenAddress: "0x1111111111111111111111111111111111111111",
      tokenDecimals: 6,
      amountAtomic: "1000000",
    }, "arbitrum");
    expect(prepared).toMatchObject({
      chain: "arbitrum",
      token: "0x1111111111111111111111111111111111111111",
      tokenDecimals: 6,
    });
    expect((prepared.unsignedTransaction as Record<string, string>)["to"]).toBe("0x1111111111111111111111111111111111111111");
    expect((prepared.unsignedTransaction as Record<string, string>)["data"]).toMatch(/^0xa9059cbb/);
  });

  it("rejects an RPC endpoint whose chain ID does not match the requested EVM chain", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      jsonrpc: "2.0", id: 1, result: "0x1",
    }))));
    await expect(prepareBaseTransaction("https://arb.example", {
      from: "0xBcCA6AED433d9020C50D44560F9679F1B5eB511d",
      to: "0x1111111111111111111111111111111111111111",
      asset: "native",
      amountAtomic: "1000",
    }, "arbitrum")).rejects.toThrow("network mismatch");
  });
});
