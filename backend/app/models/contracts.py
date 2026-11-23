"""Public contracts and the small, explicit prerequisite expression language."""
import re
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def normalize_code(value: str) -> str:
    value = re.sub(r'\s+', ' ', value.strip().upper())
    match = re.fullmatch(r'([A-Z][A-Z &]*?)\s*([CWHNL]?\d{1,3}[A-Z]{0,2})', value)
    if not match:
        raise ValueError('Use a course code such as COMPSCI 61A or HISTORY 7A')
    subject, number = match.groups()
    subject = {'CS': 'COMPSCI', 'COMP SCI': 'COMPSCI', 'STATS': 'STAT', 'EE': 'ELENG', 'EL ENG': 'ELENG'}.get(subject, subject)
    return f'{subject} {number}'


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    @field_validator('catalog_year', check_fields=False)
    @classmethod
    def academic_year(cls, value):
        start, end = map(int, value.split('-'))
        if end != start + 1:
            raise ValueError('Catalog year must span consecutive years')
        return value


class Expression(StrictModel):
    op: Literal['all', 'any', 'course', 'unknown', 'none']
    items: list['Expression'] = Field(default_factory=list, max_length=30)
    course: str | None = None
    reason: str | None = Field(default=None, max_length=2000)

    @model_validator(mode='after')
    def shape(self):
        if self.op in ('all', 'any'):
            if not self.items or self.course or self.reason:
                raise ValueError('Logical expressions need nonempty items only')
        elif self.items:
            raise ValueError('Leaf nodes cannot contain items')
        if self.op == 'course':
            if not self.course or self.reason:
                raise ValueError('Course leaf needs a course code only')
            self.course = normalize_code(self.course)
        elif self.course:
            raise ValueError('Only course leaves have course codes')
        if self.op in ('unknown', 'none') and not self.reason:
            raise ValueError('Unknown and explicit no-prerequisite leaves need an explanation')
        def depth(node):
            return 1 + max((depth(x) for x in node.items), default=0)
        if depth(self) > 12:
            raise ValueError('Expression nesting exceeds 12')
        return self


class Profile(StrictModel):
    completed_courses: list[str] = Field(default_factory=list, max_length=150)
    # Absence is unknown unless the student explicitly says their list is complete.
    complete: bool = False

    @field_validator('completed_courses')
    @classmethod
    def codes(cls, values):
        return list(dict.fromkeys(normalize_code(v) for v in values))


class Evaluation(StrictModel):
    outcome: Literal['satisfied', 'not_satisfied', 'unknown']
    reason: str
    course: str | None = None
    children: list['Evaluation'] = Field(default_factory=list)
    disclaimer: str = 'Prerequisite satisfaction is not guaranteed enrollment eligibility.'


class CourseArgs(StrictModel):
    course_code: str = Field(min_length=2, max_length=80)
    catalog_year: str = Field(pattern=r'^\d{4}-\d{4}$')

    @field_validator('course_code')
    @classmethod
    def code(cls, value):
        return normalize_code(value)


class SearchArgs(StrictModel):
    query: str = Field(min_length=1, max_length=300)
    catalog_year: str = Field(pattern=r'^\d{4}-\d{4}$')
    limit: int = Field(default=8, ge=1, le=20)


class EvidenceArgs(StrictModel):
    evidence_id: int = Field(gt=0)
    catalog_year: str = Field(pattern=r'^\d{4}-\d{4}$')


class CheckRequest(CourseArgs):
    profile: Profile = Field(default_factory=Profile)


class Turn(StrictModel):
    role: Literal['user', 'assistant']
    text: str = Field(max_length=4000)


class ChatRequest(StrictModel):
    message: str = Field(min_length=1, max_length=2000)
    catalog_year: str = Field(pattern=r'^\d{4}-\d{4}$')
    profile: Profile = Field(default_factory=Profile)
    history: list[Turn] = Field(default_factory=list, max_length=12)


class Evidence(StrictModel):
    id: int
    url: str
    title: str
    text: str
    collected_at: str
    verification_status: str


class Requirement(StrictModel):
    id: int
    kind: str
    raw_text: str
    expression: Expression
    evidence: Evidence


class Course(StrictModel):
    id: int
    course_code: str
    title: str
    description: str
    description_kind: str
    units: str
    department: str
    catalog_year: str
    revision: int
    evidence: Evidence
    requirements: list[Requirement] = Field(default_factory=list)


class CheckResult(StrictModel):
    course_code: str
    catalog_year: str
    evaluation: Evaluation
    requirements: list[Requirement] = Field(default_factory=list)


class ChatResponse(StrictModel):
    message: str
    mode: Literal['gemini', 'evidence-only']
    courses: list[Course] = Field(default_factory=list)
    checks: list[CheckResult] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    tool_calls: int = 0
