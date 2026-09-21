ALTER TABLE learning_questions
  ADD COLUMN IF NOT EXISTS source_material_id integer,
  ADD COLUMN IF NOT EXISTS source_file text,
  ADD COLUMN IF NOT EXISTS source_excerpt text,
  ADD COLUMN IF NOT EXISTS topic text;
