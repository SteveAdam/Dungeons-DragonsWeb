-- =====================================================================
-- 0032: the NPC dialogue tool (P4-6, DLG-1 to DLG-5, DIC-5, CHK-4).
--
--   * npc_profiles: an NPC entity's disposition and where it is. DM only: players learn the name and disposition from
--     the line itself when the DM says one to their group.
--   * dialogue_lines: the DM's prepared lines, each with a tag, an optional condition (evaluated in the app, see
--     evaluateCondition in packages/rules-engine) and response options. DM only.
--   * dialogue_log: what was actually said, to which groups. Append-only. A player reads a row only when their group
--     is among its groups. A line the DM never says is never written anywhere a player can reach.
--   * check_requests / check_answers: a check the DM offers to characters. The roll Edge Function takes the DC, the
--     mode and the reason from the request (never from the client) and allows one answer per character.
--     Players never read check_requests directly: my_check_requests gives them their own, and leaves out the DC when
--     the DM hid the odds. The same goes for the options stored in the log and sent live.
--
-- say_line and offer_check (DM only) tell exactly the targeted players, each on their own channel.
-- A player's choice of a "say" option goes to the DMs' channel as a 'dialogue_choice' event.
-- =====================================================================

-- NPC PROFILES -------------------------------------------------------------------

create table public.npc_profiles (
  entity_id uuid primary key references public.entities (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  disposition text not null default 'indifferent' check (disposition in ('friendly', 'indifferent', 'hostile')),
  location_pin_id uuid references public.pins (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- the entity is an NPC, and the campaign is always the entity's
create function public.npc_profiles_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select campaign_id into new.campaign_id from entities where id = new.entity_id and type = 'npc';
  if new.campaign_id is null then
    raise exception 'Only an NPC has a dialogue profile' using errcode = '22023';
  end if;
  if new.location_pin_id is not null and pin_campaign(new.location_pin_id) is distinct from new.campaign_id then
    raise exception 'That pin is not in this campaign' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger npc_profiles_check before insert or update on public.npc_profiles
  for each row execute function public.npc_profiles_check();

alter table public.npc_profiles enable row level security;
revoke all on public.npc_profiles from anon;
create policy "dm manages npc profiles" on public.npc_profiles for all to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));

-- RESPONSE OPTIONS ---------------------------------------------------------------

create function public.dialogue_check_key_valid(k text) returns boolean
language sql immutable set search_path = public as $$
  select k in ('str', 'dex', 'con', 'int', 'wis', 'cha',
               'acrobatics', 'animalHandling', 'arcana', 'athletics', 'deception', 'history', 'insight',
               'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion',
               'religion', 'sleightOfHand', 'stealth', 'survival')
$$;

-- A line's options: at most 6 of { label, kind: say | check | end, check?: { skill, dc, showOdds } }.
create function public.dialogue_options_valid(p jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) <= 6
     and not exists (
       select 1 from jsonb_array_elements(p) o
       where jsonb_typeof(o) <> 'object'
          or jsonb_typeof(o -> 'label') <> 'string'
          or char_length(btrim(o ->> 'label')) not between 1 and 120
          or coalesce(o ->> 'kind', '') not in ('say', 'check', 'end')
          or (o ->> 'kind' = 'check' and (
                jsonb_typeof(o -> 'check') <> 'object'
                or not dialogue_check_key_valid(o -> 'check' ->> 'skill')
                or jsonb_typeof(o -> 'check' -> 'dc') <> 'number'
                or (o -> 'check' ->> 'dc')::numeric not between 1 and 30
                or (o -> 'check' ->> 'dc')::numeric <> round((o -> 'check' ->> 'dc')::numeric)
                or jsonb_typeof(o -> 'check' -> 'showOdds') <> 'boolean'))
          or (o ->> 'kind' <> 'check' and o ? 'check')
     )
$$;

-- PREPARED LINES -----------------------------------------------------------------

create table public.dialogue_lines (
  id uuid primary key default gen_random_uuid(),
  npc_entity_id uuid not null references public.entities (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 2000),
  tag text not null default '' check (char_length(tag) <= 40),
  -- see evaluateCondition: { type: always | has_item | in_region | level_at_least | is_party_member, ... }
  condition jsonb check (condition is null or jsonb_typeof(condition) = 'object'),
  options jsonb not null default '[]' check (dialogue_options_valid(options)),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index dialogue_lines_npc_idx on public.dialogue_lines (npc_entity_id, sort_order, created_at);

create function public.dialogue_lines_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select campaign_id into new.campaign_id from entities where id = new.npc_entity_id and type = 'npc';
  if new.campaign_id is null then
    raise exception 'Prepared lines belong to an NPC' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger dialogue_lines_check before insert or update on public.dialogue_lines
  for each row execute function public.dialogue_lines_check();

alter table public.dialogue_lines enable row level security;
revoke all on public.dialogue_lines from anon;
create policy "dm manages dialogue lines" on public.dialogue_lines for all to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));

