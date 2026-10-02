CREATE TABLE public.career_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_id text not null check (slot_id in ('slot-1', 'slot-2', 'slot-3')),
  state jsonb not null,
  state_updated_at timestamptz not null,
  created_at timestamptz not null default now()
);

CREATE UNIQUE INDEX career_saves_user_slot_idx ON public.career_saves (user_id, slot_id);
CREATE INDEX career_saves_user_idx ON public.career_saves (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.career_saves TO authenticated;
GRANT ALL ON public.career_saves TO service_role;

ALTER TABLE public.career_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can read their own career saves"
  ON public.career_saves FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Players can create their own career saves"
  ON public.career_saves FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Players can update their own career saves"
  ON public.career_saves FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Players can delete their own career saves"
  ON public.career_saves FOR DELETE TO authenticated
  USING (auth.uid() = user_id);