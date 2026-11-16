-- =====================================================================
-- 0030: pings and handouts (P4-4, MAP-11, HND-1).
--
-- PINGS have no table of their own: a ping is a live event sent through send_realtime_event. What is stored here is
-- who may ping:
--   * campaigns.settings.pingsEnabled (on unless false). When off, only DMs can ping.
--   * ping_mutes: the DM silences one player's pings for the session (until muted_until, or until unmuted).
-- send_realtime_event below refuses a ping in either case, so a muted player cannot get round it from the console.
--
-- HANDOUTS are things the DM shows players: an image or a text. A player reads a handout only while a share row for
-- them exists (show_handout writes them, and tells each player on their own channel). Images live in the private
-- bucket "handouts", one folder per campaign; a player reads an image only through a handout shared with them.
-- =====================================================================

-- PINGS ----------------------------------------------------------------------

create table public.ping_mutes (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- "for the session": a mute ends by itself after a long evening, so a forgotten one never lasts for weeks
  muted_until timestamptz not null default now() + interval '12 hours',
  muted_by uuid references auth.users (id) on delete set null default auth.uid(),
  primary key (campaign_id, user_id)
);

alter table public.ping_mutes enable row level security;
revoke all on public.ping_mutes from anon;

-- the DM sees and manages every mute; a player sees only their own, so the app can tell them why Ping is off
create policy "read own or dm mutes" on public.ping_mutes for select to authenticated
  using (user_id = auth.uid() or is_dm(campaign_id));
create policy "dm mutes players" on public.ping_mutes for insert to authenticated
  with check (is_dm(campaign_id) and exists (
    select 1 from members m where m.campaign_id = ping_mutes.campaign_id and m.user_id = ping_mutes.user_id and m.role = 'player'
  ));
create policy "dm changes mutes" on public.ping_mutes for update to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));
create policy "dm unmutes" on public.ping_mutes for delete to authenticated
  using (is_dm(campaign_id));

-- Whether this person may ping the table right now.
create function public.can_ping(p_campaign uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_dm(p_campaign) or (
    is_member(p_campaign)
    and coalesce((select (settings ->> 'pingsEnabled') <> 'false' from campaigns where id = p_campaign), true)
    and not exists (
      select 1 from ping_mutes where campaign_id = p_campaign and user_id = auth.uid() and muted_until > now()
    )
  )
$$;

revoke execute on function public.can_ping(uuid) from public, anon;
grant execute on function public.can_ping(uuid) to authenticated;

-- The same function as in 0026, with one more rule: a ping is refused when the campaign has pings off or the sender is
-- muted.
create or replace function public.send_realtime_event(
  p_campaign uuid,
  p_channel text,
  p_event text,
  p_payload jsonb,
  p_target uuid default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me constant uuid := auth.uid();
  dm boolean;
  topic text;
  envelope jsonb;
begin
  if me is null or not is_member(p_campaign) then
    raise exception 'Only members of this campaign can send to it' using errcode = '42501';
  end if;
  dm := is_dm(p_campaign);

  if p_event is null or p_event not in ('reveal', 'ping', 'dialogue', 'check_offer', 'handout', 'message', 'pause',
                                        'spotlight', 'turn', 'toast', 'fog_stroke', 'group_moved') then
    raise exception 'Unknown event' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 16384 then
    raise exception 'The payload must be an object of at most 16 KB' using errcode = '22023';
  end if;
  if p_event = 'ping' and not can_ping(p_campaign) then
    raise exception 'Pings are off for you in this campaign' using errcode = '42501';
  end if;

  if p_channel = 'campaign' and p_target is null then
    if not dm and p_event <> 'ping' then
      raise exception 'Only a DM can send that' using errcode = '42501';
    end if;
    topic := 'campaign:' || p_campaign;
  elsif p_channel = 'dm' and p_target is null then
    if not dm then
      raise exception 'Only a DM can send that' using errcode = '42501';
    end if;
    topic := 'dm:' || p_campaign;
  elsif p_channel = 'user' and p_target is not null then
    if not dm and (p_target <> me or p_event <> 'message') then
      raise exception 'Only a DM can send that' using errcode = '42501';
    end if;
    topic := 'user:' || p_campaign || ':' || p_target;
  else
    raise exception 'Unknown channel' using errcode = '22023';
  end if;

  envelope := jsonb_build_object(
    'sender', me,
    'senderRole', case when dm then 'dm' else 'player' end,
    'sentAt', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'data', p_payload
  );
  perform realtime.send(envelope, p_event, topic, true);
  return envelope;
end $$;

-- HANDOUTS -------------------------------------------------------------------

create table public.handouts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  kind text not null check (kind in ('image', 'text')),
  -- shown as plain text with its line breaks, never as HTML; an image handout may carry a caption here
  body text check (char_length(body) <= 8000),
  -- "<campaign id>/<file>" in the handouts bucket
  image_path text check (char_length(image_path) <= 300),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint handouts_shape check (
    (kind = 'text' and image_path is null and body is not null and char_length(btrim(body)) > 0)
    or (kind = 'image' and image_path is not null)
  ),
  -- an image must sit in this campaign's own folder, so a handout cannot lend out another campaign's file
  constraint handouts_image_folder check (image_path is null or folder_campaign(image_path) = campaign_id)
);
create index handouts_campaign_idx on public.handouts (campaign_id, created_at);

create table public.handout_shares (
  handout_id uuid not null references public.handouts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  shared_at timestamptz not null default now(),
  -- null until the player opens it: the "new" marker
  seen_at timestamptz,
  primary key (handout_id, user_id)
);
create index handout_shares_user_idx on public.handout_shares (user_id);

-- who made a handout and where it belongs never change
create function public.handouts_keep_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.campaign_id := old.campaign_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
create trigger handouts_keep_owner before insert or update on public.handouts
  for each row execute function public.handouts_keep_owner();

create function public.handout_campaign(h uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select campaign_id from handouts where id = h
$$;

-- shown to this person (and they are still in the campaign)
create function public.handout_shared_with_me(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from handout_shares s join handouts ho on ho.id = s.handout_id
    where s.handout_id = h and s.user_id = auth.uid() and is_member(ho.campaign_id)
  )
$$;

alter table public.handouts enable row level security;
alter table public.handout_shares enable row level security;
revoke all on public.handouts, public.handout_shares from anon;

create policy "dm manages handouts" on public.handouts for all to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));
create policy "players read handouts shown to them" on public.handouts for select to authenticated
  using (handout_shared_with_me(id));

