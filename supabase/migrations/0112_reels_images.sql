-- =============================================================================
-- THE REELS BUCKET HOLDS SLIDES TOO.
--
-- The carousel workflow uploaded five PNGs and the bucket refused every one:
--
--   {"statusCode":"415","error":"invalid_mime_type",
--    "message":"mime type image/png is not supported"}
--
-- 0111 listed video/mp4, application/x-subrip and text/plain, which was the
-- complete set of things a reel produces. A carousel produces images, so the
-- caption uploaded and the post itself did not.
--
-- image/jpeg is included as well. Nothing writes one today, but a bucket that
-- accepts a PNG and refuses a JPEG is a distinction with no reason behind it,
-- and the next person to hit it would be debugging a 415 rather than reading
-- this file.
--
-- The size cap is unchanged and still doing the work: a slide is ~250KB and
-- the cap is 40MB, so this widens what may be stored and not how much.
-- =============================================================================

update storage.buckets
set allowed_mime_types = array[
  'video/mp4', 'application/x-subrip', 'text/plain', 'image/png', 'image/jpeg'
]
where id = 'reels';

-- The last statement reports the verdict, which is what .github/workflows/
-- apply-sql.yml prints back.
select
  id,
  allowed_mime_types,
  ('image/png' = any(allowed_mime_types)) as accepts_slides
from storage.buckets
where id = 'reels';
