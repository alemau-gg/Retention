const devIntegrationId = data.input.devIntegrationId;
const stagingIntegrationId = data.input.stagingIntegrationId;
const sourceIntegrationId = stagingIntegrationId;
const destinationIntegrationId = devIntegrationId;

if (devIntegrationId === stagingIntegrationId) {
  throw new Error('Dev and Staging integration IDs must be different.');
}

const baseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');

function revertFormatError(response) {
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

async function revertGetIntegration(integrationId) {
  const response = await ld.request({
    url: `${baseUrl}/integrations/v1/${encodeURIComponent(integrationId)}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${data.auth.apiKey}`, 'Content-Type': 'application/json' },
  });
  if (response.status !== 200) {
    throw new Error(`Failed to read integration "${integrationId}" (${response.status}): ${revertFormatError(response)}`);
  }
  return response.json.integration;
}

function revertActionPayload(action) {
  return {
    name: action.name,
    description: action.description,
    code: action.code,
    inputFields: action.inputFields,
    requiresConfirmation: action.requiresConfirmation,
  };
}

function revertComparableAction(action) {
  return JSON.stringify(revertActionPayload(action));
}

async function revertCreateAction(integrationId, action) {
  const response = await ld.request({
    url: `${baseUrl}/integrations/v1/${encodeURIComponent(integrationId)}/actions/create`,
    method: 'POST',
    headers: { Authorization: `Bearer ${data.auth.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(revertActionPayload(action)),
  });
  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`Failed to create action "${action.slug}" (${response.status}): ${revertFormatError(response)}`);
  }
  return response.json.action;
}

async function revertUpdateAction(integrationId, action) {
  const response = await ld.request({
    url: `${baseUrl}/integrations/v1/${encodeURIComponent(integrationId)}/actions/${encodeURIComponent(action.id)}`,
    method: 'PUT',
    headers: { Authorization: `Bearer ${data.auth.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(revertActionPayload(action)),
  });
  if (response.status !== 200 && response.status !== 204) {
    throw new Error(`Failed to update action "${action.slug}" (${response.status}): ${revertFormatError(response)}`);
  }
}

async function revertDeleteAction(integrationId, action) {
  const response = await ld.request({
    url: `${baseUrl}/integrations/v1/${encodeURIComponent(integrationId)}/actions/${encodeURIComponent(action.id)}`,
    method: 'DELETE',
    headers: { Authorization: `Bearer ${data.auth.apiKey}`, 'Content-Type': 'application/json' },
  });
  if (response.status !== 200 && response.status !== 204) {
    throw new Error(`Failed to delete action "${action.slug}" (${response.status}): ${revertFormatError(response)}`);
  }
}


const source = await revertGetIntegration(sourceIntegrationId);
const destination = await revertGetIntegration(destinationIntegrationId);
const sourceActions = Array.isArray(source.actions) ? source.actions : [];
const destinationActions = Array.isArray(destination.actions) ? destination.actions : [];
const destinationBySlug = new Map(destinationActions.map((action) => [action.slug, action]));
const changes = [];

for (const sourceAction of sourceActions) {
  const destinationAction = destinationBySlug.get(sourceAction.slug);
  if (!destinationAction) {
    const created = await revertCreateAction(destinationIntegrationId, sourceAction);
    if (created.slug !== sourceAction.slug) {
      if (created.id) {
        await revertDeleteAction(destinationIntegrationId, created);
      }
      throw new Error(
        `Created action "${sourceAction.slug}" with generated slug "${created.slug}". Revert stopped because the slug could not be preserved.`,
      );
    }
    changes.push({ type: 'created', slug: sourceAction.slug, actionId: created.id });
    continue;
  }

  if (revertComparableAction(sourceAction) !== revertComparableAction(destinationAction)) {
    await revertUpdateAction(destinationIntegrationId, { ...sourceAction, id: destinationAction.id });
    changes.push({ type: 'updated', slug: sourceAction.slug, actionId: destinationAction.id });
  }
}

const sourceSlugs = new Set(sourceActions.map((action) => action.slug));
for (const destinationAction of destinationActions) {
  if (!sourceSlugs.has(destinationAction.slug)) {
    await revertDeleteAction(destinationIntegrationId, destinationAction);
    changes.push({ type: 'deleted', slug: destinationAction.slug, actionId: destinationAction.id });
  }
}

const after = await revertGetIntegration(destinationIntegrationId);
const afterActions = Array.isArray(after.actions) ? after.actions : [];
const afterBySlug = new Map(afterActions.map((action) => [action.slug, action]));
const missing = sourceActions.filter((action) => !afterBySlug.has(action.slug)).map((action) => action.slug);
const unexpected = afterActions.filter((action) => !sourceSlugs.has(action.slug)).map((action) => action.slug);
if (missing.length > 0 || unexpected.length > 0) {
  throw new Error(
    `Revert verification failed. Missing actions: ${missing.join(', ') || 'none'}. Unexpected actions: ${unexpected.join(', ') || 'none'}.`,
  );
}

return {
  success: true,
  source: 'Staging',
  destination: 'Dev',
  devIntegrationId,
  stagingIntegrationId,
  changes,
  changeCount: changes.length,
  preRevertDev: {
    integration: { id: destination.id, name: destination.name, description: destination.description },
    actions: destinationActions,
  },
  afterRevertDev: {
    integration: { id: after.id, name: after.name, description: after.description },
    actions: afterActions,
  },
  rollbackInstruction:
    'To restore the exact pre-revert Dev state, use the returned preRevertDev.actions as the source for confirmed action updates, creations, and deletions.',
};
