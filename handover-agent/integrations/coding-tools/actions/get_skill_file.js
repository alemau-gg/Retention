const skillId = data.input.skillId;
const path = data.input.path;
const trustedSkillIds = String(data.auth.trustedSkillIds || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const baseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PATH_LENGTH = 255;
const MAX_FILE_BYTES = 512 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  '.md', '.mdx', '.txt', '.py', '.sh', '.js', '.ts', '.json', '.yaml',
  '.yml', '.toml', '.csv', '.xml', '.xsd', '.html', '.css', '.svg',
]);

if (typeof skillId !== 'string' || !UUID_RE.test(skillId)) {
  throw new Error('Skill ID must be a UUID');
}
if (
  trustedSkillIds.length === 0 ||
  trustedSkillIds.length > 100 ||
  trustedSkillIds.some((id) => !UUID_RE.test(id))
) {
  throw new Error('No valid trusted Knowledge Retention skill ID allowlist is configured');
}
if (!trustedSkillIds.includes(skillId)) {
  throw new Error('get_skill_file only permits configured trusted Knowledge Retention skill IDs');
}
if (typeof path !== 'string' || path.length < 1 || path.length > MAX_PATH_LENGTH) {
  throw new Error(`Skill file path must be 1-${MAX_PATH_LENGTH} characters`);
}
if (
  path.startsWith('/') ||
  path.startsWith('\\') ||
  /^[a-zA-Z]:/.test(path) ||
  /[\u0000-\u001f\u007f]/.test(path) ||
  path.includes('\\')
) {
  throw new Error('Skill file path must be a relative path without control characters or backslashes');
}

const segments = path.split('/');
if (segments.some((segment) => segment.length === 0 || segment === '..' || segment === '.')) {
  throw new Error('Skill file path must not contain empty or dot segments');
}
const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
if (!ALLOWED_EXTENSIONS.has(extension)) {
  throw new Error(`Skill file extension is not readable; allowed extensions: ${[...ALLOWED_EXTENSIONS].join(', ')}`);
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

const response = await ld.request({
  url: `${baseUrl}/skills/v1/${encodeURIComponent(skillId)}/files?path=${encodeURIComponent(path)}`,
  method: 'GET',
  headers: {
    Authorization: `Bearer ${data.auth.apiKey}`,
    'Content-Type': 'application/json',
  },
});

if (response.status !== 200) {
  throw new Error(`Failed to get skill file (${response.status}): ${formatError(response)}`);
}

const file = response.json;
if (!file || typeof file !== 'object' || typeof file.content !== 'string') {
  throw new Error('Skill file response did not include UTF-8 content');
}
if (
  !Number.isInteger(file.sizeBytes) ||
  file.sizeBytes < 0 ||
  file.sizeBytes > MAX_FILE_BYTES ||
  file.content.length > MAX_FILE_BYTES
) {
  throw new Error(`Skill file exceeds the documented ${MAX_FILE_BYTES}-byte response limit`);
}

return {
  path: file.path,
  sizeBytes: file.sizeBytes,
  extension: file.extension,
  hasScript: file.hasScript,
  sha256: file.sha256,
  content: file.content,
};
