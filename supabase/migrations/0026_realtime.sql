-- P4-1: who may use which Realtime channel.
--
--   campaign:<campaign>         members and DMs listen, and publish their presence here
--   dm:<campaign>               DMs only
--   user:<campaign>:<user>      that user and the campaign's DMs
--   rolls:<campaign>, clock:<campaign>, discoveries:<group>
--                               the existing row feeds; the rows themselves stay behind their own policies
--
-- A broadcast carries no authenticated sender, and these policies work per topic, so they cannot tell one event type
-- from another. Clients are therefore never allowed to broadcast: send_realtime_event below checks the caller's role
-- for that event and stamps who sent it. Presence is still published by the client, so it is display-only and nothing
-- may grant access because of it.
--
-- Realtime works these out when a client joins and keeps the answer for the life of that connection.

create function public.realtime_can_read(p_topic text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  id_pattern constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  parts text[] := string_to_array(p_topic, ':');
begin
  if auth.uid() is null or p_topic is null then
    return false;
  end if;
  if p_topic ~ ('^(campaign|rolls|clock):' || id_pattern || '$') then
    return is_member(parts[2]::uuid);
  elsif p_topic ~ ('^dm:' || id_pattern || '$') then
    return is_dm(parts[2]::uuid);
  elsif p_topic ~ ('^user:' || id_pattern || ':' || id_pattern || '$') then
    return is_dm(parts[2]::uuid) or (parts[3]::uuid = auth.uid() and is_member(parts[2]::uuid));
  elsif p_topic ~ ('^discoveries:' || id_pattern || '$') then
    return exists (select 1 from party_groups g where g.id = parts[2]::uuid and is_member(g.campaign_id));
  end if;
  return false;
end $$;

-- only the campaign channel carries presence
create function public.realtime_can_track(p_topic text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return p_topic like 'campaign:%' and realtime_can_read(p_topic);
end $$;

revoke execute on function public.realtime_can_read(text) from public, anon;
revoke execute on function public.realtime_can_track(text) from public, anon;
grant execute on function public.realtime_can_read(text) to authenticated;
grant execute on function public.realtime_can_track(text) to authenticated;

create policy "listen on allowed topics" on realtime.messages for select to authenticated
  using (public.realtime_can_read((select realtime.topic())));

create policy "publish presence only" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'presence' and public.realtime_can_track((select realtime.topic())));

-- Every live event goes through here. A player may ping the table and write on their own channel; the rest is the DM's.
-- Returns what was sent.
create function public.send_realtime_event(
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

revoke execute on function public.send_realtime_event(uuid, text, text, jsonb, uuid) from public, anon;
grant execute on function public.send_realtime_event(uuid, text, text, jsonb, uuid) to authenticated;
