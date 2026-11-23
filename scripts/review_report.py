#!/usr/bin/env python3
"""Build a local read-only review desk from Supabase candidates. Never publishes."""
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import psycopg
from psycopg.rows import dict_row
from app.settings import Settings
from app.services.ingestion import Candidate

ROOT=Path(__file__).resolve().parents[1]

def main():
    settings=Settings()
    with psycopg.connect(settings.migration_database_url or settings.database_url,row_factory=dict_row,
                         connect_timeout=10,options='-c search_path=navigator,public') as conn:
        rows=conn.execute('SELECT id,status,payload FROM ingestion_candidates ORDER BY id').fetchall()
    for row in rows:Candidate.model_validate(row['payload'])
    directory=ROOT/'.local/review';directory.mkdir(parents=True,exist_ok=True)
    for row in rows:
        (directory/f"candidate-{row['id']}.json").write_text(json.dumps(row['payload'],indent=2)+'\n')
    template=(ROOT/'scripts/review-template.html').read_text()
    data=json.dumps(rows).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
    (directory/'index.html').write_text(template.replace('__CANDIDATES__',data))
    print(f'Review desk generated for {len(rows)} candidates. No records published.')
    print('Serve only .local/review on localhost:8081. Regenerate after review decisions.')

if __name__=='__main__':
    try:main()
    except psycopg.Error as exc:raise SystemExit('Review export failed: '+type(exc).__name__)
