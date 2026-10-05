CREATE TABLE public.human_ai_conversations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.human_ai_conversations TO authenticated;
GRANT ALL ON public.human_ai_conversations TO service_role;
ALTER TABLE public.human_ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own AI conversation" ON public.human_ai_conversations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own AI conversation" ON public.human_ai_conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own AI conversation" ON public.human_ai_conversations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own AI conversation" ON public.human_ai_conversations FOR DELETE TO authenticated USING (auth.uid() = user_id);