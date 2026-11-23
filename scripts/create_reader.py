#!/usr/bin/env python3
"""Create a restricted backend role using an administrative connection from .env.
Run interactively; the new password is prompted without echo and never printed.
"""
import getpass
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import psycopg
from psycopg import sql
from app.settings import Settings
settings=Settings()
password=getpass.getpass('New navigator_reader password (hidden): ')
if len(password)<20:raise SystemExit('Use a generated password of at least 20 characters.')
try:
    with psycopg.connect(settings.migration_database_url or settings.database_url) as conn:
        conn.execute(sql.SQL('CREATE ROLE navigator_reader LOGIN PASSWORD {}').format(sql.Literal(password)))
        conn.execute('GRANT USAGE ON SCHEMA navigator TO navigator_reader')
        conn.execute('GRANT SELECT ON navigator.published_courses,navigator.published_requirements,navigator.published_aliases,navigator.published_evidence TO navigator_reader')
        conn.execute("ALTER ROLE navigator_reader SET search_path TO navigator,public")
        conn.execute("ALTER ROLE navigator_reader SET default_transaction_read_only TO on")
    print('Created restricted role. Configure the backend DATABASE_URL with this role privately; keep the owner URL only as MIGRATION_DATABASE_URL.')
except psycopg.Error as exc:
    raise SystemExit('Role setup failed: '+type(exc).__name__)
