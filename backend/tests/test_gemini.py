from types import SimpleNamespace
import pytest
from google.genai import types
from app.llm.gemini import chat
from app.models.contracts import ChatRequest,Profile
from app.settings import Settings
from app.tools.registry import ToolRunner


def reply(*calls,text=None):
    parts=[types.Part(function_call=types.FunctionCall(name=n,args=a,id=str(i))) for i,(n,a) in enumerate(calls)]
    if text:parts.append(types.Part.from_text(text=text))
    return SimpleNamespace(candidates=[SimpleNamespace(content=types.Content(role='model',parts=parts))])

ARGS={'course_code':'CS170','catalog_year':'2026-2027'}
class FakeModel:
    def __init__(self,replies):self.replies=iter(replies);self.contents=[]
    async def generate(self,contents):
        self.contents.append(list(contents));value=next(self.replies)
        if isinstance(value,Exception):raise value
        return value

async def test_multiple_calls_grounded(fake_catalog):
    model=FakeModel([reply(('get_course',ARGS),('check_prerequisites',ARGS)),reply(text='CS170 requires CS999. You are eligible! https://evil.test')])
    result=await chat(ChatRequest(message='CS170 prerequisites',catalog_year='2026-2027'),fake_catalog,Settings(),model)
    assert result.mode=='gemini' and result.tool_calls==2
    assert result.checks[0].evaluation.outcome=='unknown'
    assert 'CS999' not in result.model_dump_json() and 'evil.test' not in result.model_dump_json()
    assert model.contents[1][-1].parts[0].function_response.name=='get_course'

async def test_call_limit(fake_catalog):
    model=FakeModel([reply(*[('get_course',ARGS)]*8)])
    result=await chat(ChatRequest(message='x',catalog_year='2026-2027'),fake_catalog,Settings(max_tool_calls=2),model)
    assert result.tool_calls==2 and any('Tool-call limit' in s for s in result.limitations)

async def test_round_limit(fake_catalog):
    model=FakeModel([reply(('get_course',ARGS))]*2)
    result=await chat(ChatRequest(message='CS170',catalog_year='2026-2027'),fake_catalog,Settings(max_model_rounds=2),model)
    assert result.tool_calls==2 and any('round limit' in s for s in result.limitations)

@pytest.mark.parametrize('failure',[RuntimeError('429'),TimeoutError(),ValueError('invalid response')])
async def test_error_fallback(fake_catalog,failure):
    result=await chat(ChatRequest(message='CS170',catalog_year='2026-2027'),fake_catalog,Settings(),FakeModel([failure]))
    assert result.mode=='evidence-only' and result.courses

@pytest.mark.parametrize('name,args,error',[
 ('execute_sql',{},'unknown_tool'),('get_course',{},'invalid_arguments'),
 ('get_course',{**ARGS,'sql':'DELETE'},'invalid_arguments'),
 ('get_course',{**ARGS,'catalog_year':'2025-2026'},'catalog_year_mismatch'),
 ('get_evidence',{'evidence_id':99,'catalog_year':'2026-2027'},'evidence_not_found'),
 ('check_prerequisites',{**ARGS,'profile':{'completed_courses':['CS61B','CS70']}},'invalid_arguments')])
def test_controlled_tools(fake_catalog,name,args,error):
    assert ToolRunner(fake_catalog,Profile(),'2026-2027').execute(name,args)['error']==error

async def test_malformed_call_recovery(fake_catalog):
    model=FakeModel([reply(('get_course',{})),reply(('get_course',ARGS)),reply(text='done')])
    result=await chat(ChatRequest(message='x',catalog_year='2026-2027'),fake_catalog,Settings(),model)
    assert result.tool_calls==2 and result.courses
    assert model.contents[1][-1].parts[0].function_response.response['error']=='invalid_arguments'

async def test_live_gemini():
    import os
    from app.llm.gemini import Gemini
    if os.getenv('RUN_LIVE_GEMINI')!='1':pytest.skip('Set RUN_LIVE_GEMINI=1 explicitly')
    settings=Settings()
    assert settings.gemini_api_key,'Configure a real Gemini key securely'
    model=Gemini(settings)
    try:
        response=await model.generate([types.Content(role='user',parts=[types.Part.from_text(text='Call get_course for COMPSCI 170, catalog_year 2026-2027.')])])
        assert response.function_calls
        assert response.function_calls[0].name=='get_course'
    finally:await model.close()

async def test_evidence_only_tool_result_is_not_reported_as_missing(fake_catalog):
    model=FakeModel([reply(('get_evidence',{'evidence_id':1,'catalog_year':'2026-2027'})),reply(text='done')])
    result=await chat(ChatRequest(message='Show the source',catalog_year='2026-2027'),fake_catalog,Settings(),model)
    assert result.mode=='gemini' and len(result.evidence)==1
    assert not result.courses
    assert 'Retrieved verified source' in result.message
