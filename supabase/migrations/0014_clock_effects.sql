-- =====================================================================
-- 0014 (ticket P2-8): the game clock and the DM's effects tool.
--
--   * The DM moves campaigns.game_seconds only with advance_clock, which writes an event to game_clock_events
--     (append-only, like the roll log). A direct change to game_seconds is refused, so the log is complete.
--   * campaigns joins the realtime publication, so every open screen hears the new time; effects that run out are
--     worked out from game_seconds (rules engine isActive), not by a timer, so nothing is deleted when they end.
--   * apply_effect puts an effect on a character, with its hidden detail written to effect_secrets in the same
--     step. "For" durations (10 minutes, 1 hour) are counted from the clock as the server sees it.
-- Rounds-based effects are counted down in combat (a later phase); advancing the clock leaves them as they are.
-- =====================================================================

create table public.game_clock_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  from_seconds bigint not null check (from_seconds >= 0),
  to_seconds bigint not null check (to_seconds > from_seconds),
  reason text not null default '' check (char_length(reason) <= 200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index game_clock_events_campaign_idx on public.game_clock_events (campaign_id, created_at desc);

-- Append-only for every role; rows go only with their campaign.
create function public.game_clock_events_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from campaigns where id = old.campaign_id) then
    return old;
  end if;
  raise exception 'The clock log is append-only: events cannot be changed or deleted';
end $$;
create trigger game_clock_events_append_only_trg before update or delete on public.game_clock_events
  for each row execute function public.game_clock_events_append_only();

-- game_seconds changes only inside advance_clock (the clock_move flag), so every change is in the log.
create function public.campaigns_clock_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.game_seconds is distinct from old.game_seconds
     and coalesce(current_setting('app.clock_move', true), '') <> 'on' then
    raise exception 'The clock moves with advance_clock, so every change is logged';
  end if;
  return new;
end $$;
create trigger campaigns_clock_guard_trg before update of game_seconds on public.campaigns
  for each row execute function public.campaigns_clock_guard();

alter table public.game_clock_events enable row level security;
create policy "read clock events" on public.game_clock_events for select to authenticated
  using (is_member(campaign_id));
revoke insert, update, delete on public.game_clock_events from anon, authenticated;

-- every open screen hears the clock move (realtime applies the campaigns read policy)
alter publication supabase_realtime add table public.campaigns;

-- FUNCTIONS -------------------------------------------------------------------

-- DM only: moves the clock forward by p_seconds (up to a year at a time) and logs it. Returns the new time.
create function public.advance_clock(p_campaign uuid, p_seconds bigint, p_reason text default '') returns bigint
language plpgsql security definer set search_path = public as $$
declare
  was bigint;
  now_at bigint;
begin
  perform require_dm(p_campaign);
  if p_seconds is null or p_seconds < 1 or p_seconds > 31536000 then
    raise exception 'Advance the clock by between 1 second and 365 days' using errcode = '22023';
  end if;
  select game_seconds into was from campaigns where id = p_campaign for update;
  now_at := was + p_seconds;
  perform set_config('app.clock_move', 'on', true);
  update campaigns set game_seconds = now_at where id = p_campaign;
  perform set_config('app.clock_move', '', true);
  insert into game_clock_events (campaign_id, from_seconds, to_seconds, reason)
  values (p_campaign, was, now_at, left(btrim(coalesce(p_reason, '')), 200));
  return now_at;
end $$;

-- DM only: puts an effect on a character. p_duration is stored as given ({"kind": "rounds" | "rest" | "permanent"
-- ...}), except {"kind": "for", "seconds": n}, which becomes {"kind": "until", "atSeconds": now + n} on the
-- campaign's clock. A non-empty hidden detail goes to effect_secrets, which only DMs read.
create function public.apply_effect(
  p_character uuid, p_name text, p_source text, p_stat text, p_mode text, p_value int, p_duration jsonb,
  p_concentration boolean default false, p_hidden_detail text default ''
) returns public.effects
language plpgsql security definer set search_path = public as $$
declare
  c uuid := character_campaign(p_character);
  d jsonb := p_duration;
  result effects;
begin
  perform require_dm(c);
  if d ->> 'kind' = 'for' then
    if jsonb_typeof(d -> 'seconds') <> 'number' or (d ->> 'seconds')::numeric < 1
       or (d ->> 'seconds')::numeric > 31536000 then
      raise exception 'An effect lasts between 1 second and 365 days' using errcode = '22023';
    end if;
    d := jsonb_build_object('kind', 'until',
                            'atSeconds', (select game_seconds from campaigns where id = c) + (d ->> 'seconds')::bigint);
  end if;
  insert into effects (character_id, name, source, stat, mode, value, duration, concentration)
  values (p_character, btrim(p_name), btrim(coalesce(p_source, '')), p_stat, p_mode, p_value, d,
          coalesce(p_concentration, false))
  returning * into result;
  if char_length(btrim(coalesce(p_hidden_detail, ''))) > 0 then
    insert into effect_secrets (effect_id, hidden_detail) values (result.id, btrim(p_hidden_detail));
  end if;
  return result;
end $$;

revoke execute on function
  public.game_clock_events_append_only(), public.campaigns_clock_guard(),
  public.advance_clock(uuid, bigint, text),
  public.apply_effect(uuid, text, text, text, text, int, jsonb, boolean, text)
from public, anon, authenticated;

grant execute on function
  public.advance_clock(uuid, bigint, text),
  public.apply_effect(uuid, text, text, text, text, int, jsonb, boolean, text)
to authenticated;
