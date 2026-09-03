-- Adds the "last digits" column shown in the shop table (e.g. 4242 -> ••••242).
alter table if exists public.products
  add column if not exists last_digits text;

-- Backfill from the stored key line when possible (field 3 = full card number).
update public.products p
set last_digits = right(regexp_replace(split_part(k.content, '|', 3), '\D', '', 'g'), 3)
from public.product_keys k
where k.product_id = p.id
  and p.last_digits is null
  and split_part(k.content, '|', 3) <> '';

analyze public.products;
