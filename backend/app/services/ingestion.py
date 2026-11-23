"""Reviewable candidates and atomic publication. No HTTP write endpoints."""
import hashlib
import json
from datetime import datetime
from urllib.parse import urlparse
from pydantic import Field, field_validator
from psycopg.types.json import Jsonb
from app.models.contracts import StrictModel, Expression, normalize_code


class Source(StrictModel):
    url: str
    title: str = Field(min_length=1)
    text: str = Field(min_length=1)
    collected_at: datetime
    verification_status: str = 'unverified'

    @field_validator('url')
    @classmethod
    def official(cls,value):
        p=urlparse(value)
        if p.scheme!='https' or not p.hostname or not (p.hostname=='berkeley.edu' or p.hostname.endswith('.berkeley.edu')) or p.username or p.password or p.port:
            raise ValueError('Evidence must use an official Berkeley HTTPS URL')
        return value

    @field_validator('collected_at')
    @classmethod
    def timezone(cls,value):
        if value.tzinfo is None:
            raise ValueError('Collection timestamp requires timezone')
        return value


class CandidateRule(StrictModel):
    kind: str
    raw_text: str = Field(min_length=1)
    expression: Expression

    @field_validator('kind')
    @classmethod
    def kind_known(cls,value):
        if value not in ['prerequisite','corequisite','recommendation','advisory','credit_restriction']:
            raise ValueError('Unsupported requirement kind')
        return value


class Candidate(StrictModel):
    course_code: str
    department: str
    title: str = Field(min_length=1)
    description: str
    description_kind: str = 'paraphrased_summary'
    units: str
    catalog_year: str = Field(pattern=r'^\d{4}-\d{4}$')
    aliases: list[str] = Field(default_factory=list)
    source: Source
    requirements: list[CandidateRule]

    @field_validator('course_code')
    @classmethod
    def code(cls,value):
        return normalize_code(value)

    @field_validator('aliases')
    @classmethod
    def aliases_normalized(cls,value):
        return list(dict.fromkeys(normalize_code(x) for x in value))

    @field_validator('description_kind')
    @classmethod
    def description_type(cls,value):
        if value not in ('paraphrased_summary','verbatim'):
            raise ValueError('Unsupported description kind')
        return value


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False).encode()).hexdigest()


def stage(conn,candidate):
    payload=candidate.model_dump(mode='json')
    return conn.execute('''INSERT INTO ingestion_candidates(content_hash,payload) VALUES(%s,%s)
        ON CONFLICT(content_hash) DO UPDATE SET content_hash=EXCLUDED.content_hash RETURNING id''',
        (digest(payload),Jsonb(payload))).fetchone()['id']


def publish(conn,candidate_id,reviewer,confirmed_code):
    if not reviewer.strip():
        raise ValueError('Named human reviewer required')
    with conn.transaction():
        row=conn.execute('SELECT * FROM ingestion_candidates WHERE id=%s FOR UPDATE',(candidate_id,)).fetchone()
        if not row or row['status']!='pending':
            raise ValueError('Candidate is not pending')
        candidate=Candidate.model_validate(row['payload'])
        if normalize_code(confirmed_code)!=candidate.course_code:
            raise ValueError('Confirm the exact reviewed course code')
        # Approval is explicit: reviewer confirms source, year, metadata and every expression.
        conn.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',(candidate.course_code,))
        conn.execute('INSERT INTO departments(code,name) VALUES(%s,%s) ON CONFLICT DO NOTHING',
                     (candidate.department,candidate.department))
        course=conn.execute('''INSERT INTO courses(course_code,department_code) VALUES(%s,%s)
          ON CONFLICT(course_code) DO UPDATE SET course_code=EXCLUDED.course_code RETURNING id''',
          (candidate.course_code,candidate.department)).fetchone()['id']
        source=candidate.source
        conn.execute('''INSERT INTO evidence(url,title,original_text,collected_at,content_hash,verification_status)
          VALUES(%s,%s,%s,%s,%s,'verified') ON CONFLICT(url,content_hash,collected_at) DO NOTHING''',
          (source.url,source.title,source.text,source.collected_at,digest(source.text)))
        stored=conn.execute('SELECT id,verification_status FROM evidence WHERE url=%s AND content_hash=%s AND collected_at=%s',
                            (source.url,digest(source.text),source.collected_at)).fetchone()
        if stored['verification_status']!='verified':
            conn.execute("UPDATE evidence SET verification_status='verified' WHERE id=%s",(stored['id'],))
        eid=stored['id']
        revision=conn.execute('SELECT COALESCE(max(revision),0)+1 AS n FROM course_versions WHERE course_id=%s AND catalog_year=%s',
                             (course,candidate.catalog_year)).fetchone()['n']
        vid=conn.execute('''INSERT INTO course_versions(course_id,catalog_year,revision,title,description,units,description_kind,evidence_id)
          VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id''',
          (course,candidate.catalog_year,revision,candidate.title,candidate.description,candidate.units,candidate.description_kind,eid)).fetchone()['id']
        for alias in candidate.aliases:
            conn.execute('INSERT INTO course_aliases(course_version_id,alias) VALUES(%s,%s)',(vid,alias))
        for rule in candidate.requirements:
            conn.execute('''INSERT INTO requirement_versions(course_version_id,kind,raw_text,expression,evidence_id)
              VALUES(%s,%s,%s,%s,%s)''',(vid,rule.kind,rule.raw_text,Jsonb(rule.expression.model_dump(exclude_none=True)),eid))
        conn.execute("UPDATE course_versions SET status='published',reviewed_by=%s,reviewed_at=now(),published_at=now() WHERE id=%s",(reviewer,vid))
        conn.execute("UPDATE ingestion_candidates SET status='published',reviewed_by=%s,reviewed_at=now(),published_version_id=%s WHERE id=%s",(reviewer,vid,candidate_id))
        return vid
