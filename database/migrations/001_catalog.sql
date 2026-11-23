-- Run in a dedicated navigator schema. Never overwrites the legacy public tables.
CREATE TABLE departments (code text PRIMARY KEY, name text NOT NULL);
CREATE TABLE courses (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 course_code text NOT NULL UNIQUE,
 department_code text NOT NULL REFERENCES departments(code)
);
CREATE TABLE evidence (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 url text NOT NULL CHECK (url ~ '^https://([a-zA-Z0-9-]+\.)*berkeley\.edu/'),
 title text NOT NULL,
 original_text text NOT NULL CHECK (length(original_text)>0),
 collected_at timestamptz NOT NULL,
 content_hash text NOT NULL,
 verification_status text NOT NULL CHECK (verification_status IN ('unverified','verified','partial','stale')),
 UNIQUE(url, content_hash, collected_at)
);
CREATE TABLE course_versions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 course_id bigint NOT NULL REFERENCES courses(id),
 catalog_year text NOT NULL CHECK (catalog_year ~ '^\d{4}-\d{4}$'),
 revision integer NOT NULL CHECK (revision>0),
 title text NOT NULL, description text NOT NULL, units text NOT NULL,
 description_kind text NOT NULL CHECK (description_kind IN ('verbatim','paraphrased_summary')),
 evidence_id bigint NOT NULL REFERENCES evidence(id),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
 reviewed_by text, reviewed_at timestamptz, published_at timestamptz,
 search_document tsvector GENERATED ALWAYS AS (
 setweight(to_tsvector('english',title),'A') || setweight(to_tsvector('english',description),'B')) STORED,
 UNIQUE(course_id,catalog_year,revision),
 CHECK (status <> 'published' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND published_at IS NOT NULL))
);
CREATE INDEX course_search ON course_versions USING gin(search_document);
CREATE TABLE course_aliases (
 course_version_id bigint NOT NULL REFERENCES course_versions(id),
 alias text NOT NULL,
 PRIMARY KEY(course_version_id,alias)
);
CREATE TABLE requirement_versions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 course_version_id bigint NOT NULL REFERENCES course_versions(id),
 kind text NOT NULL CHECK (kind IN ('prerequisite','corequisite','recommendation','advisory','credit_restriction')),
 raw_text text NOT NULL CHECK (length(raw_text)>0),
 expression jsonb NOT NULL CHECK (jsonb_typeof(expression)='object'),
 evidence_id bigint NOT NULL REFERENCES evidence(id)
);
-- Degree requirements can later reference the same expression grammar, without a student table.
CREATE TABLE ingestion_candidates (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 content_hash text NOT NULL UNIQUE,
 payload jsonb NOT NULL,
 collected_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','rejected')),
 reviewed_by text, reviewed_at timestamptz,
 published_version_id bigint REFERENCES course_versions(id)
);
CREATE FUNCTION protect_publication() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_id bigint;
BEGIN
 IF TG_TABLE_NAME='course_versions' THEN
  IF TG_OP<>'INSERT' AND OLD.status='published' THEN RAISE EXCEPTION 'Published versions are immutable'; END IF;
  IF TG_OP<>'DELETE' AND NEW.status='published' THEN
   IF NOT EXISTS (SELECT 1 FROM evidence WHERE id=NEW.evidence_id AND verification_status='verified')
    OR EXISTS (SELECT 1 FROM requirement_versions r JOIN evidence e ON e.id=r.evidence_id WHERE r.course_version_id=NEW.id AND e.verification_status<>'verified')
   THEN RAISE EXCEPTION 'Publication requires verified evidence'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='evidence' THEN
  IF EXISTS (SELECT 1 FROM course_versions v WHERE v.status='published' AND (v.evidence_id=OLD.id OR EXISTS (SELECT 1 FROM requirement_versions r WHERE r.course_version_id=v.id AND r.evidence_id=OLD.id)))
  THEN RAISE EXCEPTION 'Published evidence is immutable'; END IF;
 ELSE
  IF TG_OP<>'INSERT' THEN
   version_id := OLD.course_version_id;
   IF EXISTS (SELECT 1 FROM course_versions WHERE id=version_id AND status='published') THEN RAISE EXCEPTION 'Published facts are immutable'; END IF;
  END IF;
  IF TG_OP<>'DELETE' AND EXISTS (SELECT 1 FROM course_versions WHERE id=NEW.course_version_id AND status='published') THEN RAISE EXCEPTION 'Published facts are immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_version BEFORE INSERT OR UPDATE OR DELETE ON course_versions FOR EACH ROW EXECUTE FUNCTION protect_publication();
CREATE TRIGGER protect_rule BEFORE INSERT OR UPDATE OR DELETE ON requirement_versions FOR EACH ROW EXECUTE FUNCTION protect_publication();
CREATE TRIGGER protect_alias BEFORE INSERT OR UPDATE OR DELETE ON course_aliases FOR EACH ROW EXECUTE FUNCTION protect_publication();
CREATE TRIGGER protect_evidence BEFORE UPDATE OR DELETE ON evidence FOR EACH ROW EXECUTE FUNCTION protect_publication();
-- Latest published revision per course/year, not the newest unreviewed candidate.
CREATE VIEW published_courses AS
 SELECT DISTINCT ON (v.course_id,v.catalog_year) v.*, c.course_code, c.department_code
 FROM course_versions v JOIN courses c ON c.id=v.course_id
 JOIN evidence e ON e.id=v.evidence_id
 WHERE v.status='published' AND e.verification_status='verified'
 ORDER BY v.course_id,v.catalog_year,v.revision DESC;
REVOKE ALL ON ALL TABLES IN SCHEMA navigator FROM PUBLIC;

CREATE FUNCTION protect_course_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM course_versions WHERE course_id=OLD.id AND status='published') THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Published course identity is immutable'; END IF;
  IF NEW.course_code<>OLD.course_code OR NEW.department_code<>OLD.department_code THEN
   RAISE EXCEPTION 'Published course identity is immutable';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_course BEFORE UPDATE OR DELETE ON courses FOR EACH ROW EXECUTE FUNCTION protect_course_identity();
-- Read-only runtime role gets these views, never the candidate or base tables.
CREATE VIEW published_requirements AS
 SELECT r.* FROM requirement_versions r JOIN published_courses v ON v.id=r.course_version_id
 JOIN evidence e ON e.id=r.evidence_id WHERE e.verification_status='verified';
CREATE VIEW published_aliases AS
 SELECT a.* FROM course_aliases a JOIN published_courses v ON v.id=a.course_version_id;
CREATE VIEW published_evidence AS
 SELECT e.* FROM evidence e WHERE e.verification_status='verified' AND
 (EXISTS (SELECT 1 FROM published_courses v WHERE v.evidence_id=e.id) OR
  EXISTS (SELECT 1 FROM published_requirements r WHERE r.evidence_id=e.id));
