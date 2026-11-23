from pydantic import ValidationError
from app.models.contracts import CourseArgs, SearchArgs, EvidenceArgs, CheckResult, Expression, Profile
from app.services.prerequisites import evaluate

SCHEMAS = {'get_course': CourseArgs, 'search_courses': SearchArgs,
           'check_prerequisites': CourseArgs, 'get_evidence': EvidenceArgs}
DESCRIPTIONS = {
 'get_course': 'Look up an approved published course by its code and catalog year.',
 'search_courses': 'Search approved course codes, titles and topics using PostgreSQL full-text search.',
 'check_prerequisites': 'Evaluate published prerequisite rules against the current student profile. The server owns the profile; never supply or change it.',
 'get_evidence': 'Retrieve verified evidence linked to published facts for a catalog year.'}


class ToolRunner:
    def __init__(self, catalog, profile: Profile, catalog_year: str):
        self.catalog, self.profile, self.catalog_year = catalog, profile, catalog_year
        self.courses, self.checks, self.evidence = {}, {}, {}

    def remember(self, course):
        self.courses[course.course_code] = course
        self.evidence[course.evidence.id] = course.evidence
        for requirement in course.requirements:
            self.evidence[requirement.evidence.id] = requirement.evidence

    def execute(self, name, arguments):
        if name not in SCHEMAS:
            return {'error': 'unknown_tool'}
        try:
            args = SCHEMAS[name].model_validate(arguments)
        except (ValidationError, TypeError, ValueError):
            return {'error': 'invalid_arguments', 'message': 'Arguments must match the declared tool schema.'}
        if args.catalog_year != self.catalog_year:
            return {'error': 'catalog_year_mismatch'}
        if name == 'search_courses':
            courses = self.catalog.search(args.query,args.catalog_year,args.limit)
            for c in courses:
                self.remember(c)
            return {'courses': [c.model_dump(mode='json') for c in courses]}
        if name == 'get_evidence':
            evidence = self.catalog.evidence(args.evidence_id,args.catalog_year)
            if not evidence:
                return {'error':'evidence_not_found'}
            self.evidence[evidence.id] = evidence
            return evidence.model_dump(mode='json')
        course = self.catalog.get(args.course_code,args.catalog_year)
        if not course:
            return {'error':'course_not_found', 'message':'No published course is available for this catalog year.'}
        self.remember(course)
        if name == 'get_course':
            return course.model_dump(mode='json')
        requirements = [r for r in course.requirements if r.kind == 'prerequisite']
        expression = Expression(op='all',items=[r.expression for r in requirements]) if requirements else None
        check = CheckResult(course_code=course.course_code,catalog_year=args.catalog_year,
                            evaluation=evaluate(expression,self.profile),requirements=requirements)
        self.checks[course.course_code] = check
        return check.model_dump(mode='json')
