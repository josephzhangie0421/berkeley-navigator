import httpx
import pytest
from app.main import create_app
from app.settings import Settings

@pytest.fixture
def app(fake_catalog):return create_app(Settings(),catalog=fake_catalog)

@pytest.mark.parametrize('path,status',[
 ('/api/courses?query=algorithms&catalog_year=2026-2027',200),
 ('/api/courses?query=algorithms&catalog_year=2026-2027&limit=1000',422),
 ('/api/courses?query=&catalog_year=2026-2027',422),
 ('/api/courses?query=x&catalog_year=bad',422),
 ('/api/courses/CS170?catalog_year=2026-2027',200),
 ('/api/courses/CS999?catalog_year=2026-2027',404),
 ('/api/courses/nope?catalog_year=2026-2027',422),
 ('/api/evidence/1?catalog_year=2026-2027',200),
 ('/api/evidence/2?catalog_year=2026-2027',404),
])
async def test_get(app,path,status):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
        response=await client.get(path)
        assert response.status_code==status
        assert response.headers['cache-control']=='no-store'

async def test_check(app):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
        response=await client.post('/api/prerequisites/check',json={'course_code':'CS170','catalog_year':'2026-2027','profile':{'completed_courses':['CS61B','CS70']}})
        assert response.json()['evaluation']['outcome']=='satisfied'
        response=await client.post('/api/prerequisites/check',json={'course_code':'CS170','catalog_year':'2026-2027','profile':{'completed_courses':'CS70'}})
        assert response.status_code==422

async def test_chat_no_key(app):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
        response=await client.post('/api/chat',json={'message':'Prerequisites for CS170','catalog_year':'2026-2027'})
        assert response.json()['mode']=='evidence-only'
        assert response.json()['checks'][0]['evaluation']['outcome']=='unknown'
        assert (await client.post('/api/chat',json={'message':'','catalog_year':'2026-2027'})).status_code==422

async def test_unconfigured_database():
    app=create_app(Settings(database_url=''))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
        assert (await client.get('/api/ready')).status_code==503

async def test_body_limit_and_malformed_json(app):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
        assert (await client.post('/api/chat',content='x'*70000)).status_code==413
        assert (await client.post('/api/chat',content='{bad',headers={'content-type':'application/json'})).status_code==422

async def test_real_sql_api(database,candidate):
    from app.services.ingestion import stage,publish
    from app.retrieval.catalog import Catalog
    conn,pool,_=database
    publish(conn,stage(conn,candidate),'test reviewer','CS170')
    app=create_app(Settings(),catalog=Catalog(pool))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
        response=await client.get('/api/courses',params={'query':'algorithms','catalog_year':'2026-2027'})
        assert response.status_code==200 and response.json()[0]['course_code']=='COMPSCI 170'
        response=await client.post('/api/prerequisites/check',json={'course_code':'CS170','catalog_year':'2026-2027','profile':{'complete':True,'completed_courses':['CS61B','CS70']}})
        assert response.status_code==200 and response.json()['evaluation']['outcome']=='satisfied'
