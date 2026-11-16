-- =====================================================================
-- 0031: private messages, whispers, and the pause button / X-card (P4-5, MSG-1, WHI-1, SAF-1).
--
-- MESSAGES run only between the DM and one player: each player has one thread (messages.player_id), which that player
-- and the campaign's DMs read. Nothing goes player to player. A message is never edited or deleted (a trigger refuses
-- both); the only change is read_at, made by mark_thread_read. At most 20 messages a minute per person.
-- A whisper is a DM's message styled differently; the DM may also save it in the player's private notes
-- (player_notes), which only that player ever reads, the DM included.
-- Each new message is announced on the player's own channel and the DMs' channel (event 'message', no text in it).
--
-- SAFETY: any member may ask for a pause, openly or as an anonymous X-card, at most once every five minutes. An
-- anonymous request is stored with no user, is announced with no sender, and the rate table that knows who asked
-- (safety_rate) has no read policy for anyone. A pause blocks nothing: it is a signal and a banner until the DM
-- resumes.
-- =====================================================================

-- MESSAGES ---------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- the player whose thread this is
  player_id uuid not null references auth.users (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000 and char_length(btrim(body)) > 0),
  kind text not null default 'message' check (kind in ('message', 'whisper')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- a whisper comes from the DM, never from the player whose thread it is
  constraint messages_whisper_from_dm check (kind = 'message' or sender_id <> player_id)
);
create index messages_thread_idx on public.messages (campaign_id, player_id, created_at);
create index messages_sender_idx on public.messages (sender_id, created_at);

alter table public.messages enable row level security;
revoke all on public.messages from anon;

create policy "read own thread or dm" on public.messages for select to authenticated
  using (is_dm(campaign_id) or (player_id = auth.uid() and is_member(campaign_id)));
-- a player writes plain messages in their own thread; a DM writes in any thread. Always as themselves.
create policy "write as yourself" on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (is_dm(campaign_id) or (player_id = auth.uid() and kind = 'message' and is_member(campaign_id)))
  );

-- the thread belongs to a player of the campaign; time is the server's; and the rate limit
create function public.messages_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from members where campaign_id = new.campaign_id and user_id = new.player_id and role = 'player'
  ) then
    raise exception 'Messages are between the DM and a player of this campaign' using errcode = '22023';
  end if;
  new.created_at := now();
  new.read_at := null;
  if (select count(*) from messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'That is 20 messages in a minute. Wait a moment before sending more.' using errcode = 'PT429';
  end if;
  return new;
end $$;
create trigger messages_before_insert before insert on public.messages
  for each row execute function public.messages_before_insert();

-- messages are never edited: only read_at may be set, once
create function public.messages_no_edit() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.id is distinct from old.id or new.campaign_id is distinct from old.campaign_id
     or new.player_id is distinct from old.player_id or new.sender_id is distinct from old.sender_id
     or new.body is distinct from old.body or new.kind is distinct from old.kind
     or new.created_at is distinct from old.created_at
     or old.read_at is not null or new.read_at is null then
    raise exception 'Messages cannot be edited' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger messages_no_edit before update on public.messages
  for each row execute function public.messages_no_edit();

-- nor deleted, except when their campaign or a person's account goes (a cascade runs one trigger level deeper)
create function public.messages_no_delete() returns trigger
language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() <= 1 then
    raise exception 'Messages cannot be deleted' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger messages_no_delete before delete on public.messages
  for each row execute function public.messages_no_delete();

-- each new message is announced to the player and to the DMs (who see every thread); the text stays in the table
create function public.messages_announce() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  envelope jsonb := jsonb_build_object(
    'sender', new.sender_id,
    'senderRole', case when is_dm(new.campaign_id) then 'dm' else 'player' end,
    'sentAt', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'data', jsonb_build_object('messageId', new.id, 'playerId', new.player_id, 'kind', new.kind)
  );
begin
  perform realtime.send(envelope, 'message', 'user:' || new.campaign_id || ':' || new.player_id, true);
  perform realtime.send(envelope, 'message', 'dm:' || new.campaign_id, true);
  return null;
end $$;
create trigger messages_announce after insert on public.messages
  for each row execute function public.messages_announce();

-- A player's private notes: only that player reads them (the DM who saved a whisper there cannot).
create table public.player_notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  source text not null default 'whisper' check (source in ('whisper')),
  message_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now()
);
create index player_notes_owner_idx on public.player_notes (user_id, campaign_id, created_at);

