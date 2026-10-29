CREATE TABLE IF NOT EXISTS past_paper_questions (
  id serial PRIMARY KEY,
  owner_id text NOT NULL,
  course_id integer NOT NULL,
  source_material_id integer NOT NULL,
  question_number text,
  prompt text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  question_type text NOT NULL DEFAULT 'short_answer',
  marks integer,
  source_excerpt text NOT NULL,
  correct_answer text,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS past_paper_questions_source_idx
  ON past_paper_questions (owner_id, course_id, source_material_id);
