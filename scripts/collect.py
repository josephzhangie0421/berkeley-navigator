#!/usr/bin/env python3
"""Collect one official source, detect changes, emit an UNREVIEWED candidate.
Usage: python scripts/collect.py reviewed-candidate.json output-candidate.json
Never publishes. JS-only pages must be checked by a human in a browser.
"""
import copy
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import httpx
from app.services.ingestion import Candidate, Source, digest


class PageText(HTMLParser):
    def __init__(self):
        super().__init__();self.hidden=0;self.parts=[]
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'):self.hidden+=1
    def handle_endtag(self,tag):
        if tag in ('script','style'):self.hidden=max(0,self.hidden-1)
    def handle_data(self,data):
        if not self.hidden and data.strip():self.parts.append(data.strip())


def collect(candidate):
    url=candidate.source.url
    with httpx.Client(timeout=20,follow_redirects=False,headers={'User-Agent':'BerkeleyNavigator/1.0 source review collector'}) as client:
        for _ in range(5):
            Source.official(url)
            response=client.get(url)
            if response.is_redirect:
                url=str(response.url.join(response.headers['location']));continue
            response.raise_for_status()
            if len(response.content)>2_000_000:raise ValueError('Page exceeds collector size limit')
            parser=PageText();parser.feed(response.text)
            text='\n'.join(parser.parts)
            if not text:raise ValueError('No readable text; inspect the source manually')
            if digest(text)==digest(candidate.source.text):return None
            result=candidate.model_dump(mode='json')
            result['source'].update(url=url,text=text,collected_at=datetime.now(timezone.utc).isoformat(),verification_status='unverified')
            # Existing interpretations cannot survive a source change without review.
            for rule in result['requirements']:
                rule['expression']={'op':'unknown','reason':'Source changed. Recheck official wording and all conditions before publication.'}
            return Candidate.model_validate(result)
        raise ValueError('Too many source redirects')


if __name__=='__main__':
    if len(sys.argv)!=3:raise SystemExit('Usage: collect.py candidate.json output.json')
    data=Candidate.model_validate_json(Path(sys.argv[1]).read_text())
    result=collect(data)
    if result:
        with Path(sys.argv[2]).open('x') as f:f.write(result.model_dump_json(indent=2)+'\n')
        print('Changed source saved as an unreviewed candidate. Review metadata, year, raw text and logic; then stage it.')
    else:print('Source text unchanged.')
