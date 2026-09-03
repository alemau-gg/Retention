const skillId = data.input.skillId;
const trustedSkillIds = String(data.auth.trustedSkillIds || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const baseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_INSTRUCTIONS = 50000;
const MAX_FILES = 250;

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
  throw new Error('get_skill only permits configured trusted Knowledge Retention skill IDs');
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
if (typeof skill.instructions === 'string' && skill.instructions.length > MAX_INSTRUCTIONS) {
  throw new Error(`Skill instructions exceed the documented ${MAX_INSTRUCTIONS}-character limit`);
}

const files = response.json && Array.isArray(response.json.files) ? response.json.files : [];
return {
  skill: {
    id: skill.id,
    name: skill.name,
    slug: skill.slug,
    description: skill.description,
    instructions: skill.instructions ?? null,
    integrationIds: Array.isArray(skill.integrationIds) ? skill.integrationIds : [],
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  },
  files: files.slice(0, MAX_FILES),
  fileCount: files.length,
  filesTruncated: files.length > MAX_FILES,
  note: 'File contents are available only through get_skill_file with a validated relative path.',
};