alter table public.player_notes enable row level security;
revoke all on public.player_notes from anon;

create policy "read own private notes" on public.player_notes for select to authenticated
  using (user_id = auth.uid() and is_member(campaign_id));
create policy "remove own private notes" on public.player_notes for delete to authenticated
  using (user_id = auth.uid());

-- Sends a message as the caller. A DM may send a whisper, and save it in the player's private notes. Returns its id.
create function public.send_message(
  p_campaign uuid,
  p_player uuid,
  p_body text,
  p_kind text default 'message',
  p_save_note boolean default false
) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  me constant uuid := auth.uid();
  new_id uuid;
begin
  if me is null or not is_member(p_campaign) then
    raise exception 'Only members of this campaign can send messages' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('message', 'whisper') then
    raise exception 'A message or a whisper' using errcode = '22023';
  end if;
  if not is_dm(p_campaign) and (p_player <> me or p_kind <> 'message' or p_save_note) then
    raise exception 'Players write only to the DM' using errcode = '42501';
  end if;
  if p_save_note and p_kind <> 'whisper' then
    raise exception 'Only a whisper can be saved to the player''s notes' using errcode = '22023';
  end if;
  insert into messages (campaign_id, player_id, sender_id, body, kind)
    values (p_campaign, p_player, me, p_body, p_kind)
    returning id into new_id;
  if p_save_note then
    insert into player_notes (campaign_id, user_id, body, message_id) values (p_campaign, p_player, p_body, new_id);
  end if;
  return new_id;
end $$;

-- Marks the other side's messages in a thread read: a player reads the DM's, a DM reads the player's. Returns how many.
create function public.mark_thread_read(p_campaign uuid, p_player uuid) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  n integer;
begin
  if is_dm(p_campaign) then
    update messages set read_at = now()
      where campaign_id = p_campaign and player_id = p_player and sender_id = p_player and read_at is null;
  elsif p_player = auth.uid() and is_member(p_campaign) then
    update messages set read_at = now()
      where campaign_id = p_campaign and player_id = p_player and sender_id <> p_player and read_at is null;
  else
    raise exception 'That is not your thread' using errcode = '42501';
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- One row per thread the caller can read (a DM: every player who has one; a player: their own), with the last message
-- and how many of the other side's messages are unread. Row level security applies (security invoker).
create function public.message_threads(p_campaign uuid)
returns table (player_id uuid, last_body text, last_kind text, last_sender uuid, last_at timestamptz, unread integer)
language sql stable security invoker set search_path = public as $$
  select distinct on (m.player_id)
    m.player_id, m.body, m.kind, m.sender_id, m.created_at,
    (select count(*)::int from messages u
      where u.campaign_id = p_campaign and u.player_id = m.player_id and u.read_at is null
        and case when is_dm(p_campaign) then u.sender_id = u.player_id else u.sender_id <> auth.uid() end)
  from messages m
  where m.campaign_id = p_campaign
  order by m.player_id, m.created_at desc, m.id desc
$$;

-- SAFETY -----------------------------------------------------------------------

create table public.safety_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- the order things happened in (two events can share a timestamp)
  seq bigint generated always as identity,
  kind text not null check (kind in ('pause_requested', 'resumed')),
  anonymous boolean not null default false,
  -- who asked; never stored for an anonymous X-card
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint safety_events_anonymous_has_no_user check (not anonymous or user_id is null)
);
create index safety_events_campaign_idx on public.safety_events (campaign_id, seq desc);

-- who asked when, for the five-minute limit. Nobody reads it but request_pause: there is no policy at all.
create table public.safety_rate (
  user_id uuid not null references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  last_request_at timestamptz not null,
  primary key (user_id, campaign_id)
);

alter table public.safety_events enable row level security;
alter table public.safety_rate enable row level security;
revoke all on public.safety_events from anon;
revoke all on public.safety_rate from anon, authenticated;

