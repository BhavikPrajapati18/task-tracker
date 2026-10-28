-- AFTER creating your user in Authentication -> Users, replace YOUR_EMAIL below.
-- Run in Supabase SQL Editor. Do NOT commit a real email address to a public repo.
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users
where lower(email) = lower('YOUR_EMAIL@example.com')
on conflict (user_id) do update set role = excluded.role;

-- If you see no rows changed, check the exact address in Authentication -> Users.
