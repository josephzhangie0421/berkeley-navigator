import { api } from './api.js';
import { element, courseCard } from './components/course.js';
const $ = id => document.getElementById(id);
let history = [], courses = [], checks = [], busy = false;
function profile() {
  return { completed_courses: $('completed').value.split(/[,\n]/).map(s => s.trim()).filter(Boolean), complete: $('complete').checked };
}
function year() {
  const value = $('year').value.trim();
  if (!/^\d{4}-\d{4}$/.test(value)) throw new Error('Use a catalog year such as 2026-2027.');
  return value;
}
function bubble(role, text) {
  const node = element('div', undefined, `bubble ${role}`); node.append(element('small', role === 'user' ? 'YOU' : 'NAVIGATOR'), element('span', text));
  $('conversation').append(node); $('conversation').scrollTop = $('conversation').scrollHeight;
}
async function run(task) {
  if (busy) return;
  busy = true; document.querySelectorAll('button').forEach(b => b.disabled = true); $('status').textContent = 'Looking up published evidence…';
  try { await task(); $('status').textContent = ''; }
  catch (error) { $('status').textContent = error.message || 'Could not complete the request.'; }
  finally { busy = false; document.querySelectorAll('button').forEach(b => b.disabled = false); }
}
function render() {
  $('results').replaceChildren(...courses.map(course => courseCard(course, checks.find(c => c.course_code === course.course_code), onCheck)));
}
function onCheck(course) {
  run(async () => {
    const result = await api('/api/prerequisites/check', { course_code: course.course_code, catalog_year: year(), profile: profile() });
    checks = checks.filter(c => c.course_code !== result.course_code); checks.push(result); render();
  });
}
async function ask(message) {
  await run(async () => {
    const request = { message, catalog_year: year(), profile: profile(), history: history.slice(-12) };
    bubble('user', message); $('message').value = '';
    const answer = await api('/api/chat', request);
    bubble('assistant', `${answer.message}\n\n${answer.limitations.join('\n')}`);
    // Include server-returned course codes to make follow-ups explicit, without storing tool transcripts.
    history.push({role:'user',text:message},{role:'assistant',text:`${answer.message}\n${answer.courses.map(c => c.course_code).join(', ')}`.slice(0,4000)});
    history = history.slice(-12); courses = answer.courses; checks = answer.checks; render();
  });
}
$('chat-form').addEventListener('submit', event => { event.preventDefault(); const message = $('message').value.trim(); if (message) ask(message); });
$('search-form').addEventListener('submit', event => {
  event.preventDefault(); run(async () => {
    courses = await api(`/api/courses?${new URLSearchParams({query:$('search').value.trim(),catalog_year:year()})}`);
    checks = []; render(); bubble('assistant', courses.length ? `Found ${courses.length} published courses.` : 'No published matches. Records may still be awaiting review.');
  });
});
document.querySelectorAll('[data-question]').forEach(button => button.addEventListener('click', () => ask(button.dataset.question)));
$('reset').addEventListener('click', () => { history=[];courses=[];checks=[]; $('completed').value='';$('complete').checked=false;$('message').value='';$('search').value='';$('conversation').replaceChildren();render();$('status').textContent='Session cleared.'; });
for (const id of ['completed','complete']) $(id).addEventListener('input', () => { checks=[]; render(); });
$('year').addEventListener('change', () => { courses=[];checks=[];history=[];$('conversation').replaceChildren();render(); });
api('/api/health').then(result => { $('connection').textContent=result.database_configured ? 'Course service connected' : 'Database setup pending'; }).catch(() => { $('connection').textContent='Service offline'; });
