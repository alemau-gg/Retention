const integrationId = data.input.integrationId;
const actionId = data.input.actionId;
const baseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION_SLUG_RE = /^[a-z0-9_]{1,100}$/;
const MAX_CODE_LENGTH = 150000;
const MAX_INPUT_FIELDS = 250;
const MAX_TEXT_LENGTH = 2048;
const MAX_ERROR_LENGTH = 2000;

function requireUuid(value, label) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new Error(`${label} must be a UUID`);
  }
}

function boundedText(value, maxLength = MAX_TEXT_LENGTH) {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function safeError(value) {
  return boundedText(String(value).replace(
    /((?:api[_-]?key|authorization|client[_-]?secret|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*)(["']?)[^,\s"']+/gi,
    '$1$2[redacted]',
  ), MAX_ERROR_LENGTH);
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

function inputFieldDetail(field) {
  if (!field || typeof field !== 'object') {
    throw new Error('Action detail contained an invalid input-field definition');
  }
  return {
    slug: boundedText(field.slug, 128),
    label: boundedText(field.label, 256),
    type: boundedText(field.type, 64),
    description: boundedText(field.description, 1024),
    placeholder: boundedText(field.placeholder, 512),
    required: field.required,
    order: field.order,
    options: Array.isArray(field.options)
      ? field.options.slice(0, 250).map((option) => ({
        label: boundedText(option?.label, 256),
        value: boundedText(option?.value, 256),
      }))
      : null,
    allowMultiSelect: field.allowMultiSelect,
    contextActionId: field.contextActionId,
    jsonSchema: boundedText(field.jsonSchema, 20000),
  };
}

requireUuid(integrationId, 'Integration ID');
const hasActionId = typeof actionId === 'string' && actionId.length > 0;
const actionSlug = data.input.actionSlug;
const hasActionSlug = typeof actionSlug === 'string' && actionSlug.length > 0;
if (hasActionId === hasActionSlug) {
  throw new Error('Provide exactly one of Action ID or Action slug');
}
if (hasActionId) {
  requireUuid(actionId, 'Action ID');
}
if (hasActionSlug && !ACTION_SLUG_RE.test(actionSlug)) {
  throw new Error('Action slug must contain only lowercase letters, numbers, and underscores');
}

const response = await ld.request({
  url: `${baseUrl}/integrations/v1/${encodeURIComponent(integrationId)}`,
  method: 'GET',
  headers: {
    Authorization: `Bearer ${data.auth.apiKey}`,
    'Content-Type': 'application/json',
  },
});

if (response.status !== 200) {
  throw new Error(`Failed to get integration actions (${response.status}): ${formatError(response)}`);
}

const integration = response.json && response.json.integration;
if (!integration || integration.id !== integrationId) {
  throw new Error('Integration detail response did not match the requested integration');
}
if (!Array.isArray(integration.actions)) {
  throw new Error('Integration detail response did not include an actions array');
}
const action = integration && Array.isArray(integration.actions)
  ? integration.actions.find((candidate) => (
    hasActionId ? candidate.id === actionId : candidate.slug === actionSlug
  ))
  : null;

if (!action) {
  throw new Error(
    `Action "${hasActionId ? actionId : actionSlug}" was not found in integration "${integrationId}"`,
  );
}
if (action.code != null && typeof action.code !== 'string') {
  throw new Error('Action detail contained invalid code');
}
if (typeof action.code === 'string' && action.code.length > MAX_CODE_LENGTH) {
  throw new Error(`Action code exceeds the documented ${MAX_CODE_LENGTH}-character limit`);
}

return {
  integrationId,
  id: action.id,
  name: boundedText(action.name, 256),
  slug: boundedText(action.slug, 128),
  description: boundedText(action.description),
  code: action.code ?? null,
  order: action.order,
  requiresConfirmation: action.requiresConfirmation,
  inputFields: Array.isArray(action.inputFields)
    ? action.inputFields.slice(0, MAX_INPUT_FIELDS).map(inputFieldDetail)
    : [],
  inputFieldsTruncated: Array.isArray(action.inputFields) && action.inputFields.length > MAX_INPUT_FIELDS,
};
