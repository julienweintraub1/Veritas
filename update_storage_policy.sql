-- Create a new storage bucket for avatars
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true);

-- Policy to allow authenticated users to upload avatars
create policy "Authenticated users can upload avatars"
  on storage.objects for insert
  with check ( bucket_id = 'avatars' and auth.role() = 'authenticated' );

-- Policy to allow public access to view avatars
create policy "Public access to avatars"
  on storage.objects for select
  using ( bucket_id = 'avatars' );

-- Policy to allow users to update their own avatars (optional, depends on file path logic)
-- Usually simpler to just allow inserts and let Supabase handle unique names or overwrites if we use user_id as filename
