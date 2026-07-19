-- Every clip showed as "Training", so a list of them was unusable. Give each
-- one a name and a poster frame captured at upload.

alter table videos add column if not exists title text;
alter table videos add column if not exists thumb_data_url text;
