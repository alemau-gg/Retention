const integrationId = data.input.integrationId;
const actionId = data.input.actionId;
const updateActionBaseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');

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

const integration = integrationResponse.json.integration;
const previousAction = (integration.actions || []).find((action) => action.id === actionId);
if (!previousAction) {
  throw new Error(`Action "${actionId}" was not found in integration "${integrationId}"`);
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

const updatedIntegration = updatedIntegrationResponse.json.integration;
const updatedAction = (updatedIntegration.actions || []).find((action) => action.id === actionId);
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