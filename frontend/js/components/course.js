export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function source(evidence) {
  const link = element('a', evidence.title, 'source');
  const url = new URL(evidence.url);
  if (url.protocol !== 'https:' || !(url.hostname === 'berkeley.edu' || url.hostname.endsWith('.berkeley.edu'))) return element('span', 'Source URL unavailable');
  link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
  return link;
}
function explanation(result) {
  const item = element('li', `${result.course ? result.course + ': ' : ''}${result.outcome.replaceAll('_', ' ')} — ${result.reason}`);
  if (result.children.length) {
    const list = element('ul'); result.children.forEach(child => list.append(explanation(child))); item.append(list);
  }
  return item;
}
export function courseCard(course, check, onCheck) {
  const card = element('article', undefined, 'panel course');
  card.append(element('span', `${course.course_code} · ${course.units} units`, 'course-code'), element('h3', course.title),
    element('p', course.description), element('p', `${course.catalog_year} · revision ${course.revision} · ${course.description_kind.replaceAll('_', ' ')}`, 'muted'));
  card.append(source(course.evidence));
  for (const rule of course.requirements) {
    const section = element('section', undefined, 'requirement');
    section.append(element('strong', rule.kind.replaceAll('_', ' ')), element('blockquote', rule.raw_text), source(rule.evidence));
    card.append(section);
  }
  if (check) {
    const section = element('div', undefined, 'evaluation');
    section.append(element('strong', `Prerequisites: ${check.evaluation.outcome.replaceAll('_', ' ')}`));
    const list = element('ul'); list.append(explanation(check.evaluation)); section.append(list, element('p', check.evaluation.disclaimer, 'hint')); card.append(section);
  } else {
    const button = element('button', 'Check my prerequisites', 'secondary'); button.type = 'button';
    button.addEventListener('click', () => onCheck(course)); card.append(button);
  }
  const details = element('details'); details.append(element('summary', 'View collected source evidence'),
    element('p', `Collected ${new Date(course.evidence.collected_at).toLocaleDateString()} · ${course.evidence.verification_status}`),
    element('blockquote', course.evidence.text)); card.append(details);
  return card;
}

export function evidenceCard(evidence) {
  const card = element('article', undefined, 'panel course');
  card.append(element('h3', 'Official source evidence'), source(evidence),
    element('p', `Collected ${new Date(evidence.collected_at).toLocaleDateString()}`, 'muted'),
    element('blockquote', evidence.text));
  return card;
}