-- THE LOG ------------------------------------------------------------------------

create table public.dialogue_log (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  npc_entity_id uuid not null references public.entities (id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 2000),
  -- the options as the players were shown them (a hidden DC is not kept)
  options jsonb not null default '[]',
  group_ids uuid[] not null check (cardinality(group_ids) between 1 and 20),
  said_at timestamptz not null default now(),
  said_by uuid references auth.users (id) on delete set null
);
create index dialogue_log_campaign_idx on public.dialogue_log (campaign_id, said_at desc);
create index dialogue_log_npc_idx on public.dialogue_log (npc_entity_id, said_at desc);

create function public.dialogue_log_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old; -- the campaign or the NPC is being deleted
  end if;
  raise exception 'The dialogue log cannot be changed' using errcode = '42501';
end $$;
create trigger dialogue_log_append_only before update or delete on public.dialogue_log
  for each row execute function public.dialogue_log_append_only();

alter table public.dialogue_log enable row level security;
revoke all on public.dialogue_log from anon;
create policy "read dialogue heard by your group" on public.dialogue_log for select to authenticated
  using (is_dm(campaign_id) or (is_member(campaign_id) and exists (select 1 from unnest(group_ids) g where in_group(g))));

-- CHECK REQUESTS -----------------------------------------------------------------

create table public.check_requests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  character_ids uuid[] not null check (cardinality(character_ids) between 1 and 20),
  skill_or_ability text not null check (dialogue_check_key_valid(skill_or_ability)),
  kind text not null default 'check' check (kind in ('check', 'save')),
  dc int not null check (dc between 1 and 30),
  mode text not null default 'normal' check (mode in ('normal', 'advantage', 'disadvantage')),
  reason text check (char_length(reason) <= 200),
  show_odds boolean not null default true,
  prompt text not null check (char_length(btrim(prompt)) between 1 and 200),
  status text not null default 'open' check (status in ('open', 'closed')),
  -- the NPC who asked, when it came from dialogue
  npc_entity_id uuid references public.entities (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- a save is made with an ability; a mode other than normal says why
  constraint check_requests_save_ability check (kind = 'check' or skill_or_ability in ('str', 'dex', 'con', 'int', 'wis', 'cha')),
  constraint check_requests_mode_reason check (mode = 'normal' or char_length(btrim(coalesce(reason, ''))) > 0)
);
create index check_requests_campaign_idx on public.check_requests (campaign_id, created_at desc);

