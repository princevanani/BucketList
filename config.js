// Connect the site to your own Supabase project (see README.md, step 2).
// Leave both values empty to run in "preview mode": everything is saved inside this browser only.
//
// The anon key is safe to publish. What it can do is limited by the security rules in supabase/schema.sql.
window.BUCKET_CONFIG = {
  SUPABASE_URL: "https://cladsjbthttijbyyjdfl.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_0gNE4z4zKkw7s3FNcgQCGg_WuN8-Hzv",

  MEDIA_BUCKET: "bucket-media",
  MAX_VIDEO_MB: 50,        // free Supabase plan allows 50 MB per file
  MAX_IMAGE_EDGE: 2200,    // photos are shrunk to this many pixels on the long side before upload
  SITE_TITLE: "Before I die"
};
