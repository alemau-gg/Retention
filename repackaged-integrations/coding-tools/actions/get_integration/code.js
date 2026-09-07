const integrationId = data.input.integrationId;
const configuredDevId = data.auth.devIntegrationId;
const configuredStagingId = data.auth.stagingIntegrationId;
const baseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ACTIONS = 250;
const MAX_INPUT_FIELDS = 250;
const MAX_CODE_LENGTH = 150000;
const MAX_TEXT_LENGTH = 2048;
const MAX_ERROR_LENGTH = 2000;

function requireUuid(value, label) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new Error(`${label} must be a UUID`);
  }
}

function requireTrustedIntegration(value) {
  requireUuid(value, 'Integration ID');
  if (!UUID_RE.test(configuredDevId || '') && !UUID_RE.test(configuredStagingId || '')) {
    throw new Error('No trusted Dev or Staging integration ID is configured; refusing an unallowlisted integration lookup');
  }
  if (value !== configuredDevId && value !== configuredStagingId) {
    throw new Error('Integration ID is not the configured Dev or Staging integration');
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
    throw new Error('Integration detail contained an invalid input-field definition');
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

function actionDetail(action) {
  if (!action || typeof action !== 'object') {
    throw new Error('Integration detail contained an invalid action definition');
  }
  if (action.code != null && typeof action.code !== 'string') {
    throw new Error(`Action "${action.id}" contained invalid code`);
  }
  if (typeof action.code === 'string' && action.code.length > MAX_CODE_LENGTH) {
    throw new Error(`Action "${action.id}" code exceeds Langdock's documented ${MAX_CODE_LENGTH}-character limit`);
  }
  const inputFields = Array.isArray(action.inputFields) ? action.inputFields : [];
  return {
    id: action.id,
    name: boundedText(action.name, 256),
    slug: boundedText(action.slug, 128),
    description: boundedText(action.description),
    code: action.code ?? null,
    order: action.order,
    requiresConfirmation: action.requiresConfirmation,
    inputFields: inputFields.slice(0, MAX_INPUT_FIELDS).map(inputFieldDetail),
    inputFieldsTruncated: inputFields.length > MAX_INPUT_FIELDS,
  };
}

function triggerDetail(trigger) {
  if (!trigger || typeof trigger !== 'object') {
    throw new Error('Integration detail contained an invalid trigger definition');
  }
  return {
    id: trigger.id,
    name: boundedText(trigger.name, 256),
    slug: boundedText(trigger.slug, 128),
    description: boundedText(trigger.description),
  };
}

requireTrustedIntegration(integrationId);

const response = await ld.request({
  url: `${baseUrl}/integrations/v1/${encodeURIComponent(integrationId)}`,
  method: 'GET',
  headers: {
    Authorization: `Bearer ${data.auth.apiKey}`,
    'Content-Type': 'application/json',
  },
});

if (response.status !== 200) {
  throw new Error(`Failed to get integration (${response.status}): ${formatError(response)}`);
}

const integration = response.json && response.json.integration;
if (!integration || typeof integration !== 'object') {
  throw new Error('Integration detail response did not include an integration object');
}
if (integration.id !== integrationId) {
  throw new Error('Integration detail response did not match the requested integration');
}

const actions = Array.isArray(integration.actions) ? integration.actions : [];
const triggers = Array.isArray(integration.triggers) ? integration.triggers : [];
return {
  id: integration.id,
  name: boundedText(integration.name, 256),
  description: boundedText(integration.description),
  authType: boundedText(integration.authType, 64),
  integrationType: boundedText(integration.integrationType, 64),
  actions: actions.slice(0, MAX_ACTIONS).map(actionDetail),
  actionCount: actions.length,
  actionsTruncated: actions.length > MAX_ACTIONS,
  triggers: triggers.slice(0, MAX_ACTIONS).map(triggerDetail),
  triggersTruncated: triggers.length > MAX_ACTIONS,
};
