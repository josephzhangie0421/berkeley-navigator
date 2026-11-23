"""Parameterized structured SQL + PostgreSQL FTS; no LLM dependency."""
from app.models.contracts import Course, Evidence, Requirement, normalize_code


class Catalog:
    def __init__(self, pool):
        self.pool = pool

    def rows(self, query, params=()):
        with self.pool.connection() as conn:
            with conn.transaction():
                conn.execute('SET TRANSACTION READ ONLY')
                conn.execute("SET LOCAL statement_timeout = '5s'")
                return conn.execute(query, params).fetchall()

    @staticmethod
    def evidence_from(row):
        return Evidence(id=row['id'], url=row['url'], title=row['title'], text=row['original_text'],
                        collected_at=row['collected_at'].isoformat(), verification_status=row['verification_status'])

    def evidence(self, evidence_id, catalog_year):
        rows = self.rows('''SELECT e.* FROM published_evidence e WHERE e.id=%s AND e.verification_status='verified'
          AND EXISTS (SELECT 1 FROM published_courses v WHERE v.catalog_year=%s AND
          (v.evidence_id=e.id OR EXISTS (SELECT 1 FROM published_requirements r WHERE r.course_version_id=v.id AND r.evidence_id=e.id)))''',
          (evidence_id, catalog_year))
        return self.evidence_from(rows[0]) if rows else None

    def hydrate(self, row):
        evidence = self.evidence(row['evidence_id'], row['catalog_year'])
        requirements = self.rows('''SELECT r.* FROM published_requirements r JOIN published_evidence e ON e.id=r.evidence_id
           WHERE r.course_version_id=%s AND e.verification_status='verified' ORDER BY r.id''', (row['id'],))
        return Course(id=row['id'],course_code=row['course_code'],title=row['title'],description=row['description'],
                      description_kind=row['description_kind'],units=row['units'],department=row['department_code'],
                      catalog_year=row['catalog_year'],revision=row['revision'],evidence=evidence,
                      requirements=[Requirement(id=r['id'],kind=r['kind'],raw_text=r['raw_text'],expression=r['expression'],
                                                evidence=self.evidence(r['evidence_id'],row['catalog_year'])) for r in requirements])

    def get(self, course_code, catalog_year):
        course_code = normalize_code(course_code)
        rows = self.rows('''SELECT v.* FROM published_courses v WHERE v.catalog_year=%s
          AND (v.course_code=%s OR EXISTS (SELECT 1 FROM published_aliases a WHERE a.course_version_id=v.id AND a.alias=%s))
          ORDER BY (v.course_code=%s) DESC, v.course_code LIMIT 1''',
          (catalog_year,course_code,course_code,course_code))
        return self.hydrate(rows[0]) if rows else None

    def search(self, query, catalog_year, limit=8):
        try:
            code = normalize_code(query)
        except ValueError:
            code = query.upper()
        rows = self.rows('''SELECT v.*, ts_rank_cd(v.search_document,websearch_to_tsquery('english',%s)) AS rank
           FROM published_courses v WHERE v.catalog_year=%s AND
           (v.course_code=%s OR lower(v.title)=lower(%s) OR
            EXISTS (SELECT 1 FROM published_aliases a WHERE a.course_version_id=v.id AND a.alias=%s) OR
            v.search_document @@ websearch_to_tsquery('english',%s))
           ORDER BY (v.course_code=%s) DESC, (lower(v.title)=lower(%s)) DESC, rank DESC, v.course_code LIMIT %s''',
           (query,catalog_year,code,query,code,query,code,query,limit))
        return [self.hydrate(r) for r in rows]
