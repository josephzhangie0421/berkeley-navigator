"""Three-valued logic. This module has no database or model dependencies."""
from app.models.contracts import Evaluation, Expression, Profile


def evaluate(expression: Expression | None, profile: Profile) -> Evaluation:
    if expression is None:
        return Evaluation(outcome='unknown', reason='No approved prerequisite rule is available.')
    if expression.op == 'unknown':
        return Evaluation(outcome='unknown', reason=expression.reason)
    if expression.op == 'none':
        return Evaluation(outcome='satisfied', reason=expression.reason)
    if expression.op == 'course':
        if expression.course in profile.completed_courses:
            result, reason = 'satisfied', 'Reported completed by the student.'
        elif profile.complete:
            result, reason = 'not_satisfied', 'Not in the student’s declared complete course list.'
        else:
            result, reason = 'unknown', 'Not reported; the student’s course list may be incomplete.'
        return Evaluation(outcome=result, reason=reason, course=expression.course)
    children = [evaluate(item, profile) for item in expression.items]
    states = [c.outcome for c in children]
    if expression.op == 'all':
        outcome = 'not_satisfied' if 'not_satisfied' in states else ('unknown' if 'unknown' in states else 'satisfied')
    else:
        outcome = 'satisfied' if 'satisfied' in states else ('unknown' if 'unknown' in states else 'not_satisfied')
    return Evaluation(outcome=outcome, reason='All conditions must hold.' if expression.op == 'all' else 'At least one alternative must hold.', children=children)
