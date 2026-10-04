// @vitest-environment node
import { expect, it } from 'vitest';
import { containsWalletSecret } from '@/lib/ai/secrets';
import { readJsonBody } from '@/lib/body';
it('refuses a valid phrase embedded in chat while allowing transaction hashes',()=>{
 expect(containsWalletSecret('my phrase is abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')).toBe(true);
 expect(containsWalletSecret('private key: '+ 'a'.repeat(64))).toBe(true);
 expect(containsWalletSecret('check tx 0x'+ 'a'.repeat(64))).toBe(false);
});
it('bounds bodies without trusting a Content-Length header',async()=>{
 const request=new Request('https://buildawallet.xyz/machine/v1/wallets/validate',{method:'POST',body:JSON.stringify({address:'a'.repeat(40000)})});
 await expect(readJsonBody(request,32000)).rejects.toThrow('too large');
});
