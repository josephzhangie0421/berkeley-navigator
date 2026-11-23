#!/usr/bin/env python3
"""User-run secret configuration; sends secret values over stdin, never argv/output.
GitHub: python scripts/cloud_secrets.py github --repo owner/name --environment development
Azure: python scripts/cloud_secrets.py azure --resource-group NAME --app NAME
"""
import argparse
import getpass
import json
import subprocess
import sys

p=argparse.ArgumentParser();sub=p.add_subparsers(dest='command',required=True)
g=sub.add_parser('github');g.add_argument('--repo',required=True);g.add_argument('--environment',default='development')
a=sub.add_parser('azure');a.add_argument('--resource-group',required=True);a.add_argument('--app',required=True)
args=p.parse_args()
if args.command=='github':
    for name in ['TEST_DATABASE_URL','GEMINI_API_KEY','AZURE_STATIC_WEB_APPS_API_TOKEN']:
        value=getpass.getpass(f'{name} (hidden; blank to skip): ')
        if value:
            subprocess.run(['gh','secret','set',name,'--repo',args.repo,'--env',args.environment],input=value,text=True,check=True,stdout=subprocess.DEVNULL)
            print('Configured '+name)
else:
    values={}
    for name in ['DATABASE_URL','GEMINI_API_KEY']:
        value=getpass.getpass(f'{name} (hidden; blank to skip): ')
        if value:values[name]=value
    if values:
        # Azure accepts JSON settings via @file; /dev/stdin prevents a plaintext temp file.
        result=subprocess.run(['az','webapp','config','appsettings','set','--resource-group',args.resource_group,
            '--name',args.app,'--settings','@/dev/stdin','--output','none'],input=json.dumps(values),text=True,
            stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        if result.returncode:raise SystemExit('Azure secret update failed; details suppressed to protect credentials.')
        print('Backend settings updated. No values printed.')