create table public.check_answers (
  request_id uuid not null references public.check_requests (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  roll_id uuid not null references public.rolls (id) on delete cascade,
  answered_at timestamptz not null default now(),
  primary key (request_id, character_id)
);

alter table public.check_requests enable row level security;
alter table public.check_answers enable row level security;
revoke all on public.check_requests, public.check_answers from anon;
-- the DM reads (and closes) requests; players use my_check_requests, which hides a DC the DM did not show
create policy "dm reads check requests" on public.check_requests for select to authenticated
  using (is_dm(campaign_id));
create policy "dm closes check requests" on public.check_requests for update to authenticated
  using (is_dm(campaign_id)) with check (is_dm(campaign_id));
create policy "read answers: dm or your own characters" on public.check_answers for select to authenticated
  using (
    exists (select 1 from check_requests r where r.id = request_id and is_dm(r.campaign_id))
    or exists (select 1 from characters c where c.id = character_id and c.owner_id = auth.uid())
  );

-- a request's settings never change once offered; the DM only closes it
create function public.check_requests_only_close() returns trigger
language plpgsql set search_path = public as $$
begin
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'A check request can only be closed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger check_requests_only_close before update on public.check_requests
  for each row execute function public.check_requests_only_close();

-- The signed-in player's requests in a campaign: those that include one of their characters, with the DC left out
-- when the DM hid the odds, and which of their characters have answered.
create function public.my_check_requests(p_campaign uuid, p_open_only boolean default true)
returns table (
  id uuid, character_ids uuid[], skill_or_ability text, kind text, dc int, mode text, reason text,
  show_odds boolean, prompt text, status text, npc_entity_id uuid, created_at timestamptz, answered uuid[]
)
language sql stable security definer set search_path = public as $$
  select r.id,
         array(select c from unnest(r.character_ids) c
               where exists (select 1 from characters ch where ch.id = c and ch.owner_id = auth.uid())),
         r.skill_or_ability, r.kind,
         case when r.show_odds then r.dc end,
         r.mode, r.reason, r.show_odds, r.prompt, r.status, r.npc_entity_id, r.created_at,
         array(select a.character_id from check_answers a where a.request_id = r.id
               and exists (select 1 from characters ch where ch.id = a.character_id and ch.owner_id = auth.uid()))
  from check_requests r
  where r.campaign_id = p_campaign
    and is_member(p_campaign)
    and (not p_open_only or r.status = 'open')
    and exists (select 1 from characters ch where ch.id = any (r.character_ids) and ch.owner_id = auth.uid())
  order by r.created_at desc
  limit 50
$$;

-- Service role only (the roll Edge Function): one answer per character, through roll_d20, linked to the request.
create function public.roll_for_request(
  p_actor uuid, p_request uuid, p_character uuid, p_label text, p_bonus int, p_mode text, p_breakdown jsonb
) returns public.rolls
language plpgsql volatile security definer set search_path = public as $$
declare
  r check_requests;
  result rolls;
begin
  select * into r from check_requests where id = p_request for update;
  if r.id is null then
    raise exception 'There is no such check' using errcode = 'P0002';
  end if;
  if r.status <> 'open' then
    raise exception 'The DM has closed this check' using errcode = '22023';
  end if;
  if not p_character = any (r.character_ids) then
    raise exception 'This check was not offered to that character' using errcode = '42501';
  end if;
  if exists (select 1 from check_answers where request_id = p_request and character_id = p_character) then
    raise exception 'That character has already answered this check' using errcode = '23505';
  end if;
  result := roll_d20(p_actor, r.campaign_id, p_character, r.kind, p_label, p_bonus, r.dc, p_mode, false, p_breakdown);
  insert into check_answers (request_id, character_id, roll_id) values (p_request, p_character, result.id);
  return result;
end $$;

-- tells each user on their own channel
create function public.notify_users(p_campaign uuid, p_users uuid[], p_event text, p_payload jsonb) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  u uuid;
begin
  foreach u in array coalesce(p_users, '{}') loop
    perform send_realtime_event(p_campaign, 'user', p_event, p_payload, u);
  end loop;
end $$;

-- the player members who own a character in any of these groups
create function public.group_players(p_campaign uuid, p_groups uuid[]) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct ch.owner_id), '{}')
  from party_group_members pm
  join characters ch on ch.id = pm.character_id
  join members m on m.campaign_id = p_campaign and m.user_id = ch.owner_id and m.role = 'player'
  where pm.group_id = any (p_groups)
