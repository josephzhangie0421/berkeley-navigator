"""Opt-in HTTP end-to-end tests: real local FastAPI + Supabase + Gemini.

Synthetic fixtures live only in a disposable test_<uuid> schema. No pending
academic candidate is published and no network call is mocked.
"""
import os
import socket
import threading
import time

import httpx
import pytest
import uvicorn

from app.llm.gemini import Gemini
from app.main import create_app
from app.retrieval.catalog import Catalog
from app.services.ingestion import publish, stage
from app.settings import Settings

pytestmark = pytest.mark.live


@pytest.fixture
def enabled_live_demo():
    if os.getenv('RUN_LIVE_DEMO') != '1':
        pytest.skip('Set RUN_LIVE_DEMO=1 explicitly for real Supabase and Gemini requests')
    settings = Settings()
    assert settings.gemini_api_key, 'Real Gemini credentials are required'
    assert os.getenv('TEST_DATABASE_URL'), 'Dedicated development/test database required'
    return settings


@pytest.fixture
def demo_http(enabled_live_demo, database, candidate):
    settings = enabled_live_demo
    conn, pool, _ = database
    # This is the explicit TEST ONLY fixture from conftest, never candidates.json.
    version = publish(conn, stage(conn, candidate), 'automated synthetic-fixture test', candidate.course_code)
    model = Gemini(settings)
    app = create_app(settings, catalog=Catalog(pool), model=model)
    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=port, access_log=False, log_level='error'))
    thread = threading.Thread(target=server.run, kwargs={'sockets':[sock]}, daemon=True)
    thread.start()
    try:
        deadline = time.monotonic() + 15
        while not server.started and thread.is_alive() and time.monotonic() < deadline:
            time.sleep(0.05)
        assert server.started, 'Temporary HTTP server did not start'
        with httpx.Client(base_url=f'http://127.0.0.1:{port}', timeout=60) as client:
            yield client, version
    finally:
        server.should_exit = True
        thread.join(timeout=15)
        sock.close()
        assert not thread.is_alive(), 'Temporary HTTP server did not stop'


def test_real_search_checks_citations_and_multiturn(demo_http):
    client, version = demo_http
    year = '2026-2027'
    assert client.get('/api/ready').status_code == 200
    health = client.get('/api/health').json()
    assert health['database_configured'] and health['gemini_configured']

    # Code, exact title, and real PostgreSQL full-text topic queries.
    for query in ['CS170', 'Test Algorithms', 'machine learning']:
        response = client.get('/api/courses', params={'query':query, 'catalog_year':year})
        assert response.status_code == 200
        assert response.json()[0]['id'] == version

    course = client.get('/api/courses/CS170', params={'catalog_year':year}).json()
    for rule in course['requirements']:
        evidence = client.get(f"/api/evidence/{rule['evidence']['id']}", params={'catalog_year':year})
        assert evidence.status_code == 200
        assert evidence.json() == rule['evidence']
        assert rule['raw_text'] in evidence.json()['text']
    for profile, outcome in [
        ({'completed_courses':['CS61B','CS70'], 'complete':True}, 'satisfied'),
        ({'completed_courses':['CS61B'], 'complete':True}, 'not_satisfied'),
        ({'completed_courses':['CS61B'], 'complete':False}, 'unknown')]:
        response = client.post('/api/prerequisites/check', json={
            'course_code':'CS170', 'catalog_year':year, 'profile':profile})
        assert response.status_code == 200
        assert response.json()['evaluation']['outcome'] == outcome

    question = 'Look up COMPSCI 170 for 2026-2027 and check its prerequisites against my current profile using the tools.'
    first = client.post('/api/chat', json={'message':question, 'catalog_year':year,
        'profile':{'completed_courses':['CS61B'], 'complete':True}})
    assert first.status_code == 200
    answer = first.json()
    assert answer['mode'] == 'gemini', 'Live Gemini must succeed; fallback does not count as passing'
    assert answer['tool_calls'] > 0
    assert answer['courses'][0]['id'] == version
    assert answer['checks'][0]['evaluation']['outcome'] == 'not_satisfied'
    assert answer['evidence']
    assert all(e['id'] == course['evidence']['id'] for e in answer['evidence'])

    # No course code in follow-up: the real model must resolve conversation context.
    second = client.post('/api/chat', json={
        'message':'I have now also completed the other course. Check the same course again using my updated profile.',
        'catalog_year':year, 'profile':{'completed_courses':['CS61B','CS70'], 'complete':True},
        'history':[{'role':'user','text':question},{'role':'assistant','text':answer['message']}]
    })
    assert second.status_code == 200
    followup = second.json()
    assert followup['mode'] == 'gemini', 'Follow-up must use live Gemini, not fallback'
    assert followup['checks'][0]['course_code'] == 'COMPSCI 170'
    assert followup['checks'][0]['evaluation']['outcome'] == 'satisfied'
    assert followup['tool_calls'] > 0
