-- Migration #4: ampliar avatares 1..12
alter table pro_gestion.profiles drop constraint if exists profiles_avatar_check;
alter table pro_gestion.profiles add constraint profiles_avatar_check check (avatar between 1 and 12);

-- Trigger updated: random 1..12 al signup
create or replace function pro_gestion.handle_new_user() returns trigger
language plpgsql security definer set search_path = pro_gestion, auth
as $$
declare
    has_admin boolean;
    chosen_role text;
begin
    select exists(select 1 from pro_gestion.profiles where role = 'admin') into has_admin;
    chosen_role := coalesce(new.raw_user_meta_data->>'role', case when has_admin then 'miembro' else 'admin' end);
    insert into pro_gestion.profiles (id, name, email, role, avatar)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.email,
        chosen_role,
        coalesce((new.raw_user_meta_data->>'avatar')::smallint, 1 + floor(random()*12)::smallint)
    )
    on conflict (id) do nothing;
    return new;
end; $$;

notify pgrst, 'reload config';