$$;

-- DM only: offers a check to characters. Returns the request's id.
create function public.offer_check(
  p_campaign uuid,
  p_character_ids uuid[],
  p_key text,
  p_kind text,
  p_dc int,
  p_mode text,
  p_reason text,
  p_show_odds boolean,
  p_prompt text,
  p_npc uuid default null
) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  new_id uuid;
  owners uuid[];
begin
  if not is_dm(p_campaign) then
    raise exception 'Only the DM can do that' using errcode = '42501';
  end if;
  if p_character_ids is null or cardinality(p_character_ids) = 0 or exists (
    select 1 from unnest(p_character_ids) c where not exists (select 1 from characters where id = c and campaign_id = p_campaign)
  ) then
    raise exception 'Choose characters of this campaign' using errcode = '22023';
  end if;
  if p_npc is not null and entity_campaign(p_npc) is distinct from p_campaign then
    raise exception 'That NPC is not in this campaign' using errcode = '22023';
  end if;
  insert into check_requests (campaign_id, character_ids, skill_or_ability, kind, dc, mode, reason, show_odds, prompt,
                              npc_entity_id, created_by)
    values (p_campaign, (select array_agg(distinct c) from unnest(p_character_ids) c), p_key, coalesce(p_kind, 'check'),
            p_dc, coalesce(p_mode, 'normal'), nullif(btrim(coalesce(p_reason, '')), ''), coalesce(p_show_odds, true),
            p_prompt, p_npc, auth.uid())
    returning id into new_id;
  select coalesce(array_agg(distinct owner_id), '{}') into owners from characters where id = any (p_character_ids);
  perform notify_users(p_campaign, owners, 'check_offer', jsonb_build_object('requestId', new_id));
  return new_id;
end $$;