-- Shares are written by show_handout and mark_handout_seen; the DM may take one back by deleting it.
create policy "read own shares or dm" on public.handout_shares for select to authenticated
  using (user_id = auth.uid() or is_dm(handout_campaign(handout_id)));
create policy "dm takes back a share" on public.handout_shares for delete to authenticated
  using (is_dm(handout_campaign(handout_id)));

-- DM only: shows a handout to everyone, to one party group's players, or to chosen players. Each gets a share row
-- (showing it again marks it new again) and a 'handout' event on their own channel. Returns who it was shown to.
create function public.show_handout(
  p_handout uuid,
  p_audience text,
  p_group uuid default null,
  p_users uuid[] default null
) returns uuid[]
language plpgsql volatile security definer set search_path = public as $$
declare
  c uuid := handout_campaign(p_handout);
  audience uuid[];
  u uuid;
begin
  if c is null or not is_dm(c) then
    raise exception 'Only the DM can do that' using errcode = '42501';
  end if;

  if p_audience = 'everyone' then
    select coalesce(array_agg(m.user_id order by m.joined_at), '{}') into audience
      from members m where m.campaign_id = c and m.role = 'player';
  elsif p_audience = 'group' then
    if p_group is null or group_campaign(p_group) is distinct from c then
      raise exception 'That group is not in this campaign' using errcode = '22023';
    end if;
    select coalesce(array_agg(distinct ch.owner_id), '{}') into audience
      from party_group_members pm
      join characters ch on ch.id = pm.character_id
      join members m on m.campaign_id = c and m.user_id = ch.owner_id and m.role = 'player'
      where pm.group_id = p_group;
  elsif p_audience = 'players' then
    if p_users is null or cardinality(p_users) = 0 or cardinality(p_users) > 100 then
      raise exception 'Choose who to show it to' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(p_users) x(id)
      where not exists (select 1 from members m where m.campaign_id = c and m.user_id = x.id and m.role = 'player')
    ) then
      raise exception 'Handouts can only be shown to players of this campaign' using errcode = '22023';
    end if;
    select array_agg(distinct x) into audience from unnest(p_users) x;
  else
    raise exception 'Everyone, a group or chosen players' using errcode = '22023';
  end if;

  if cardinality(audience) = 0 then
    raise exception 'There is nobody to show it to' using errcode = '22023';
  end if;

  insert into handout_shares (handout_id, user_id)
    select p_handout, x from unnest(audience) x
    on conflict (handout_id, user_id) do update set shared_at = now(), seen_at = null;

  foreach u in array audience loop
    perform send_realtime_event(c, 'user', 'handout', jsonb_build_object('handoutId', p_handout), u);
  end loop;
  return audience;
end $$;

-- A player marks a handout shown to them as opened (the "new" marker goes). Returns false if it was not shown to them.
create function public.mark_handout_seen(p_handout uuid) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  update handout_shares set seen_at = coalesce(seen_at, now())
    where handout_id = p_handout and user_id = auth.uid();
  return found;
end $$;

-- STORAGE: the private "handouts" bucket, one folder per campaign -------------

-- the bucket itself refuses anything but PNG, JPG and WebP of at most 10 MB, whatever the app sends
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('handouts', 'handouts', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- A handout image is readable by a player exactly when a handout using it was shown to them.
create function public.can_read_handout_image(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from handouts h
    where h.image_path = object_name and h.campaign_id = folder_campaign(object_name) and handout_shared_with_me(h.id)
  )
$$;

create policy "handouts: DMs or players it was shown to read" on storage.objects for select to authenticated
  using (bucket_id = 'handouts' and (is_dm(folder_campaign(name)) or can_read_handout_image(name)));
create policy "handouts: DMs upload into their campaign folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'handouts' and is_dm(folder_campaign(name)));
create policy "handouts: DMs update files in their campaign folder" on storage.objects for update to authenticated
  using (bucket_id = 'handouts' and is_dm(folder_campaign(name)))
  with check (bucket_id = 'handouts' and is_dm(folder_campaign(name)));
create policy "handouts: DMs delete files in their campaign folder" on storage.objects for delete to authenticated
  using (bucket_id = 'handouts' and is_dm(folder_campaign(name)));

-- FUNCTION PRIVILEGES --------------------------------------------------------

revoke execute on function
  public.handout_campaign(uuid), public.handout_shared_with_me(uuid), public.can_read_handout_image(text),
  public.show_handout(uuid, text, uuid, uuid[]), public.mark_handout_seen(uuid), public.handouts_keep_owner()
from public, anon;
grant execute on function
  public.handout_campaign(uuid), public.handout_shared_with_me(uuid), public.can_read_handout_image(text),
  public.show_handout(uuid, text, uuid, uuid[]), public.mark_handout_seen(uuid)
to authenticated;
