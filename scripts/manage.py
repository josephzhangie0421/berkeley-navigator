#!/usr/bin/env python3
"""Run from repository root: .venv/bin/python scripts/manage.py --help."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from app.settings import Settings
from app.services.ingestion import Candidate, stage, publish

ROOT=Path(__file__).resolve().parents[1]


def migrate(conn,schema='navigator'):
    if not schema.startswith(('navigator','test_')) or not schema.replace('_','').isalnum():
        raise ValueError('Invalid schema')
    with conn.transaction():
        conn.execute('SELECT pg_advisory_xact_lock(7192026)')
        conn.execute(sql.SQL('CREATE SCHEMA IF NOT EXISTS {}').format(sql.Identifier(schema)))
        conn.execute(sql.SQL('SET LOCAL search_path TO {}, public').format(sql.Identifier(schema)))
        conn.execute('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())')
        for path in sorted((ROOT/'database/migrations').glob('*.sql')):
            body=path.read_text(); checksum=hashlib.sha256(body.encode()).hexdigest()
            old=conn.execute('SELECT checksum FROM schema_migrations WHERE name=%s',(path.name,)).fetchone()
            if old:
                if old['checksum']!=checksum:
                    raise ValueError('Applied migration changed: '+path.name)
                continue
            conn.execute(body.replace('IN SCHEMA navigator','IN SCHEMA '+schema))
            conn.execute('INSERT INTO schema_migrations(name,checksum) VALUES(%s,%s)',(path.name,checksum))


def main():
    parser=argparse.ArgumentParser(description='Migrate, stage, inspect and explicitly publish academic records.')
    sub=parser.add_subparsers(dest='command',required=True)
    sub.add_parser('migrate'); sub.add_parser('status')
    for command in ('validate','stage'):
        p=sub.add_parser(command); p.add_argument('file')
    p=sub.add_parser('review');p.add_argument('id',type=int)
    p=sub.add_parser('export');p.add_argument('id',type=int);p.add_argument('file')
    p=sub.add_parser('reject');p.add_argument('id',type=int);p.add_argument('--reviewer',required=True)
    p=sub.add_parser('publish');p.add_argument('id',type=int);p.add_argument('--reviewer',required=True);p.add_argument('--confirm-course',required=True)
    args=parser.parse_args()
    if args.command in ('validate','stage'):
        raw=json.loads(Path(args.file).read_text());raw=raw if isinstance(raw,list) else [raw]
        candidates=[Candidate.model_validate(c) for c in raw]
        if args.command=='validate':
            print(f'Validated {len(candidates)} candidates; validation does not approve academic facts.');return
    settings=Settings()
    url=settings.migration_database_url or settings.database_url
    if not url:
        raise SystemExit('Configure DATABASE_URL privately using scripts/configure_local.py')
    with psycopg.connect(url,row_factory=dict_row,connect_timeout=10,options='-c search_path=navigator,public') as conn:
        if args.command=='migrate': migrate(conn);print('Migrations applied.')
        elif args.command=='stage':
            for candidate in candidates: print('Pending candidate',stage(conn,candidate))
        elif args.command=='review':
            row=conn.execute('SELECT payload,status FROM ingestion_candidates WHERE id=%s',(args.id,)).fetchone()
            print(json.dumps(row,indent=2,default=str))
        elif args.command=='export':
            row=conn.execute('SELECT payload FROM ingestion_candidates WHERE id=%s',(args.id,)).fetchone()
            if not row:raise ValueError('Candidate not found')
            with Path(args.file).open('x') as f:json.dump(row['payload'],f,indent=2)
            print('Exported candidate for review; existing files are never overwritten.')
        elif args.command=='reject':
            if not args.reviewer.strip():raise ValueError('Reviewer required')
            result=conn.execute("UPDATE ingestion_candidates SET status='rejected',reviewed_by=%s,reviewed_at=now() WHERE id=%s AND status='pending'",(args.reviewer,args.id))
            if result.rowcount!=1:raise ValueError('Candidate is not pending')
            print('Candidate rejected; original payload preserved.')
        elif args.command=='publish': print('Published version',publish(conn,args.id,args.reviewer,args.confirm_course))
        elif args.command=='status':
            print(json.dumps(conn.execute('SELECT status,count(*) FROM ingestion_candidates GROUP BY status').fetchall()))
            print('Published courses:',conn.execute('SELECT count(*) AS n FROM published_courses').fetchone()['n'])


if __name__=='__main__':
    try: main()
    except (psycopg.Error,ValueError) as exc:
        # Database exceptions can contain connection details. Never dump credentials.
        print('Operation failed: '+(str(exc) if isinstance(exc,ValueError) else type(exc).__name__),file=sys.stderr)
        sys.exit(1)
