const baseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');
const trustedSkillIds = String(data.auth.trustedSkillIds || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;
const MAX_QUERY_LENGTH = 100;
const SLUG_RE = /^[a-z0-9-]{1,100}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (
  trustedSkillIds.length === 0 ||
  trustedSkillIds.length > 100 ||
  trustedSkillIds.some((id) => !UUID_RE.test(id))
) {
  throw new Error('No valid trusted Knowledge Retention skill ID allowlist is configured');
}

function formatError(response) {
  const json = response.json;
  if (!json) return response.text || response.error || 'Unknown error';
  if (Array.isArray(json.errors)) {
    const details = json.errors.map((error) => error?.message).filter(Boolean).join(', ');
    if (details) return details;
  }
  const detail = json.message || json.error;
  if (typeof detail === 'string') return detail;
  return JSON.stringify(detail || json);
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
const allowed = new Set(trustedSkillIds);
const filteredSkills = skills.filter((skill) => allowed.has(skill.id));

return {
  skills: filteredSkills.slice(0, MAX_LIMIT).map((skill) => ({
    id: skill.id,
    name: skill.name,
    slug: skill.slug,
    description: skill.description,
    integrationIds: Array.isArray(skill.integrationIds) ? skill.integrationIds : [],
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  })),
  nextCursor: response.json.nextCursor ?? null,
  limit: requestedLimit,
  allowlistedOnly: true,
  note: 'Only configured Knowledge Retention skill IDs are returned. Instructions and file contents are available through the corresponding detail actions.',
};
