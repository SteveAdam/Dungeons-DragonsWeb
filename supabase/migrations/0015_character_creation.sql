-- =====================================================================
-- 0015 (ticket P2-9): the character creation wizard.
--
--   * Ability scores can be rolled (4d6, drop the lowest, six times) with roll_ability_scores: the server rolls, the
--     roll goes in the roll log as an 'ability_roll' (rate limited like every roll), and a player cannot roll again
--     in a campaign while an earlier ability roll there is still unused, so refreshing the wizard cannot re-roll.
--     A character uses the roll it was made from (ability_roll_uses).
--   * character_drafts keeps each player's wizard progress, one per campaign, so a refresh picks up where they were.
--   * create_character_from_wizard writes the character, its 'player' entity, starting items and coins in one
--     transaction (the wallet and the Party membership follow from 0012's triggers). Only the service role calls it:
--     the create-character Edge Function checks every choice against the SRD and builds the sheet first.
-- =====================================================================

-- ABILITY ROLLS IN THE ROLL LOG -----------------------------------------------------

alter table public.rolls drop constraint rolls_kind_check;
alter table public.rolls add constraint rolls_kind_check
  check (kind in ('check', 'save', 'attack', 'damage', 'initiative', 'death_save', 'other', 'ability_roll'));
-- an ability roll is 24 d6 (six sets of four); every other roll is one or two d20s
alter table public.rolls drop constraint rolls_check;
alter table public.rolls add constraint rolls_dice_check check (
  case when kind = 'ability_roll'
    then cardinality(dice) = 24 and 1 <= all (dice) and 6 >= all (dice)
    else cardinality(dice) = case when mode = 'normal' then 1 else 2 end and 1 <= all (dice) and 20 >= all (dice)
  end
);
-- for an ability roll, kept is the highest of the six totals (3 to 18)
alter table public.rolls drop constraint rolls_kept_check;
alter table public.rolls add constraint rolls_kept_check check (kept between 1 and 20);

-- One fair die of any size up to 240 faces, by the same rejection sampling as d20().
create function public.roll_die(sides int) returns int
language plpgsql volatile set search_path = public, extensions as $$
declare
  b int;
  top int := 240 - 240 % sides;
begin
  if sides < 2 or sides > 240 then
    raise exception 'A die has 2 to 240 sides' using errcode = '22023';
  end if;
  loop
    b := get_byte(extensions.gen_random_bytes(1), 0);
    if b < top then
      return b % sides + 1;
    end if;
  end loop;
end $$;

-- count dice of the given size.
create function public.roll_pool(count int, sides int) returns int[]
language sql volatile set search_path = public as $$
  select array_agg(roll_die(sides)) from generate_series(1, count)
$$;

-- no foreign key to rolls: the roll log stays a table nothing points at, so it can never be truncated
create table public.ability_roll_uses (
  roll_id uuid primary key,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  character_id uuid references public.characters (id) on delete set null,
  used_at timestamptz not null default now()
);
alter table public.ability_roll_uses enable row level security;
-- written only by create_character_from_wizard; nobody reads it through the API

-- The player's ability roll in this campaign that no character has used yet, if any.
create function public.unused_ability_roll(p_user uuid, p_campaign uuid) returns public.rolls
language sql stable security definer set search_path = public as $$
  select r.* from rolls r
  where r.rolled_by = p_user and r.campaign_id = p_campaign and r.kind = 'ability_roll'
    and not exists (select 1 from ability_roll_uses u where u.roll_id = r.id)
  order by r.created_at desc
  limit 1
$$;

-- A member rolls their ability scores. The sets are in dice (four per set); kept is the best set and total the
-- sum of the six totals.
create function public.roll_ability_scores(p_campaign uuid) returns public.rolls
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  dice int[];
  totals int[];
  result rolls;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not is_member(p_campaign) then
    raise exception 'Only members of this campaign can roll here' using errcode = '42501';
  end if;
  if (unused_ability_roll(me, p_campaign)).id is not null then
    raise exception 'You have already rolled ability scores for a character here: use those first'
      using errcode = '22023';
  end if;
  if (select count(*) from rolls where rolled_by = me and created_at > now() - interval '60 seconds') >= 30 then
    raise exception 'Too many rolls in the last minute. Wait a moment and roll again.' using errcode = 'PT429';
  end if;
  dice := roll_pool(24, 6);
  select array_agg(s.total order by s.n) into totals from (
    select n, (select sum(d) - min(d) from unnest(dice[n * 4 + 1 : n * 4 + 4]) d) as total
    from generate_series(0, 5) n
  ) s;
  insert into rolls (campaign_id, rolled_by, kind, label, bonus, mode, dice, kept, total)
  values (p_campaign, me, 'ability_roll', 'Ability scores (4d6, drop the lowest)', 0, 'normal', dice,
          (select max(t) from unnest(totals) t), (select sum(t) from unnest(totals) t))
  returning * into result;
  return result;
end $$;

-- WIZARD DRAFTS --------------------------------------------------------------------------

create table public.character_drafts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 100000),
  updated_at timestamptz not null default now(),
  primary key (user_id, campaign_id)
);
alter table public.character_drafts enable row level security;
create policy "own drafts" on public.character_drafts for all to authenticated
  using (user_id = auth.uid() and is_member(campaign_id))
  with check (user_id = auth.uid() and is_member(campaign_id));

