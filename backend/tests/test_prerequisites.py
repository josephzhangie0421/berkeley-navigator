import pytest
from pydantic import ValidationError
from app.models.contracts import Expression,Profile,normalize_code
from app.services.prerequisites import evaluate

C=lambda code: {'op':'course','course':code}
U={'op':'unknown','reason':'Instructor consent not reported'}

@pytest.mark.parametrize('op,items,complete,completed,outcome',[
 ('all',[C('CS61A'),C('CS61B')],True,['CS61A','CS61B'],'satisfied'),
 ('all',[C('CS61A'),C('CS61B')],True,['CS61A'],'not_satisfied'),
 ('all',[C('CS61A'),C('CS61B')],False,['CS61A'],'unknown'),
 ('any',[C('CS61A'),U],True,['CS61A'],'satisfied'),
 ('any',[C('CS61A'),U],True,[],'unknown'),
 ('all',[C('CS61A'),U],True,[],'not_satisfied'),
 ('all',[C('CS61A'),U],True,['CS61A'],'unknown'),
 ('any',[C('CS61A'),C('CS61B')],True,[],'not_satisfied'),
 ('all',[C('MATH54'),{'op':'any','items':[C('CS70'),U]}],True,['MATH54','CS70'],'satisfied'),
 ('all',[C('MATH54'),{'op':'any','items':[C('CS70'),U]}],True,['MATH54'],'unknown'),
])
def test_logic(op,items,complete,completed,outcome):
    result=evaluate(Expression(op=op,items=items),Profile(completed_courses=completed,complete=complete))
    assert result.outcome==outcome
    assert result.children
    assert 'not guaranteed' in result.disclaimer


def test_missing_rule_is_unknown():
    assert evaluate(None,Profile(complete=True)).outcome=='unknown'


def test_explicit_none_requires_evidence_explanation():
    assert evaluate(Expression(op='none',reason='Explicit reviewed source says no prerequisites.'),Profile()).outcome=='satisfied'
    with pytest.raises(ValidationError):Expression(op='none')

@pytest.mark.parametrize('payload',[{'op':'all','items':[]},{'op':'any','items':[]},{'op':'course','course':'hello'},
 {'op':'unknown'},{'op':'course','course':'CS70','grade':'C-'},{'op':'none','reason':'x','course':'CS70'}])
def test_invalid_expressions(payload):
    with pytest.raises(ValidationError):Expression.model_validate(payload)

@pytest.mark.parametrize('code,expected',[('cs61a','COMPSCI 61A'),('HISTORY 7a','HISTORY 7A'),('data c100','DATA C100'),('el eng 16a','ELENG 16A')])
def test_normalization(code,expected):assert normalize_code(code)==expected
