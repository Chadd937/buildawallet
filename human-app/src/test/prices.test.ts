// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { fetchPrices } from '@/lib/wallet/ops';
afterEach(()=>vi.restoreAllMocks());
it('uses actual stablecoin prices in the selected currency and leaves missing quotes unavailable',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({'usd-coin':{eur:0.92},ethereum:{eur:2200},tether:{}}));
 const values=await fetchPrices(['usd-coin','tether','dai','ethereum'],'eur');
 expect(values['usd-coin']).toBe(0.92);expect(values['ethereum']).toBe(2200);
 expect(values['tether']).toBeUndefined();expect(values['dai']).toBeUndefined();
});
it('reports a failed price feed instead of inventing a zero balance',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('',{status:503}));
 await expect(fetchPrices(['ethereum'],'usd')).rejects.toThrow('Price feed unavailable');
});
