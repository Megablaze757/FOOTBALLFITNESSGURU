-- Free-text dietary notes, e.g. "I don't like yogurt". Parsed client-side to
-- exclude the foods mentioned, and kept so it doesn't have to be re-typed.

alter table profiles add column if not exists diet_notes text;

notify pgrst, 'reload schema';
