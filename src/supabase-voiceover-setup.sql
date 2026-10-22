-- INCOG PLOTLINE: persistent uploaded AI narration
-- Run once in Supabase Dashboard > SQL Editor.

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS voiceover_url text;

-- Create a public-read bucket so published story audio can be played without login.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'story-voiceovers',
  'story-voiceovers',
  true,
  52428800,
  ARRAY['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/mp4','audio/aac','audio/ogg','audio/webm','audio/m4a']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can read story voiceovers" ON storage.objects;
CREATE POLICY "Public can read story voiceovers"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'story-voiceovers');

DROP POLICY IF EXISTS "Admins can upload story voiceovers" ON storage.objects;
CREATE POLICY "Admins can upload story voiceovers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'story-voiceovers'
  AND public.is_current_user_admin()
);

DROP POLICY IF EXISTS "Admins can update story voiceovers" ON storage.objects;
CREATE POLICY "Admins can update story voiceovers"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'story-voiceovers' AND public.is_current_user_admin())
WITH CHECK (bucket_id = 'story-voiceovers' AND public.is_current_user_admin());

DROP POLICY IF EXISTS "Admins can delete story voiceovers" ON storage.objects;
CREATE POLICY "Admins can delete story voiceovers"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'story-voiceovers' AND public.is_current_user_admin());
