import copy
import pytest
import psycopg
from app.retrieval.catalog import Catalog
from app.services.ingestion import Candidate,stage,publish
from app.models.contracts import Profile
from app.tools.registry import ToolRunner

pytestmark=pytest.mark.integration


def approve(conn,candidate):
    cid=stage(conn,candidate)
    return publish(conn,cid,'test reviewer',candidate.course_code)


def test_published_vs_pending_and_evidence(database,candidate):
    conn,pool,_=database;repo=Catalog(pool)
    cid=stage(conn,candidate)
    assert repo.search('algorithms','2026-2027')==[]
    assert repo.get('COMPSCI 170','2026-2027') is None
    vid=publish(conn,cid,'test reviewer','CS170')
    course=repo.get('COMPSCI 170','2026-2027')
    assert course.id==vid and course.requirements[0].raw_text==candidate.requirements[0].raw_text
    assert repo.get('CS 170','2026-2027').id==vid
    assert repo.evidence(course.evidence.id,'2026-2027').text==candidate.source.text
    assert repo.evidence(course.evidence.id,'2025-2026') is None
    assert repo.search("'); DELETE FROM courses; --",'2026-2027')==[]


def test_full_text_title_and_code(database,candidate):
    conn,pool,_=database;approve(conn,candidate);repo=Catalog(pool)
    for query in ['algorithm','machine learning','Test Algorithms','CS170','COMPSCI 170']:
        assert repo.search(query,'2026-2027')[0].course_code=='COMPSCI 170'
    assert repo.search('oceanography','2026-2027')==[]


def test_historical_versions_and_latest_published(database,candidate):
    conn,pool,_=database;repo=Catalog(pool)
    first=approve(conn,candidate)
    modified=candidate.model_copy(deep=True);modified.title='Updated Algorithms'
    stage(conn,modified)
    assert repo.get('COMPSCI 170','2026-2027').id==first
    second=approve(conn,modified)
    assert repo.get('COMPSCI 170','2026-2027').id==second
    assert conn.execute('SELECT title FROM course_versions WHERE id=%s',(first,)).fetchone()['title']=='Test Algorithms'
    modified.catalog_year='2025-2026';oldyear=approve(conn,modified)
    assert repo.get('COMPSCI 170','2025-2026').id==oldyear
    assert repo.get('COMPSCI 170','2026-2027').id==second


def test_immutable_published_facts(database,candidate):
    conn,pool,_=database;vid=approve(conn,candidate)
    eid=Catalog(pool).get('COMPSCI 170','2026-2027').evidence.id
    for query,args in [
      ('UPDATE course_versions SET title=%s WHERE id=%s',('bad',vid)),
      ('DELETE FROM course_versions WHERE id=%s',(vid,)),
      ('UPDATE requirement_versions SET raw_text=%s WHERE course_version_id=%s',('bad',vid)),
      ('DELETE FROM course_aliases WHERE course_version_id=%s',(vid,)),
      ('UPDATE evidence SET original_text=%s WHERE id=%s',('bad',eid)),
      ('INSERT INTO course_aliases(course_version_id,alias) VALUES(%s,%s)',(vid,'CS 999'))]:
        with pytest.raises(psycopg.Error):
            with conn.transaction():conn.execute(query,args)


def test_atomic_publication_and_idempotent_staging(database,candidate):
    conn,pool,_=database
    cid=stage(conn,candidate)
    assert stage(conn,candidate)==cid
    with pytest.raises(ValueError):publish(conn,cid,'reviewer','CS999')
    assert conn.execute('SELECT count(*) AS n FROM course_versions').fetchone()['n']==0
    assert conn.execute('SELECT status FROM ingestion_candidates WHERE id=%s',(cid,)).fetchone()['status']=='pending'


def test_missing_rule_unknown(database,candidate):
    conn,pool,_=database;candidate.requirements=[];approve(conn,candidate)
    result=ToolRunner(Catalog(pool),Profile(complete=True),'2026-2027').execute('check_prerequisites',{'course_code':'CS170','catalog_year':'2026-2027'})
    assert result['evaluation']['outcome']=='unknown'


def test_unlinked_evidence_not_exposed(database,candidate):
    conn,pool,_=database
    row=conn.execute("INSERT INTO evidence(url,title,original_text,collected_at,content_hash,verification_status) VALUES('https://example.berkeley.edu/test','fixture','test',now(),'hash','verified') RETURNING id").fetchone()
    assert Catalog(pool).evidence(row['id'],'2026-2027') is None


def test_publication_needs_verified_evidence(database,candidate):
    conn,pool,_=database
    conn.execute("INSERT INTO departments(code,name) VALUES('TEST','TEST')")
    cid=conn.execute("INSERT INTO courses(course_code,department_code) VALUES('TEST 1','TEST') RETURNING id").fetchone()['id']
    eid=conn.execute("INSERT INTO evidence(url,title,original_text,collected_at,content_hash,verification_status) VALUES('https://example.berkeley.edu/test','fixture','test',now(),'hash','unverified') RETURNING id").fetchone()['id']
    with pytest.raises(psycopg.Error):
        with conn.transaction():
            conn.execute("INSERT INTO course_versions(course_id,catalog_year,revision,title,description,units,description_kind,evidence_id,status,reviewed_by,reviewed_at,published_at) VALUES(%s,'2026-2027',1,'Test','','4','verbatim',%s,'published','test',now(),now())",(cid,eid))


def test_migrations_are_idempotent(database):
    import importlib.util
    from pathlib import Path
    conn,pool,schema=database
    spec=importlib.util.spec_from_file_location('manage',Path(__file__).resolve().parents[2]/'scripts/manage.py')
    manage=importlib.util.module_from_spec(spec);spec.loader.exec_module(manage)
    manage.migrate(conn,schema)
    assert conn.execute('SELECT count(*) AS n FROM schema_migrations').fetchone()['n']==1


def test_reader_views_exclude_drafts(database,candidate):
    conn,pool,_=database
    stage(conn,candidate)
    for view in ['published_courses','published_requirements','published_aliases','published_evidence']:
        from psycopg import sql
        assert conn.execute(sql.SQL('SELECT count(*) AS n FROM {}').format(sql.Identifier(view))).fetchone()['n']==0
    approve(conn,candidate)
    assert conn.execute('SELECT count(*) AS n FROM published_requirements').fetchone()['n']==1
