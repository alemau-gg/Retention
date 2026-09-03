const integrationId = data.input.integrationId;
const actionId = data.input.actionId;
const trustedDevIntegrationId = data.auth.devIntegrationId;
const updateActionBaseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CODE_LENGTH = 150000;

if (typeof integrationId !== 'string' || !UUID_RE.test(integrationId)) {
  throw new Error('Integration ID must be a UUID');
}
if (typeof actionId !== 'string' || !UUID_RE.test(actionId)) {
  throw new Error('Action ID must be a UUID');
}
if (!UUID_RE.test(trustedDevIntegrationId || '')) {
  throw new Error('No trusted Dev integration ID is configured; refusing an unallowlisted update');
}
if (integrationId !== trustedDevIntegrationId) {
  throw new Error('update_action only permits the configured Dev integration ID');
}

function updateActionFormatError(response) {
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

const integrationResponse = await ld.request({
  url: `${updateActionBaseUrl}/integrations/v1/${encodeURIComponent(integrationId)}`,
  method: 'GET',
  headers: {
    Authorization: `Bearer ${data.auth.apiKey}`,
    'Content-Type': 'application/json',
  },
});

if (integrationResponse.status !== 200) {
  throw new Error(
    `Failed to fetch the action before updating (${integrationResponse.status}): ${updateActionFormatError(integrationResponse)}`,
  );
}

const integration = integrationResponse.json && integrationResponse.json.integration;
if (!integration || integration.id !== integrationId || !Array.isArray(integration.actions)) {
  throw new Error('Integration response did not include the requested integration and its actions');
}
const previousAction = integration.actions.find((action) => action.id === actionId);
if (!previousAction) {
  throw new Error(`Action "${actionId}" was not found in integration "${integrationId}"`);
}
if (data.input.code != null && (
  typeof data.input.code !== 'string' || data.input.code.length > MAX_CODE_LENGTH
)) {
  throw new Error(`Action code must be at most ${MAX_CODE_LENGTH} characters`);
}

// Start from the live action so omitted fields cannot be lost when the API
// replaces the action configuration.
const previousPayload = {
  name: previousAction.name,
  description: previousAction.description,
  code: previousAction.code,
  inputFields: previousAction.inputFields,
  requiresConfirmation: previousAction.requiresConfirmation,
};
const body = { ...previousPayload };

if (data.input.name != null) {
  body.name = data.input.name;
}
if (data.input.description != null) {
  body.description = data.input.description;
}
if (data.input.code != null) {
  body.code = data.input.code;
}
if (data.input.inputFields != null) {
  body.inputFields = data.input.inputFields;
}
if (data.input.requiresConfirmation != null) {
  body.requiresConfirmation = data.input.requiresConfirmation;
}

const response = await ld.request({
  url: `${updateActionBaseUrl}/integrations/v1/${encodeURIComponent(integrationId)}/actions/${encodeURIComponent(actionId)}`,
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${data.auth.apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

if (response.status !== 200 && response.status !== 204) {
  throw new Error(`Failed to update action (${response.status}): ${updateActionFormatError(response)}`);
}

// Fetch the stored action after PUT so the result reflects what Langdock
// actually persisted, rather than trusting the request body.
const updatedIntegrationResponse = await ld.request({
  url: `${updateActionBaseUrl}/integrations/v1/${encodeURIComponent(integrationId)}`,
  method: 'GET',
  headers: {
    Authorization: `Bearer ${data.auth.apiKey}`,
    'Content-Type': 'application/json',
  },
});

if (updatedIntegrationResponse.status !== 200) {
  throw new Error(
    `Action was updated but could not be verified (${updatedIntegrationResponse.status}): ${updateActionFormatError(updatedIntegrationResponse)}`,
  );
}

const updatedIntegration = updatedIntegrationResponse.json && updatedIntegrationResponse.json.integration;
const updatedAction = updatedIntegration && Array.isArray(updatedIntegration.actions)
  ? updatedIntegration.actions.find((action) => action.id === actionId)
  : null;
if (!updatedAction) {
  throw new Error('Action was updated but was not present in the verification response');
}

return {
  success: true,
  integrationId,
  id: updatedAction.id,
  actionId,
  name: updatedAction.name,
  slug: updatedAction.slug,
  updatedAction,
  previousAction,
  rollbackPayload: {
    integrationId,
    actionId,
    ...previousPayload,
  },
};