-- the DM reads the history; everyone else asks get_table_pause. Writes go through the functions only.
create policy "dm reads safety events" on public.safety_events for select to authenticated
  using (is_dm(campaign_id));

-- The table's pause state for a member: whether it is paused, since when, whether by X-card, and (for a DM only, and
-- only when it was not anonymous) who asked.
create function public.get_table_pause(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  e safety_events;
begin
  if not is_member(p_campaign) then
    raise exception 'Only members of this campaign can see that' using errcode = '42501';
  end if;
  select * into e from safety_events where campaign_id = p_campaign order by seq desc limit 1;
  if e.id is null or e.kind = 'resumed' then
    return jsonb_build_object('paused', false, 'since', null, 'anonymous', false, 'name', null);
  end if;
  return jsonb_build_object(
    'paused', true,
    'since', e.created_at,
    'anonymous', e.anonymous,
    'name', case when is_dm(p_campaign) and not e.anonymous
                 then coalesce((select display_name from profiles where id = e.user_id), 'A player') end
  );
end $$;

-- Any member asks for a pause, at most once every five minutes. An anonymous request keeps no trace of who asked
-- that anyone can read, and its live event names no sender.
create function public.request_pause(p_campaign uuid, p_anonymous boolean default false) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me constant uuid := auth.uid();
  last timestamptz;
  who text;
  envelope jsonb;
begin
  if me is null or not is_member(p_campaign) then
    raise exception 'Only members of this campaign can ask for a pause' using errcode = '42501';
  end if;
  select last_request_at into last from safety_rate where user_id = me and campaign_id = p_campaign for update;
  if last is not null and last > now() - interval '5 minutes' then
    raise exception 'You asked for a pause a moment ago. The DM has been told.' using errcode = 'PT429';
  end if;
  insert into safety_rate (user_id, campaign_id, last_request_at) values (me, p_campaign, now())
    on conflict (user_id, campaign_id) do update set last_request_at = excluded.last_request_at;

  insert into safety_events (campaign_id, kind, anonymous, user_id)
    values (p_campaign, 'pause_requested', coalesce(p_anonymous, false),
            case when coalesce(p_anonymous, false) then null else me end);

  if not coalesce(p_anonymous, false) then
    who := coalesce((select display_name from profiles where id = me), 'A player');
  end if;
  -- the sender is "the table" (the nil id), never the person; only the DMs' channel carries a name, and only when open
  envelope := jsonb_build_object(
    'sender', '00000000-0000-0000-0000-000000000000',
    'senderRole', 'player',
    'sentAt', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'data', jsonb_build_object('state', 'requested', 'name', null)
  );
  perform realtime.send(envelope, 'pause', 'campaign:' || p_campaign, true);
  perform realtime.send(jsonb_set(envelope, '{data,name}', coalesce(to_jsonb(who), 'null'::jsonb)), 'pause',
                        'dm:' || p_campaign, true);
end $$;

-- DM only: the table goes on.
create function public.resume_table(p_campaign uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_dm(p_campaign) then
    raise exception 'Only the DM can do that' using errcode = '42501';
  end if;
  insert into safety_events (campaign_id, kind, anonymous, user_id) values (p_campaign, 'resumed', false, auth.uid());
  perform send_realtime_event(p_campaign, 'campaign', 'pause', jsonb_build_object('state', 'resumed', 'name', null));
end $$;

-- FUNCTION PRIVILEGES --------------------------------------------------------

revoke execute on function
  public.messages_before_insert(), public.messages_no_edit(), public.messages_no_delete(), public.messages_announce()
from public, anon, authenticated;
revoke execute on function
  public.send_message(uuid, uuid, text, text, boolean), public.mark_thread_read(uuid, uuid),
  public.message_threads(uuid), public.get_table_pause(uuid), public.request_pause(uuid, boolean),
  public.resume_table(uuid)
from public, anon;
grant execute on function
  public.send_message(uuid, uuid, text, text, boolean), public.mark_thread_read(uuid, uuid),
  public.message_threads(uuid), public.get_table_pause(uuid), public.request_pause(uuid, boolean),
  public.resume_table(uuid)
to authenticated;
