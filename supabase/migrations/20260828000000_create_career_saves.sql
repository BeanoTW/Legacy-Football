create table if not exists public.career_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_id text not null check (slot_id in ('slot-1', 'slot-2', 'slot-3')),
  state jsonb not null,
  state_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot_id)
);

alter table public.career_saves enable row level security;

create policy "Players can read their own careers"
on public.career_saves for select
using (auth.uid() = user_id);

create policy "Players can create their own careers"
on public.career_saves for insert
with check (auth.uid() = user_id);

create policy "Players can update their own careers"
on public.career_saves for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Players can delete their own careers"
on public.career_saves for delete
using (auth.uid() = user_id);

create or replace function public.touch_career_save_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists career_saves_touch_updated_at on public.career_saves;
create trigger career_saves_touch_updated_at
before update on public.career_saves
for each row execute function public.touch_career_save_updated_at();