-- CREATING THE CHARACTER ----------------------------------------------------------------------

-- For the create-character Edge Function (service role) only, after it has checked every choice. p_items is a
-- list of { name, kind, definition, weight, quantity, value_cp, srd_ref, equipped }. Returns the character's id.
create function public.create_character_from_wizard(
  p_actor uuid, p_campaign uuid, p_name text, p_sheet jsonb, p_items jsonb, p_gp int, p_roll uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  ch uuid;
  e uuid;
  it jsonb;
  unused rolls;
begin
  if p_actor is null or not exists (select 1 from members where campaign_id = p_campaign and user_id = p_actor) then
    raise exception 'Only members of this campaign can create a character here' using errcode = '42501';
  end if;
  if p_roll is not null then
    unused := unused_ability_roll(p_actor, p_campaign);
    if unused.id is distinct from p_roll then
      raise exception 'Those ability scores do not come from your unused ability roll' using errcode = '22023';
    end if;
  end if;

  insert into entities (campaign_id, type, name, visible_to_players)
  values (p_campaign, 'player', free_entity_name(p_campaign, p_name), true)
  returning id into e;
  insert into characters (campaign_id, owner_id, name, sheet, xp, level_applied, entity_id)
  values (p_campaign, p_actor, btrim(p_name), p_sheet - 'name' - 'xp' - 'levelApplied', 0, 1, e)
  returning id into ch;
  if p_roll is not null then
    insert into ability_roll_uses (roll_id, campaign_id, character_id) values (p_roll, p_campaign, ch);
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    insert into entities (campaign_id, type, name) values (p_campaign, 'item', free_entity_name(p_campaign, it ->> 'name'))
    returning id into e;
    insert into items (entity_id, campaign_id, srd_ref, kind, definition, weight, value_cp, quantity, owner_type,
                       owner_id, equipped)
    values (e, p_campaign, it ->> 'srd_ref', it ->> 'kind', coalesce(it -> 'definition', '{}'),
            (it ->> 'weight')::numeric, coalesce((it ->> 'value_cp')::int, 0), coalesce((it ->> 'quantity')::int, 1),
            'character', ch, coalesce((it ->> 'equipped')::boolean, false));
    insert into item_transfers (campaign_id, item_id, item_name, from_type, from_id, from_name, to_type, to_id,
                                to_name, quantity, status, created_by, resolved_at)
    values (p_campaign, e, (select name from entities where id = e), 'world', null, 'Starting equipment',
            'character', ch, btrim(p_name), coalesce((it ->> 'quantity')::int, 1), 'accepted', p_actor, now());
  end loop;

  if coalesce(p_gp, 0) > 0 then
    perform move_coins('character', ch, 0, 0, p_gp, 0, 1, 'other', 'Starting gold');
  end if;
  delete from character_drafts where user_id = p_actor and campaign_id = p_campaign;
  return ch;
end $$;

revoke execute on function
  public.roll_die(int), public.roll_pool(int, int), public.unused_ability_roll(uuid, uuid),
  public.roll_ability_scores(uuid), public.create_character_from_wizard(uuid, uuid, text, jsonb, jsonb, int, uuid)
from public, anon, authenticated;
grant execute on function public.roll_ability_scores(uuid) to authenticated;
grant execute on function public.create_character_from_wizard(uuid, uuid, text, jsonb, jsonb, int, uuid),
  public.unused_ability_roll(uuid, uuid) to service_role;
