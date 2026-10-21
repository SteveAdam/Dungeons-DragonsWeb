-- =====================================================================
-- 0006: map tools. A map's scale (so distances and travel times can be measured), which way is north (for the
-- compass rose), and an optional grid. All DM-set through the existing "dm writes maps" policy; anyone who can
-- read the map reads them.
-- =====================================================================

alter table public.maps
  -- how far the map's full width spans, e.g. 600 (miles) for a kingdom or 120 (feet) for a battle map;
  -- null until the DM sets it, and then nothing can be measured
  add column scale_width numeric check (scale_width > 0),
  add column scale_unit text not null default 'mi' check (scale_unit in ('mi', 'ft')),
  -- compass: the direction of north, in degrees clockwise from the top of the image
  add column north_degrees int not null default 0 check (north_degrees between 0 and 359),
  -- grid square size in the map's unit (5 for 5-foot squares); null means no grid
  add column grid_size numeric check (grid_size > 0);
