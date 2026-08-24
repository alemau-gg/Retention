const integrationId = data.input.integrationId;
const verifyHelpersBaseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');
const helperStart = 'const KnowledgeRetentionUtils = {';
const helperEnd = '\n};\n';
const actionSlugPattern = /ACTION_SLUG: '([a-z_]+)',/;
const forbidden = ['require(', 'import ', 'module.exports', 'exports.'];
const adminSlugs = new Set([
  'admin_describe_schema',
  'admin_query_records',
  'admin_spike_joined_read',
  'admin_spike_batch_create',
]);

function verifyHelpersFormatError(response) {
  const json = response.json;
  if (!json) return response.text || response.error || 'Unknown error';
  if (Array.isArray(json.errors)) {
    const details = json.errors.map((error) => error.message).filter(Boolean).join(', ');
    if (details) return details;
  }
  const detail = json.message || json.error;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((issue) => issue?.message).filter(Boolean).join(', ');
    if (messages) return messages;
  }
  return JSON.stringify(detail || json);
}

const response = await ld.request({
  url: `${verifyHelpersBaseUrl}/integrations/v1/${encodeURIComponent(integrationId)}`,
  method: 'GET',
  headers: {
    Authorization: `Bearer ${data.auth.apiKey}`,
    'Content-Type': 'application/json',
  },
});

if (response.status !== 200) {
  throw new Error(`Failed to get integration (${response.status}): ${verifyHelpersFormatError(response)}`);
}

const integration = response.json.integration;
const actions = integration && integration.actions;
const blockers = [];
const report = [];

if (!Array.isArray(actions)) {
  throw new Error('Integration response did not include an actions array');
}

const actionBySlug = new Map(actions.map((action) => [action.slug, action]));
const canonical = actionBySlug.get('get_runtime_state');
let canonicalNormalized = null;
if (!canonical || typeof canonical.code !== 'string') {
  blockers.push('get_runtime_state is missing or has no code');
} else {
  for (const token of forbidden) {
    if (canonical.code.includes(token)) {
      blockers.push(`get_runtime_state contains forbidden module syntax: ${token}`);
    }
  }
  const start = canonical.code.indexOf(helperStart);
  const end = canonical.code.indexOf(helperEnd, start);
  if (start < 0 || end < 0) {
    blockers.push('get_runtime_state has no complete KnowledgeRetentionUtils block');
  } else {
    const helper = canonical.code.slice(start, end + helperEnd.length);
    const slugMatch = helper.match(actionSlugPattern);
    if (!slugMatch || slugMatch[1] !== 'get_runtime_state') {
      blockers.push('get_runtime_state has an invalid ACTION_SLUG');
    }
    canonicalNormalized = helper.replace(actionSlugPattern, "ACTION_SLUG: '<slug>',");
  }
}

for (const action of actions) {
  if (adminSlugs.has(action.slug) || action.slug.startsWith('admin_')) {
    report.push({ slug: action.slug, status: 'skipped', detail: 'admin action' });
    continue;
  }
  if (typeof action.code !== 'string') {
    blockers.push(`${action.slug}: action has no code`);
    report.push({ slug: action.slug, status: 'error', detail: 'no code' });
    continue;
  }

  for (const token of forbidden) {
    if (action.code.includes(token)) {
      blockers.push(`${action.slug}: contains forbidden module syntax: ${token}`);
    }
  }

  const start = action.code.indexOf(helperStart);
  const end = action.code.indexOf(helperEnd, start);
  if (start < 0 || end < 0) {
    blockers.push(`${action.slug}: no complete KnowledgeRetentionUtils block`);
    report.push({ slug: action.slug, status: 'error', detail: 'no helper block' });
    continue;
  }

  const helper = action.code.slice(start, end + helperEnd.length);
  const slugMatch = helper.match(actionSlugPattern);
  if (!slugMatch || slugMatch[1] !== action.slug) {
    blockers.push(`${action.slug}: ACTION_SLUG does not match action slug`);
  }

  const normalized = helper.replace(actionSlugPattern, "ACTION_SLUG: '<slug>',");
  if (canonicalNormalized && normalized !== canonicalNormalized) {
    blockers.push(`${action.slug}: helper differs from get_runtime_state`);
    report.push({ slug: action.slug, status: 'drift' });
  } else {
    report.push({ slug: action.slug, status: 'ok' });
  }
}

return {
  integrationId,
  ok: blockers.length === 0,
  actionCount: actions.length,
  report,
  blockers,
  instruction:
    blockers.length === 0
      ? 'All helper checks passed on a fresh integration fetch.'
      : 'Do not treat the integration as verified. Resolve every blocker and run this check again.',
};
