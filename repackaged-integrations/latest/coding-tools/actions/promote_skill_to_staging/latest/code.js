const devSkillId = data.input.devSkillId;
const stagingSkillId = data.input.stagingSkillId;
const devIntegrationId = data.input.devIntegrationId;
const stagingIntegrationId = data.input.stagingIntegrationId;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FILES = 200;

for (const [label, value] of [
  ['Dev skill ID', devSkillId],
  ['Staging skill ID', stagingSkillId],
  ['Dev integration ID', devIntegrationId],
  ['Staging integration ID', stagingIntegrationId],
]) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new Error(`${label} must be a UUID`);
  }
}
if (devSkillId === stagingSkillId) {
  throw new Error('Dev and Staging skill IDs must be different.');
}
if (devIntegrationId === stagingIntegrationId) {
  throw new Error('Dev and Staging integration IDs must be different.');
}

const baseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');
const authHeaders = { Authorization: `Bearer ${data.auth.apiKey}` };

function formatError(response) {
  const json = response.json;
  if (!json) return response.text || response.error || 'Unknown error';
  if (Array.isArray(json.errors)) {
    const details = json.errors.map((error) => error.message).filter(Boolean).join(', ');
    if (details) return details;
  }
  const detail = json.message || json.error;
  if (typeof detail === 'string') return detail;
  return JSON.stringify(detail || json);
}

async function getSkill(skillId, label) {
  const response = await ld.request({
    url: `${baseUrl}/skills/v1/${encodeURIComponent(skillId)}`,
    method: 'GET',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
  });
  if (response.status !== 200) {
    throw new Error(`Failed to read ${label} skill "${skillId}" (${response.status}): ${formatError(response)}`);
  }
  const skill = response.json && response.json.skill;
  if (!skill || skill.id !== skillId) {
    throw new Error(`${label} skill response did not include the requested skill "${skillId}"`);
  }
  return { skill, files: Array.isArray(response.json.files) ? response.json.files : [] };
}

async function getSkillFile(skillId, path) {
  const response = await ld.request({
    url: `${baseUrl}/skills/v1/${encodeURIComponent(skillId)}/files?path=${encodeURIComponent(path)}`,
    method: 'GET',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
  });
  if (response.status !== 200 || !response.json || typeof response.json.content !== 'string') {
    throw new Error(
      `Could not read Dev skill file "${path}" as text (${response.status}): ${formatError(response)}. Nothing was changed in Staging.`,
    );
  }
  return response.json.content;
}

function utf8Bytes(text) {
  const source = String(text);
  const out = [];
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const low = source.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        const point = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        out.push(0xf0 | (point >> 18), 0x80 | ((point >> 12) & 0x3f), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
        i++;
      } else {
        out.push(0xef, 0xbf, 0xbd);
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      out.push(0xef, 0xbf, 0xbd);
    } else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return out;
}

let crcTable = null;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

// Stored (uncompressed) ZIP; general-purpose flag bit 11 marks UTF-8 file names.
function zip(entries) {
  const out = [];
  const central = [];
  const u16 = (target, value) => target.push(value & 0xff, (value >>> 8) & 0xff);
  const u32 = (target, value) =>
    target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
  for (const entry of entries) {
    const nameBytes = utf8Bytes(entry.name);
    const dataBytes = entry.bytes;
    const crc = crc32(dataBytes);
    const offset = out.length;
    u32(out, 0x04034b50);
    u16(out, 20);
    u16(out, 0x0800);
    u16(out, 0);
    u16(out, 0);
    u16(out, 0x0021);
    u32(out, crc);
    u32(out, dataBytes.length);
    u32(out, dataBytes.length);
    u16(out, nameBytes.length);
    u16(out, 0);
    for (const b of nameBytes) out.push(b);
    for (const b of dataBytes) out.push(b);

    u32(central, 0x02014b50);
    u16(central, 20);
    u16(central, 20);
    u16(central, 0x0800);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0x0021);
    u32(central, crc);
    u32(central, dataBytes.length);
    u32(central, dataBytes.length);
    u16(central, nameBytes.length);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0);
    u32(central, 0);
    u32(central, offset);
    for (const b of nameBytes) central.push(b);
  }
  const centralOffset = out.length;
  for (const b of central) out.push(b);
  u32(out, 0x06054b50);
  u16(out, 0);
  u16(out, 0);
  u16(out, entries.length);
  u16(out, entries.length);
  u32(out, central.length);
  u32(out, centralOffset);
  u16(out, 0);
  return out;
}

