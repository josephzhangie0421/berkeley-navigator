import express, { type NextFunction, type Request, type Response } from 'express';
import type { Db } from '../db/client.js';
import { CourseRepo } from '../repo.js';
import { retrieve, RetrieveValidationError, validateRequest } from '../retrieve.js';

export function createApp(db: Db) {
  const repo = new CourseRepo(db);
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  // Permissive CORS for local frontend development. Restrict ALLOWED_ORIGIN in deployment.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN ?? '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return void res.sendStatus(204);
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', driver: db.driver });
  });

  app.get('/api/courses', async (req, res) => {
    const query = typeof req.query.query === 'string' ? req.query.query.trim() : undefined;
    const department = typeof req.query.department === 'string' ? req.query.department.trim() : undefined;
    const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    if (limitRaw !== undefined && (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 100)) {
      return void res.status(400).json({ error: { code: 'invalid_limit', message: '"limit" must be an integer between 1 and 100.' } });
    }
    const courses = await repo.listCourses({ query: query || undefined, department: department || undefined, limit: limitRaw ?? 50 });
    res.json({ courses, count: courses.length });
  });

  app.get('/api/courses/:id', async (req, res) => {
    const course = await repo.resolveCourse(String(req.params.id));
    if (!course) return void res.status(404).json({ error: { code: 'course_not_found', message: `No course matches "${req.params.id}".` } });
    const [sources, requirements] = await Promise.all([repo.courseSources(course.id), repo.requirements([course.id])]);
    res.json({ course, requirements, sources });
  });

  app.get('/api/courses/:id/relations', async (req, res) => {
    const course = await repo.resolveCourse(String(req.params.id));
    if (!course) return void res.status(404).json({ error: { code: 'course_not_found', message: `No course matches "${req.params.id}".` } });
    const [outgoing, incoming] = await Promise.all([
      repo.relations({ courseId: course.id, direction: 'outgoing' }),
      repo.relations({ courseId: course.id, direction: 'incoming' }),
    ]);
    res.json({
      course: { id: course.id, course_code: course.course_code, title: course.title },
      outgoing,   // this course's own requirements (course -> named course)
      incoming,   // courses in the knowledge base whose requirements name this course
    });
  });

  app.post('/api/retrieve', async (req, res) => {
    const parsed = validateRequest(req.body);
    res.json(await retrieve(repo, parsed));
  });

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Unknown endpoint.' } });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof RetrieveValidationError) {
      return void res.status(400).json({ error: { code: 'invalid_request', message: err.message } });
    }
    if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
      return void res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON.' } });
    }
    console.error(err);
    res.status(500).json({ error: { code: 'internal_error', message: 'Unexpected server error.' } });
  });

  return app;
}
