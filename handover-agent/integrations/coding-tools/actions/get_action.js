const integrationId = data.input.integrationId;
const actionId = data.input.actionId;
const configuredDevId = data.auth.devIntegrationId;
const configuredStagingId = data.auth.stagingIntegrationId;
const baseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CODE_LENGTH = 150000;
const MAX_INPUT_FIELDS = 250;

function requireUuid(value, label) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new Error(`${label} must be a UUID`);
  }
}

function requireTrustedIntegration(value) {
  requireUuid(value, 'Integration ID');
  if (!UUID_RE.test(configuredDevId || '') && !UUID_RE.test(configuredStagingId || '')) {
    throw new Error('No trusted Dev or Staging integration ID is configured; refusing an unallowlisted action lookup');
  }
  if (value !== configuredDevId && value !== configuredStagingId) {
    throw new Error('Integration ID is not the configured Dev or Staging integration');
  }
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

requireTrustedIntegration(integrationId);
requireUuid(actionId, 'Action ID');

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
const action = integration && Array.isArray(integration.actions)
  ? integration.actions.find((candidate) => candidate.id === actionId)
  : null;

if (!action) {
  throw new Error(`Action "${actionId}" was not found in integration "${integrationId}"`);
}
if (typeof action.code === 'string' && action.code.length > MAX_CODE_LENGTH) {
  throw new Error(`Action code exceeds the documented ${MAX_CODE_LENGTH}-character limit`);
}

return {
  integrationId,
  id: action.id,
  name: action.name,
  slug: action.slug,
  description: action.description,
  code: action.code ?? null,
  order: action.order,
  requiresConfirmation: action.requiresConfirmation,
  inputFields: Array.isArray(action.inputFields) ? action.inputFields.slice(0, MAX_INPUT_FIELDS) : [],
  inputFieldsTruncated: Array.isArray(action.inputFields) && action.inputFields.length > MAX_INPUT_FIELDS,
};