function multipart(boundary, parts) {
  const out = [];
  const push = (bytes) => {
    for (const b of bytes) out.push(b);
  };
  for (const part of parts) {
    let header = `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"`;
    if (part.fileName) header += `; filename="${part.fileName}"\r\nContent-Type: ${part.contentType}`;
    header += '\r\n\r\n';
    push(utf8Bytes(header));
    push(part.bytes || utf8Bytes(part.value));
    push(utf8Bytes('\r\n'));
  }
  push(utf8Bytes(`--${boundary}--\r\n`));
  return out;
}

const dev = await getSkill(devSkillId, 'Dev');
const staging = await getSkill(stagingSkillId, 'Staging');

const supportingFiles = dev.files.filter((file) => file && typeof file.path === 'string' && file.path.toLowerCase() !== 'skill.md');
if (supportingFiles.length + 1 > MAX_FILES) {
  throw new Error(`Dev skill has more than ${MAX_FILES - 1} supporting files; the import limit is ${MAX_FILES}.`);
}

// Read every file before writing anything: the import replaces all stored files in Staging.
const entries = [];
const frontmatter = [
  '---',
  `name: ${JSON.stringify(staging.skill.name)}`,
  `slug: ${JSON.stringify(staging.skill.slug)}`,
  `description: ${JSON.stringify(dev.skill.description || '')}`,
  '---',
  '',
].join('\n');
entries.push({ name: 'SKILL.md', bytes: utf8Bytes(frontmatter + (dev.skill.instructions || '')) });
for (const file of supportingFiles) {
  entries.push({ name: file.path, bytes: utf8Bytes(await getSkillFile(devSkillId, file.path)) });
}

const integrationIds = (dev.skill.integrationIds || []).map((id) => (id === devIntegrationId ? stagingIntegrationId : id));
const boundary = `----LangdockSkillPromotion${Date.now().toString(16)}`;
const body = multipart(boundary, [
  { name: 'file', fileName: `${staging.skill.slug}.zip`, contentType: 'application/zip', bytes: zip(entries) },
  { name: 'fileType', value: 'zip' },
  { name: 'mode', value: 'upsert' },
  { name: 'integrationIds', value: JSON.stringify(integrationIds) },
]);

const importResponse = await ld.request({
  url: `${baseUrl}/skills/v1/import`,
  method: 'POST',
  headers: { ...authHeaders, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
  body: Buffer.from(body),
});
if (importResponse.status !== 200 && importResponse.status !== 201) {
  throw new Error(`Failed to import the skill into Staging (${importResponse.status}): ${formatError(importResponse)}`);
}

const warnings = [];
const imported = importResponse.json && importResponse.json.skill;
if (importResponse.status === 201 || !imported || imported.id !== stagingSkillId) {
  warnings.push(
    `The import created or updated skill "${imported ? imported.id : 'unknown'}" instead of the Staging skill "${stagingSkillId}". Check the skill list and delete any duplicate.`,
  );
}

const after = await getSkill(stagingSkillId, 'Staging');
if ((after.skill.instructions || '').trim() !== (dev.skill.instructions || '').trim()) {
  warnings.push('Staging instructions differ from Dev after the import. Open the Staging skill and compare.');
}
const afterPaths = new Set(after.files.map((file) => file.path));
const missingFiles = supportingFiles.map((file) => file.path).filter((path) => !afterPaths.has(path));
if (missingFiles.length > 0) {
  warnings.push(`These Dev files are not in Staging after the import: ${missingFiles.join(', ')}.`);
}

return {
  success: true,
  source: { id: dev.skill.id, name: dev.skill.name, slug: dev.skill.slug },
  destination: { id: staging.skill.id, name: staging.skill.name, slug: staging.skill.slug },
  filesCopied: supportingFiles.map((file) => file.path),
  integrationIds,
  warnings,
  preTransferStaging: {
    description: staging.skill.description,
    instructions: staging.skill.instructions,
    integrationIds: staging.skill.integrationIds,
    files: staging.files.map((file) => file.path),
  },
};
