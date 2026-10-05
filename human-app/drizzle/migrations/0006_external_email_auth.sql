-- BuildAWallet accounts are now authenticated by the first-party Cloudflare
-- email Worker. Its stable subject is a UUID derived from the protected email
-- hash, so conversation rows no longer depend on Supabase Auth users.
ALTER TABLE public.human_ai_conversations
  DROP CONSTRAINT IF EXISTS human_ai_conversations_user_id_fkey;
