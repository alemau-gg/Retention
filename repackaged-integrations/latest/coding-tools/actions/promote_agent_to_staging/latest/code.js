const devAgentId = data.input.devAgentId;
const stagingAgentId = data.input.stagingAgentId;
const devIntegrationId = data.input.devIntegrationId;
const stagingIntegrationId = data.input.stagingIntegrationId;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

for (const [label, value] of [
  ['Dev agent ID', devAgentId],
  ['Staging agent ID', stagingAgentId],
  ['Dev integration ID', devIntegrationId],
  ['Staging integration ID', stagingIntegrationId],
]) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new Error(`${label} must be a UUID`);
  }
}
if (devAgentId === stagingAgentId) {
  throw new Error('Dev and Staging agent IDs must be different.');
}
if (devIntegrationId === stagingIntegrationId) {
  throw new Error('Dev and Staging integration IDs must be different.');
}

const baseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');
const headers = { Authorization: `Bearer ${data.auth.apiKey}`, 'Content-Type': 'application/json' };

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

async function getAgent(agentId, label) {
  const response = await ld.request({
    url: `${baseUrl}/agent/v1/get?agentId=${encodeURIComponent(agentId)}`,
    method: 'GET',
    headers,
  });
  if (response.status !== 200) {
    throw new Error(`Failed to read ${label} agent "${agentId}" (${response.status}): ${formatError(response)}`);
  }
  const agent = response.json && response.json.agent;
  if (!agent || agent.id !== agentId) {
    throw new Error(`${label} agent response did not include the requested agent "${agentId}"`);
  }
  return agent;
}

async function getIntegrationActions(integrationId, label) {
  const response = await ld.request({
    url: `${baseUrl}/integrations/v1/${encodeURIComponent(integrationId)}`,
    method: 'GET',
    headers,
  });
  if (response.status !== 200) {
    throw new Error(`Failed to read ${label} integration "${integrationId}" (${response.status}): ${formatError(response)}`);
  }
  const integration = response.json && response.json.integration;
  if (!integration || integration.id !== integrationId || !Array.isArray(integration.actions)) {
    throw new Error(`${label} integration response did not include the requested integration "${integrationId}"`);
  }
  return integration.actions;
}

const dev = await getAgent(devAgentId, 'Dev');
const staging = await getAgent(stagingAgentId, 'Staging');
const devActions = await getIntegrationActions(devIntegrationId, 'Dev');
const stagingActions = await getIntegrationActions(stagingIntegrationId, 'Staging');
const devSlugById = new Map(devActions.map((action) => [action.id, action.slug]));
const stagingIdBySlug = new Map(stagingActions.map((action) => [action.slug, action.id]));

// Dev agent actions from the Dev integration point at the Staging action with the same slug.
// Actions from any other integration are shared and keep their IDs.
const missingInStaging = [];
const actions = [];
for (const action of dev.actions || []) {
  const slug = devSlugById.get(action.actionId);
  if (!slug) {
    actions.push({ actionId: action.actionId, requiresConfirmation: action.requiresConfirmation });
    continue;
  }
  const stagingActionId = stagingIdBySlug.get(slug);
  if (!stagingActionId) {
    missingInStaging.push(slug);
    continue;
  }
  actions.push({ actionId: stagingActionId, requiresConfirmation: action.requiresConfirmation });
}
if (missingInStaging.length > 0) {
  throw new Error(
    `The Staging integration has no action for these Dev agent actions: ${missingInStaging.join(', ')}. Promote the integration first. Nothing was changed.`,
  );
}

const update = {
  agentId: stagingAgentId,
  description: dev.description || '',
  instruction: dev.instruction || '',
  emoji: dev.emojiIcon || null,
  creativity: dev.temperature,
  conversationStarters: dev.conversationStarters || [],
  actions,
  webSearch: dev.webSearchEnabled,
  imageGeneration: dev.imageGenerationEnabled,
  extendedThinking: dev.extendedThinking,
};
if (dev.model) update.model = dev.model;

const updateResponse = await ld.request({
  url: `${baseUrl}/agent/v1/update`,
  method: 'PATCH',
  headers,
  body: JSON.stringify(update),
});
if (updateResponse.status !== 200) {
  throw new Error(`Failed to update the Staging agent (${updateResponse.status}): ${formatError(updateResponse)}`);
}

const publishResponse = await ld.request({
  url: `${baseUrl}/agent/v1/publish`,
  method: 'POST',
  headers,
  body: JSON.stringify({ agentId: stagingAgentId, description: 'Promoted from Dev' }),
});
let published;
if (publishResponse.status === 200) {
  published = true;
} else if (publishResponse.status === 409) {
  published = false;
} else {
  throw new Error(
    `The Staging agent draft was updated but publishing failed (${publishResponse.status}): ${formatError(publishResponse)}. Publish it from the Langdock UI.`,
  );
}

const warnings = [];
const after = await getAgent(stagingAgentId, 'Staging');
if ((after.instruction || '') !== (dev.instruction || '')) {
  warnings.push('The Staging instruction differs from Dev after the transfer. Open the Staging agent and compare.');
}
const afterActionIds = new Set((after.actions || []).map((action) => action.actionId));
const unattached = actions.filter((action) => !afterActionIds.has(action.actionId)).map((action) => action.actionId);
if (unattached.length > 0) {
  warnings.push(`These actions are not attached to the Staging agent after the transfer: ${unattached.join(', ')}.`);
}
if ((dev.inputFields || []).length > 0) {
  warnings.push('The Dev agent has form input fields; they are not copied. Update them in the Staging agent by hand.');
}
const sameIds = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
if (!sameIds(dev.knowledgeFolderIds, staging.knowledgeFolderIds) || !sameIds(dev.attachments, staging.attachments)) {
  warnings.push('Knowledge folders and attachments differ between Dev and Staging. They are left unchanged in Staging.');
}

return {
  success: true,
  source: { id: dev.id, name: dev.name },
  destination: { id: staging.id, name: staging.name },
  published,
  publishNote: published ? 'Published as a new Staging version.' : 'No changes to publish; Staging already matched.',
  actionsMapped: actions.length,
  warnings,
  preTransferStaging: {
    description: staging.description,
    instruction: staging.instruction,
    model: staging.model,
    temperature: staging.temperature,
    conversationStarters: staging.conversationStarters,
    actions: staging.actions,
    webSearchEnabled: staging.webSearchEnabled,
    imageGenerationEnabled: staging.imageGenerationEnabled,
    extendedThinking: staging.extendedThinking,
  },
};