-- DM only: no more answers.
create function public.close_check(p_request uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  c uuid := (select campaign_id from check_requests where id = p_request);
begin
  if c is null or not is_dm(c) then
    raise exception 'Only the DM can do that' using errcode = '42501';
  end if;
  update check_requests set status = 'closed' where id = p_request;
end $$;

-- DM only: an NPC says a line to one or more groups. Check options become check requests for the characters in those
-- groups. The line may be kept among the NPC's prepared lines and in the log. Each player in the groups is told on
-- their own channel. Returns { lineKey, logId, lineId, requestIds }.
create function public.say_line(
  p_npc uuid,
  p_text text,
  p_options jsonb,
  p_group_ids uuid[],
  p_save_to_npc boolean default false,
  p_save_to_log boolean default true
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c uuid := entity_campaign(p_npc);
  npc entities;
  disposition text;
  line_key uuid := gen_random_uuid();
  characters_heard uuid[];
  shown jsonb := '[]';
  o jsonb;
  request uuid;
  request_ids uuid[] := '{}';
  log_id uuid;
  line_id uuid;
begin
  if c is null or not is_dm(c) then
    raise exception 'Only the DM can do that' using errcode = '42501';
  end if;
  select * into npc from entities where id = p_npc;
  if npc.type <> 'npc' then
    raise exception 'Only an NPC speaks here' using errcode = '22023';
  end if;
  if p_text is null or char_length(btrim(p_text)) not between 1 and 2000 then
    raise exception 'A line has 1 to 2,000 characters' using errcode = '22023';
  end if;
  if not dialogue_options_valid(coalesce(p_options, '[]')) then
    raise exception 'The response options are not valid' using errcode = '22023';
  end if;
  if p_group_ids is null or cardinality(p_group_ids) = 0 or exists (
    select 1 from unnest(p_group_ids) g where group_campaign(g) is distinct from c
  ) then
    raise exception 'Choose groups of this campaign' using errcode = '22023';
  end if;
  disposition := coalesce((select np.disposition from npc_profiles np where np.entity_id = p_npc), 'indifferent');

  select coalesce(array_agg(distinct pm.character_id), '{}') into characters_heard
    from party_group_members pm where pm.group_id = any (p_group_ids);

  -- the options as players see them: a check option becomes a request, and a hidden DC is left out
  for o in select value from jsonb_array_elements(coalesce(p_options, '[]')) loop
    if o ->> 'kind' = 'check' and cardinality(characters_heard) > 0 then
      insert into check_requests (campaign_id, character_ids, skill_or_ability, kind, dc, show_odds, prompt,
                                  npc_entity_id, created_by)
        values (c, characters_heard, o -> 'check' ->> 'skill', 'check', (o -> 'check' ->> 'dc')::int,
                (o -> 'check' ->> 'showOdds')::boolean, btrim(o ->> 'label'), p_npc, auth.uid())
        returning id into request;
      request_ids := request_ids || request;
      shown := shown || jsonb_build_array(jsonb_build_object(
        'label', btrim(o ->> 'label'), 'kind', 'check', 'requestId', request,
        'check', jsonb_strip_nulls(jsonb_build_object(
          'skill', o -> 'check' ->> 'skill',
          'dc', case when (o -> 'check' ->> 'showOdds')::boolean then (o -> 'check' -> 'dc') end,
          'showOdds', o -> 'check' -> 'showOdds'))));
    elsif o ->> 'kind' <> 'check' then
      shown := shown || jsonb_build_array(jsonb_build_object('label', btrim(o ->> 'label'), 'kind', o ->> 'kind'));
    end if;
  end loop;

  if coalesce(p_save_to_npc, false) then
    insert into dialogue_lines (npc_entity_id, campaign_id, text, options, sort_order)
      values (p_npc, c, btrim(p_text), coalesce(p_options, '[]'),
              coalesce((select max(sort_order) + 1 from dialogue_lines where npc_entity_id = p_npc), 0))
      returning id into line_id;
  end if;
  if coalesce(p_save_to_log, true) then
    insert into dialogue_log (campaign_id, npc_entity_id, text, options, group_ids, said_by)
      values (c, p_npc, btrim(p_text), shown, (select array_agg(distinct g) from unnest(p_group_ids) g), auth.uid())
      returning id into log_id;
  end if;

  perform notify_users(c, group_players(c, p_group_ids), 'dialogue', jsonb_build_object(
    'npcId', p_npc, 'lineKey', line_key, 'logId', log_id, 'speaker', npc.name, 'disposition', disposition,
    'text', btrim(p_text), 'options', shown));

  return jsonb_build_object('lineKey', line_key, 'logId', log_id, 'lineId', line_id, 'requestIds', to_jsonb(request_ids));
end $$;

-- REALTIME: one more event. A player may send 'dialogue_choice' to the DMs' channel (what they chose to say); the
-- rest is as in 0030.
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
                                        'spotlight', 'turn', 'toast', 'fog_stroke', 'group_moved',
                                        'dialogue_choice') then
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
    if not dm and p_event <> 'dialogue_choice' then
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

-- FUNCTION PRIVILEGES --------------------------------------------------------

revoke execute on function
  public.npc_profiles_check(), public.dialogue_lines_check(), public.dialogue_log_append_only(),
  public.check_requests_only_close(), public.roll_for_request(uuid, uuid, uuid, text, int, text, jsonb),
  public.notify_users(uuid, uuid[], text, jsonb), public.group_players(uuid, uuid[])
from public, anon, authenticated;
grant execute on function public.roll_for_request(uuid, uuid, uuid, text, int, text, jsonb) to service_role;
revoke execute on function
  public.my_check_requests(uuid, boolean), public.offer_check(uuid, uuid[], text, text, int, text, text, boolean, text, uuid),
  public.close_check(uuid), public.say_line(uuid, text, jsonb, uuid[], boolean, boolean)
from public, anon;
grant execute on function
  public.my_check_requests(uuid, boolean), public.offer_check(uuid, uuid[], text, text, int, text, text, boolean, text, uuid),
  public.close_check(uuid), public.say_line(uuid, text, jsonb, uuid[], boolean, boolean)
to authenticated;
