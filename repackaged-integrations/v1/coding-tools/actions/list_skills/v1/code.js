const baseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;
const MAX_QUERY_LENGTH = 100;
const SLUG_RE = /^[a-z0-9-]{1,100}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ERROR_LENGTH = 2000;

function safeError(value) {
  return String(value).replace(
    /((?:api[_-]?key|authorization|client[_-]?secret|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*)(["']?)[^,\s"']+/gi,
    '$1$2[redacted]',
  ).slice(0, MAX_ERROR_LENGTH);
}

function formatError(response) {
  const json = response.json;
  if (!json) return safeError(response.text || response.error || 'Langdock returned an error');
  if (Array.isArray(json.errors)) {
    const details = json.errors.map((error) => safeError(error?.message)).filter(Boolean).join(', ');
    if (details) return details;
  }
  const detail = json.message || json.error;
  if (typeof detail === 'string') return safeError(detail);
  return 'Langdock returned an error without a message';
}

const requestedLimit = data.input.limit == null ? DEFAULT_LIMIT : data.input.limit;
if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_LIMIT) {
  throw new Error(`Limit must be an integer from 1 to ${MAX_LIMIT}`);
}

const query = data.input.query;
if (query != null && (typeof query !== 'string' || query.length > MAX_QUERY_LENGTH)) {
  throw new Error(`Query must be at most ${MAX_QUERY_LENGTH} characters`);
}

const slug = data.input.slug;
if (slug != null && (typeof slug !== 'string' || !SLUG_RE.test(slug))) {
  throw new Error('Skill slug must contain only lowercase letters, numbers, and dashes');
}

const cursor = data.input.cursor;
if (cursor != null && (typeof cursor !== 'string' || !UUID_RE.test(cursor))) {
  throw new Error('Cursor must be a UUID returned by the previous skill catalog response');
}

const params = [`limit=${requestedLimit}`];
if (query) params.push(`query=${encodeURIComponent(query)}`);
if (slug) params.push(`slug=${encodeURIComponent(slug)}`);
if (cursor) params.push(`cursor=${encodeURIComponent(cursor)}`);

const response = await ld.request({
  url: `${baseUrl}/skills/v1?${params.join('&')}`,
  method: 'GET',
  headers: {
    Authorization: `Bearer ${data.auth.apiKey}`,
    'Content-Type': 'application/json',
  },
});

if (response.status !== 200) {
  throw new Error(`Failed to list skills (${response.status}): ${formatError(response)}`);
}

const skills = response.json && response.json.skills;
if (!Array.isArray(skills)) {
  throw new Error('Skill catalog response did not include a skills array');
}
const validSkills = skills.filter((skill) => skill && typeof skill === 'object');
const nextCursor = response.json.nextCursor ?? null;
if (nextCursor !== null && (typeof nextCursor !== 'string' || !UUID_RE.test(nextCursor))) {
  throw new Error('Skill catalog response contained an invalid pagination cursor');
}

return {
  skills: validSkills.slice(0, requestedLimit).map((skill) => ({
    id: skill.id,
    name: typeof skill.name === 'string' ? skill.name.slice(0, 64) : null,
    slug: typeof skill.slug === 'string' ? skill.slug.slice(0, 100) : null,
    description: typeof skill.description === 'string' ? skill.description.slice(0, 1024) : null,
    integrationIds: Array.isArray(skill.integrationIds) ? skill.integrationIds.slice(0, 250) : [],
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  })),
  nextCursor,
  limit: requestedLimit,
  note: 'Only skills shared with the API key are returned. Instructions and file contents are available through the corresponding detail actions.',
};
