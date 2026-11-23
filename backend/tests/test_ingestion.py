import json
from pathlib import Path
import pytest
from pydantic import ValidationError
from app.services.ingestion import Candidate,Source


def test_all_migrated_seeds_are_unreviewed_and_valid():
    seeds=json.loads((Path(__file__).resolve().parents[2]/'database/seeds/candidates.json').read_text())
    assert len(seeds)==21
    for seed in seeds:
        c=Candidate.model_validate(seed)
        assert c.source.verification_status=='unverified'
        if c.course_code=='DATA C88C':
            assert c.requirements[0].expression.op=='unknown'
        if c.course_code=='DATA C100':
            assert 'Grade condition' in c.model_dump_json()

@pytest.mark.parametrize('url',['http://berkeley.edu/a','https://berkeley.edu.evil.test/a','https://evil.test','https://u:p@berkeley.edu/a','https://berkeley.edu:443/a'])
def test_source_restrictions(candidate,url):
    data=candidate.source.model_dump();data['url']=url
    with pytest.raises(ValidationError):Source.model_validate(data)


def test_collector_invalidates_logic(candidate,monkeypatch):
    import importlib.util
    spec=importlib.util.spec_from_file_location('collector',Path(__file__).resolve().parents[2]/'scripts/collect.py')
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    import httpx
    response=httpx.Response(200,text='<h1>New title</h1><p>New requirement wording.</p><script>ignored</script>',request=httpx.Request('GET',candidate.source.url))
    class Client:
        def __init__(self,**kwargs):pass
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def get(self,url):return response
    monkeypatch.setattr(mod.httpx,'Client',Client)
    result=mod.collect(candidate)
    assert result.source.verification_status=='unverified'
    assert result.requirements[0].expression.op=='unknown'
    assert 'ignored' not in result.source.text
