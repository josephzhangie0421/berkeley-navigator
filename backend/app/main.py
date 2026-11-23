from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from app.settings import Settings
from app.models.contracts import Course, CourseArgs, Evidence, SearchArgs, CheckRequest, CheckResult, ChatRequest, ChatResponse
from app.retrieval.catalog import Catalog
from app.tools.registry import ToolRunner
from app.llm.gemini import Gemini, chat


def create_app(settings=None, catalog=None, model=None):
    settings = settings or Settings()
    @asynccontextmanager
    async def lifespan(app):
        pool = None
        client = model
        if app.state.catalog is None and settings.database_url:
            pool = ConnectionPool(settings.database_url,min_size=0,max_size=5,timeout=8,
                kwargs={'row_factory':dict_row,'options':'-c search_path=navigator,public -c statement_timeout=5000','connect_timeout':5})
            app.state.catalog = Catalog(pool)
        if client is None and settings.gemini_api_key:
            client = Gemini(settings)
        app.state.model = client
        yield
        if isinstance(client,Gemini):
            await client.close()
        if pool:
            pool.close()
    app = FastAPI(title='Berkeley Navigator',version='1.0.0',lifespan=lifespan)
    app.state.catalog,app.state.model = catalog,model
    app.add_middleware(CORSMiddleware,allow_origins=settings.cors_origins.split(','),
                       allow_methods=['GET','POST'],allow_headers=['Content-Type'])

    @app.middleware('http')
    async def privacy(request,call_next):
        try:
            size=int(request.headers.get('content-length','0') or 0)
        except ValueError:
            return JSONResponse({'detail':'Invalid content length'},status_code=400)
        if size > 65536:
            return JSONResponse({'detail':'Request too large'},status_code=413)
        body=bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body)>65536:
                return JSONResponse({'detail':'Request too large'},status_code=413)
        request._body=bytes(body)
        response = await call_next(request)
        response.headers['Cache-Control']='no-store'
        response.headers['X-Content-Type-Options']='nosniff'
        return response

    @app.exception_handler(Exception)
    async def unavailable(request,exc):
        return JSONResponse({'detail':'The service is temporarily unavailable.'},status_code=503)

    def repository():
        if app.state.catalog is None:
            raise HTTPException(503,'Database is not configured.')
        return app.state.catalog

    @app.get('/api/health')
    def health():
        return {'status':'ok','database_configured':app.state.catalog is not None,'gemini_configured':app.state.model is not None}

    @app.get('/api/ready')
    def ready():
        repository().rows('SELECT 1 FROM published_courses LIMIT 1')
        return {'status':'ready'}

    @app.get('/api/courses',response_model=list[Course])
    def search(query:str=Query(min_length=1,max_length=300),catalog_year:str=Query(pattern=r'^\d{4}-\d{4}$'),limit:int=Query(default=8,ge=1,le=20)):
        return repository().search(query,catalog_year,limit)

    @app.get('/api/courses/{course_code}',response_model=Course)
    def course(course_code:str,catalog_year:str=Query(pattern=r'^\d{4}-\d{4}$')):
        try:
            args=CourseArgs(course_code=course_code,catalog_year=catalog_year)
        except ValueError:
            raise HTTPException(422,'Invalid course code')
        result=repository().get(args.course_code,args.catalog_year)
        if not result:
            raise HTTPException(404,'No published course for this catalog year.')
        return result

    @app.get('/api/evidence/{evidence_id}',response_model=Evidence)
    def evidence(evidence_id:int,catalog_year:str=Query(pattern=r'^\d{4}-\d{4}$')):
        result=repository().evidence(evidence_id,catalog_year)
        if not result:
            raise HTTPException(404,'No published evidence for this catalog year.')
        return result

    @app.post('/api/prerequisites/check',response_model=CheckResult)
    def check(request:CheckRequest):
        result=ToolRunner(repository(),request.profile,request.catalog_year).execute('check_prerequisites',
                    {'course_code':request.course_code,'catalog_year':request.catalog_year})
        if 'error' in result:
            raise HTTPException(404,result['error'])
        return result

    @app.post('/api/chat',response_model=ChatResponse)
    async def conversation(request:ChatRequest):
        return await chat(request,repository(),settings,app.state.model)
    return app


app=create_app()
