-- AFTER inviting a viewer and having their account in Authentication -> Users:
-- Replace YOUR_VIEWER_EMAIL and run in Supabase SQL Editor.
insert into public.user_roles (user_id, role)
select id, 'viewer' from auth.users
where lower(email) = lower('bhavik@gmail.com')
on conflict (user_id) do update set role = excluded.role;
