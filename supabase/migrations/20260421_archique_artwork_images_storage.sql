do $$
declare
  images_data_type text;
begin
  select data_type
  into images_data_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'artworks'
    and column_name = 'images';

  if images_data_type is null then
    alter table public.artworks
      add column images jsonb not null default '[]'::jsonb;
  elsif images_data_type <> 'jsonb' then
    alter table public.artworks
      alter column images drop default;

    if images_data_type = 'ARRAY' then
      execute $sql$
        alter table public.artworks
        alter column images type jsonb
        using coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'url', item,
                'is_primary', ordinality = 1
              )
              order by ordinality
            )
            from unnest(images) with ordinality as source(item, ordinality)
          ),
          '[]'::jsonb
        )
      $sql$;
    else
      execute $sql$
        alter table public.artworks
        alter column images type jsonb
        using case
          when images is null or trim(both '"' from images::text) = '' then '[]'::jsonb
          when left(trim(images::text), 1) = '[' then (
            select coalesce(
              jsonb_agg(
                case
                  when jsonb_typeof(item.value) = 'object' then jsonb_build_object(
                    'url', item.value->>'url',
                    'is_primary', coalesce((item.value->>'is_primary')::boolean, item.ordinality = 1)
                  )
                  else jsonb_build_object(
                    'url', trim(both '"' from item.value::text),
                    'is_primary', item.ordinality = 1
                  )
                end
                order by item.ordinality
              ),
              '[]'::jsonb
            )
            from jsonb_array_elements(images::jsonb) with ordinality as item(value, ordinality)
          )
          else jsonb_build_array(
            jsonb_build_object(
              'url', trim(both '"' from images::text),
              'is_primary', true
            )
          )
        end
      $sql$;
    end if;

    alter table public.artworks
      alter column images set default '[]'::jsonb;
  end if;
end $$;

update public.artworks
set images = case
  when coalesce(jsonb_array_length(images), 0) = 0 and coalesce(image, '') <> ''
    then jsonb_build_array(jsonb_build_object('url', image, 'is_primary', true))
  else (
    select jsonb_agg(
      jsonb_build_object(
        'url', entry->>'url',
        'is_primary', ordinality = coalesce(
          (
            select min(primary_entries.ordinality)
            from jsonb_array_elements(images) with ordinality as primary_entries(value, ordinality)
            where coalesce((primary_entries.value->>'is_primary')::boolean, false)
          ),
          1
        )
      )
      order by ordinality
    )
    from jsonb_array_elements(images) with ordinality as normalized(entry, ordinality)
    where coalesce(entry->>'url', '') <> ''
  )
end;

alter table public.artworks
  alter column images set not null,
  alter column images set default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('artworks', 'artworks', true)
on conflict (id) do update set public = excluded.public;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public can view artwork images'
  ) then
    create policy "Public can view artwork images"
      on storage.objects
      for select
      to public
      using (bucket_id = 'artworks');
  end if;
end $$;
