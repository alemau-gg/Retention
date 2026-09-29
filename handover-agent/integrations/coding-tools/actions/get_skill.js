const skillId = data.input.skillId;
const baseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_INSTRUCTIONS = 50000;
const MAX_FILES = 250;
const MAX_ERROR_LENGTH = 2000;

function safeError(value) {
  return String(value).replace(
    /((?:api[_-]?key|authorization|client[_-]?secret|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*)(["']?)[^,\s"']+/gi,
    '$1$2[redacted]',
  ).slice(0, MAX_ERROR_LENGTH);
}

if (typeof skillId !== 'string' || !UUID_RE.test(skillId)) {
  throw new Error('Skill ID must be a UUID');
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

const response = await ld.request({
  url: `${baseUrl}/skills/v1/${encodeURIComponent(skillId)}`,
  method: 'GET',
  headers: {
    Authorization: `Bearer ${data.auth.apiKey}`,
    'Content-Type': 'application/json',
  },
});

if (response.status !== 200) {
  throw new Error(`Failed to get skill (${response.status}): ${formatError(response)}`);
}

const skill = response.json && response.json.skill;
if (!skill || typeof skill !== 'object') {
  throw new Error('Skill detail response did not include a skill object');
}
if (skill.id !== skillId) {
  throw new Error('Skill detail response did not match the requested skill');
}
if (typeof skill.instructions !== 'string') {
  throw new Error('Skill detail response did not include instructions');
}
if (skill.instructions.length > MAX_INSTRUCTIONS) {
  throw new Error(`Skill instructions exceed the documented ${MAX_INSTRUCTIONS}-character limit`);
}

const files = response.json && Array.isArray(response.json.files) ? response.json.files : [];
return {
  skill: {
    id: skill.id,
    name: typeof skill.name === 'string' ? skill.name.slice(0, 64) : null,
    slug: typeof skill.slug === 'string' ? skill.slug.slice(0, 100) : null,
    description: typeof skill.description === 'string' ? skill.description.slice(0, 1024) : null,
    instructions: skill.instructions,
    integrationIds: Array.isArray(skill.integrationIds) ? skill.integrationIds.slice(0, 250) : [],
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  },
  files: files.slice(0, MAX_FILES).map((file) => {
    if (!file || typeof file !== 'object') {
      throw new Error('Skill detail contained an invalid file definition');
    }
    return {
      path: typeof file.path === 'string' ? file.path.slice(0, 255) : null,
      sizeBytes: file.sizeBytes,
      extension: typeof file.extension === 'string' ? file.extension.slice(0, 16) : null,
      hasScript: file.hasScript,
      sha256: typeof file.sha256 === 'string' ? file.sha256.slice(0, 64) : null,
    };
  }),
  fileCount: files.length,
  filesTruncated: files.length > MAX_FILES,
  note: 'File contents are available only through get_skill_file with a validated relative path.',
};
