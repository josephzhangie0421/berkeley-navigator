import importlib.util
import os
from pathlib import Path
import uuid
import pytest
from dotenv import load_dotenv
load_dotenv(override=False)
from app.models.contracts import Course, Evidence, Requirement
from app.services.ingestion import Candidate


@pytest.fixture
def candidate():
    # Explicit synthetic test fixture, never production seed data.
    return Candidate.model_validate({
      'course_code':'COMPSCI 170','department':'COMPSCI','title':'Test Algorithms',
      'description':'Synthetic algorithms and machine learning test fixture.','units':'4',
      'catalog_year':'2026-2027','aliases':['CS 170'],
      'source':{'url':'https://example.berkeley.edu/test','title':'Synthetic fixture',
        'text':'TEST ONLY: COMPSCI 61B and COMPSCI 70.','collected_at':'2026-11-09T00:00:00Z'},
      'requirements':[{'kind':'prerequisite','raw_text':'COMPSCI 61B and COMPSCI 70.',
        'expression':{'op':'all','items':[{'op':'course','course':'CS61B'},{'op':'course','course':'CS70'}]}}]})


@pytest.fixture
def sample_course():
    evidence=Evidence(id=1,url='https://example.berkeley.edu/test',title='Synthetic fixture',text='TEST ONLY',
                      collected_at='2026-11-09T00:00:00Z',verification_status='verified')
    return Course(id=1,course_code='COMPSCI 170',title='Test Algorithms',description='Synthetic test fixture',
      description_kind='paraphrased_summary',units='4',department='COMPSCI',catalog_year='2026-2027',revision=1,evidence=evidence,
      requirements=[Requirement(id=1,kind='prerequisite',raw_text='COMPSCI 61B and COMPSCI 70.',
        expression={'op':'all','items':[{'op':'course','course':'COMPSCI 61B'},{'op':'course','course':'COMPSCI 70'}]},evidence=evidence)])


@pytest.fixture
def fake_catalog(sample_course):
    class Fake:
        def get(self,code,year):
            return sample_course if code=='COMPSCI 170' and year=='2026-2027' else None
        def search(self,query,year,limit=8):
            return [sample_course] if year=='2026-2027' else []
        def evidence(self,id,year):
            return sample_course.evidence if id==1 and year=='2026-2027' else None
        def rows(self,*args):return []
    return Fake()


@pytest.fixture
def database():
    url=os.getenv('TEST_DATABASE_URL')
    if not url:pytest.skip('TEST_DATABASE_URL is not configured; real PostgreSQL required')
    import psycopg
    from psycopg import sql
    from psycopg.rows import dict_row
    from psycopg_pool import ConnectionPool
    root=Path(__file__).resolve().parents[2]
    spec=importlib.util.spec_from_file_location('manage',root/'scripts/manage.py')
    manage=importlib.util.module_from_spec(spec);spec.loader.exec_module(manage)
    schema='test_'+uuid.uuid4().hex
    with psycopg.connect(url,row_factory=dict_row,autocommit=True) as conn:
        manage.migrate(conn,schema)
        conn.execute(sql.SQL('SET search_path TO {},public').format(sql.Identifier(schema)))
        with ConnectionPool(url,min_size=1,max_size=3,kwargs={'row_factory':dict_row,'options':f'-c search_path={schema},public'}) as pool:
            try:yield conn,pool,schema
            finally:pass
        conn.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
