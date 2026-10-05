import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const auth=vi.hoisted(()=>({getSession:vi.fn(),requestEmailConfirmation:vi.fn(),verifyEmailCode:vi.fn(),logout:vi.fn()}));
vi.mock('@/integrations/auth/client',()=>auth);
import { LegalEntryGate } from '@/components/legal-entry-gate';
import { EmailCodeConfirmation } from '@/components/human/email-code-confirmation';
afterEach(()=>{cleanup();localStorage.clear();vi.clearAllMocks();});
it('does not put the terms dialog in front of a web confirmation-link return',()=>{
 render(<LegalEntryGate isLanding={false}/>);
 expect(screen.queryByRole('dialog')).toBeNull();
});
it('requires a new visitor to acknowledge terms on the landing page',()=>{
 render(<LegalEntryGate isLanding/>);
 expect(screen.getByRole('dialog')).toBeTruthy();
 expect(screen.getByRole('button',{name:/I agree/})).toBeDisabled();
});
it('requests a Cloudflare confirmation link back to setup and offers the backup code',async()=>{
 auth.getSession.mockResolvedValue({authenticated:false,verified:false});
 auth.requestEmailConfirmation.mockResolvedValue({ok:true,sent:true,expiresIn:600});
 render(<EmailCodeConfirmation onVerifiedChange={vi.fn()}/>);
 const input=await screen.findByRole('textbox',{name:'Email address'});
 fireEvent.change(input,{target:{value:'person@example.com'}});
 fireEvent.click(screen.getByRole('button',{name:'Email confirmation link'}));
 await waitFor(()=>expect(auth.requestEmailConfirmation).toHaveBeenCalledWith('person@example.com','/human/setup'));
 expect(await screen.findByRole('textbox',{name:'Confirmation code'})).toBeTruthy();
 expect(await screen.findByText(/spam or junk folder/)).toBeTruthy();
});
