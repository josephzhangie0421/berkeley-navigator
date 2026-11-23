import { API_BASE_URL } from './config.js';
export async function api(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      if (response.status === 422) throw new Error('Check the catalog year and course codes. Use codes such as CS 61A.');
      if (response.status === 404) throw new Error('No published course record is available for that catalog year.');
      throw new Error('The course service is unavailable. Please try again.');
    }
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request timed out. Please try again.');
    throw error;
  } finally { clearTimeout(timer); }
}
