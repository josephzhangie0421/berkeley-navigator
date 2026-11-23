#!/usr/bin/env python3
"""Interactive hidden prompts; run yourself in Terminal, never paste secrets in chat."""
import getpass
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

root=Path(__file__).resolve().parents[1]
path=root/'.env'
if path.exists():
    raise SystemExit('.env already exists. Edit it privately or rename it before rerunning; nothing overwritten.')
url=getpass.getpass('Development PostgreSQL URI (hidden; blank to configure later): ').strip()
key=getpass.getpass('Gemini API key (hidden; blank to configure later): ').strip()
if url:
    parsed=urlsplit(url)
    if parsed.scheme not in ('postgresql','postgres') or not parsed.hostname:
        raise SystemExit('Invalid PostgreSQL URI')
    if parsed.hostname not in ('localhost','127.0.0.1') and 'sslmode=' not in parsed.query:
        url+=('&' if parsed.query else '?')+'sslmode=require'
values={'APP_ENV':'development','DATABASE_URL':url,'GEMINI_API_KEY':key,
        'GEMINI_MODEL':'gemini-3.5-flash-lite','CORS_ORIGINS':'http://localhost:8080,http://127.0.0.1:8080'}
fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:
    for name,value in values.items(): f.write(name+'='+json.dumps(value)+'\n')
print('Saved private .env with owner-only permissions. Values were not printed.')
