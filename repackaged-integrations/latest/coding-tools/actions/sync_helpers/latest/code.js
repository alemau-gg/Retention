const integrationId = data.input.integrationId;
const syncHelpersBaseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');
const helperStart = 'const KnowledgeRetentionUtils = {';
const helperEnd = '\n};\n';
const actionSlugPattern = /ACTION_SLUG: '([a-z_]+)',/;
const adminSlugs = new Set(['admin_describe_schema', 'admin_query_records']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (typeof integrationId !== 'string' || !UUID_RE.test(integrationId)) {
  throw new Error('Integration ID must be a UUID');
}
function syncHelpersFormatError(response) {
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
  url: `${syncHelpersBaseUrl}/integrations/v1/${encodeURIComponent(integrationId)}`,
  method: 'GET',
  headers: {
    Authorization: `Bearer ${data.auth.apiKey}`,
    'Content-Type': 'application/json',
  },
});

if (response.status !== 200) {
  throw new Error(`Failed to get integration (${response.status}): ${syncHelpersFormatError(response)}`);
}

const integration = response.json && response.json.integration;
if (!integration || integration.id !== integrationId) {
  throw new Error('Integration response did not match the requested Dev integration');
}
const actions = integration.actions;
if (!Array.isArray(actions)) {
  throw new Error('Integration response did not include an actions array');
}

const actionBySlug = new Map(actions.map((action) => [action.slug, action]));
const canonical = actionBySlug.get('get_runtime_state');
if (!canonical || typeof canonical.code !== 'string') {
  throw new Error('Canonical action get_runtime_state is missing or has no code');
}

const canonicalStart = canonical.code.indexOf(helperStart);
const canonicalEnd = canonical.code.indexOf(helperEnd, canonicalStart);
if (canonicalStart < 0 || canonicalEnd < 0) {
  throw new Error('Canonical action get_runtime_state has no complete KnowledgeRetentionUtils block');
}

const canonicalHelper = canonical.code.slice(canonicalStart, canonicalEnd + helperEnd.length);
const canonicalSlug = canonicalHelper.match(actionSlugPattern);
if (!canonicalSlug || canonicalSlug[1] !== 'get_runtime_state') {
  throw new Error('Canonical helper has an invalid ACTION_SLUG');
}

const updates = [];
const skipped = [];
const blockers = [];

for (const action of actions) {
  if (adminSlugs.has(action.slug) || action.slug.startsWith('admin_')) {
    skipped.push({ slug: action.slug, reason: 'admin action' });
    continue;
  }
  if (action.slug === 'get_runtime_state') {
    continue;
  }
  if (typeof action.code !== 'string') {
    blockers.push(`${action.slug}: action has no code`);
    continue;
  }

  const start = action.code.indexOf(helperStart);
  const end = action.code.indexOf(helperEnd, start);
  if (start < 0 || end < 0) {
    blockers.push(`${action.slug}: no complete KnowledgeRetentionUtils block`);
    continue;
  }

  const currentHelper = action.code.slice(start, end + helperEnd.length);
  const replacement = canonicalHelper.replace(actionSlugPattern, `ACTION_SLUG: '${action.slug}',`);
  if (replacement === currentHelper) {
    skipped.push({ slug: action.slug, reason: 'already synchronized' });
    continue;
  }

  updates.push({
    actionId: action.id,
    slug: action.slug,
    payload: {
      name: action.name,
      description: action.description,
      code: action.code.slice(0, start) + replacement + action.code.slice(end + helperEnd.length),
      inputFields: action.inputFields,
      requiresConfirmation: action.requiresConfirmation,
    },
  });
}

return {
  integrationId,
  canonicalSlug: 'get_runtime_state',
  updates,
  skipped,
  blockers,
  requiresConfirmationBeforeWrite: updates.length > 0,
  instruction:
    updates.length > 0
      ? 'Review the proposed updates with the user and obtain explicit confirmation before calling update_action for any update.'
      : 'No helper updates are required.',
};
