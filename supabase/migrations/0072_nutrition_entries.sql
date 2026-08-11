-- Today's food as a LIST, not just a running total.
--
-- nutrition_logs stored `calories_eaten` and a `macros` blob and nothing else,
-- so once something was logged it was arithmetic — you could see that 2,140
-- calories had gone in and had no way to find out what they were, correct a
-- portion you guessed wrong, or remove the meal you ticked by accident. The
-- only route back was retyping the totals by hand in a box labelled "macros
-- eaten today", which is the kind of control that exists because the data model
-- is missing something.
--
-- Entries are the source of truth now and the totals are derived from them on
-- every write. The two columns stay because Home, Progress and the weekly
-- report all read them and none of those needs the detail — but nothing writes
-- a total that did not come from summing this array.
--
-- jsonb rather than a child table: it is at most a few dozen rows a day, always
-- read and written whole with its parent, and never queried across days. A
-- table would buy a join and an RLS policy for nothing.
alter table public.nutrition_logs
  add column if not exists entries jsonb not null default '[]'::jsonb;

-- Shape, enforced loosely on purpose: an array, so a malformed write cannot make
-- the page render `.map` over an object. What is IN each entry is the app's
-- business and will change; what it is not allowed to be is a non-array.
alter table public.nutrition_logs
  drop constraint if exists nutrition_logs_entries_is_array;
alter table public.nutrition_logs
  add constraint nutrition_logs_entries_is_array
  check (jsonb_typeof(entries) = 'array');
