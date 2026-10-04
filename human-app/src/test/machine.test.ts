// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const admin = vi.hoisted(() => ({rpc:vi.fn(),from:vi.fn()}));
vi.mock("@/integrations/supabase/client.server",()=>({supabaseAdmin:admin}));
const billing = vi.hoisted(() => ({ consumeApiKey: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/machine/billing.server", () => ({ ...billing, confirmPayment: vi.fn(), issueApiKey: vi.fn(), issueChallenge: vi.fn(), revokeApiKey: vi.fn(), statusForSession: vi.fn() }));
vi.mock("@/lib/machine/x402.server", () => ({ paid: vi.fn() }));
import { handleMachineRequest } from "@/lib/machine/router.server";
import { handleWalletRoute } from "@/lib/machine/wallets.server";
import { isValidMnemonic, deriveAccounts, publicAddresses } from "@/lib/wallet/derive";

beforeEach(() => { vi.clearAllMocks(); billing.consumeApiKey.mockResolvedValue(null); });
describe("Machine routing and wallet safety", () => {
  it("serves both canonical and public-route discovery", async () => {
    for (const path of ["/machine/v1/chains", "/api/public/machine/v1/chains"]) {
      const r=await handleMachineRequest(new Request(`https://buildawallet.xyz${path}`));
      expect(r.status).toBe(200);
      expect((await r.json()).chains).toHaveLength(10);
    }
  });
  it("refuses invalid credentials before reading upstream data", async () => {
    const spy=vi.spyOn(globalThis,"fetch");
    const r=await handleMachineRequest(new Request("https://buildawallet.xyz/machine/v1/base/wallet/0x0000000000000000000000000000000000000001", {headers:{authorization:"Bearer garbage"}}));
    expect(r.status).toBe(401); expect(spy).not.toHaveBeenCalled(); spy.mockRestore();
  });
  it("refuses exhausted quotas before dispatching a broadcast", async () => {
    billing.consumeApiKey.mockResolvedValue({remaining:0});
    const spy=vi.spyOn(globalThis,"fetch");
    const r=await handleMachineRequest(new Request("https://buildawallet.xyz/machine/v1/base/transaction/broadcast", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({signedTransaction:"0xab"})}));
    expect(r.status).toBe(429); expect(spy).not.toHaveBeenCalled(); spy.mockRestore();
  });
  it("requires explicit consent before generating keys on the server", async () => {
    const r=await handleWalletRoute(new Request("https://buildawallet.xyz/machine/v1/wallets/generate",{method:"POST",body:"{}"}),["generate"]);
    expect(r?.status).toBe(400); expect(await r?.text()).not.toContain('"mnemonic":');
  });
  it("returns an opt-in wallet once and writes only the rate-limit counter", async () => {
    admin.rpc.mockResolvedValue({data:true,error:null});
    const log=vi.spyOn(console,"log"); const error=vi.spyOn(console,"error");
    const r=await handleWalletRoute(new Request("https://buildawallet.xyz/machine/v1/wallets/generate",{method:"POST",body:JSON.stringify({acknowledgeCustodyRisk:true})}),["generate"]);
    expect(r?.status).toBe(201);expect(r?.headers.get("cache-control")).toContain("no-store");
    const data=await r!.json();expect(isValidMnemonic(data.mnemonic)).toBe(true);expect(data.stored).toBe(false);
    expect(admin.from).not.toHaveBeenCalled();expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect(admin.rpc.mock.calls[0]![0]).toBe("hit_api_rate_limit");
    expect(JSON.stringify(admin.rpc.mock.calls)).not.toContain(data.mnemonic);
    expect(log).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled(); log.mockRestore();error.mockRestore();
  });
  it("derives known mainnet addresses from a public BIP-39 test vector", () => {
    const addresses=publicAddresses(deriveAccounts("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"));
    expect(addresses.evm).toBe("0x9858EfFD232B4033E47d90003D41EC34EcaEda94");
    expect(addresses.bitcoin).toBe("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
    expect(addresses.tron).toBe("TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH");
    expect(addresses.solana).toBe("HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk");
  });
});
