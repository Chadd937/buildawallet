import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
const words = new Set(wordlist);
/** Refuse recognizable phrases and labeled private keys before sending chat. */
export function containsWalletSecret(text: string) {
  if (/\b(?:private\s*key|secret\s*key)\b[\s:=]{0,12}(?:0x)?[0-9a-f]{64}\b/i.test(text)) return true;
  const tokens=text.toLowerCase().match(/[a-z]+/g) || [];
  for (let i=0;i<tokens.length;i++) {
    if (!words.has(tokens[i]!)) continue;
    for (const count of [12,15,18,21,24]) {
      if (i+count>tokens.length) break;
      const candidate=tokens.slice(i,i+count);
      if (candidate.every(w=>words.has(w)) && validateMnemonic(candidate.join(' '),wordlist)) return true;
    }
  }
  return false;
}
