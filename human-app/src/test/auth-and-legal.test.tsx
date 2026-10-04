import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const auth=vi.hoisted(()=>({getUser:vi.fn(),onAuthStateChange:vi.fn(),signInWithOtp:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth}}));
import { LegalEntryGate } from '@/components/legal-entry-gate';
import { EmailCodeConfirmation } from '@/components/human/email-code-confirmation';
afterEach(()=>{cleanup();localStorage.clear();vi.clearAllMocks();});
it('does not put the terms dialog in front of a web magic-link return',()=>{
 render(<LegalEntryGate isLanding={false}/>);
 expect(screen.queryByRole('dialog')).toBeNull();
});
it('requires a new visitor to acknowledge terms on the landing page',()=>{
 render(<LegalEntryGate isLanding/>);
 expect(screen.getByRole('dialog')).toBeTruthy();
 expect(screen.getByRole('button',{name:/I agree/})).toBeDisabled();
});
it('requests a link back to setup and reminds users about spam',async()=>{
 auth.getUser.mockResolvedValue({data:{user:null}});
 auth.onAuthStateChange.mockReturnValue({data:{sub:{},subscription:{unsubscribe:vi.fn()}}});
 auth.signInWithOtp.mockResolvedValue({error:null});
 render(<EmailCodeConfirmation onVerifiedChange={vi.fn()}/>);
 const input=await screen.findByRole('textbox',{name:'Email address'});
 fireEvent.change(input,{target:{value:'person@example.com'}});
 fireEvent.click(screen.getByRole('button',{name:'Email me a sign-in link'}));
 await waitFor(()=>expect(auth.signInWithOtp).toHaveBeenCalledWith({email:'person@example.com',options:{shouldCreateUser:true,emailRedirectTo:window.location.origin+'/human/setup'}}));
 expect(await screen.findByText(/spam or junk folder/)).toBeTruthy();
});
