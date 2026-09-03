const devIntegrationId = data.input.devIntegrationId;
const stagingIntegrationId = data.input.stagingIntegrationId;
const trustedDevIntegrationId = data.auth.devIntegrationId;
const trustedStagingIntegrationId = data.auth.stagingIntegrationId;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION_SLUG_RE = /^[a-zA-Z0-9_-]{1,100}$/;
const MAX_ACTIONS = 250;
const MAX_CODE_LENGTH = 150000;

if (
  typeof devIntegrationId !== 'string' ||
  !UUID_RE.test(devIntegrationId) ||
  typeof stagingIntegrationId !== 'string' ||
  !UUID_RE.test(stagingIntegrationId)
) {
  throw new Error('Dev and Staging integration IDs must be UUIDs');
}
if (!UUID_RE.test(trustedDevIntegrationId || '') || !UUID_RE.test(trustedStagingIntegrationId || '')) {
  throw new Error('Trusted Dev and Staging integration IDs are not configured; refusing an unallowlisted promotion');
}
if (devIntegrationId !== trustedDevIntegrationId || stagingIntegrationId !== trustedStagingIntegrationId) {
  throw new Error('Promotion IDs must exactly match the configured trusted Dev and Staging integrations');
}
if (devIntegrationId === stagingIntegrationId) {
  throw new Error('Dev and Staging integration IDs must be different.');
}

const baseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');

function promoteFormatError(response) {
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

async function promoteGetIntegration(integrationId) {
  const response = await ld.request({
    url: `${baseUrl}/integrations/v1/${encodeURIComponent(integrationId)}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${data.auth.apiKey}`, 'Content-Type': 'application/json' },
  });
  if (response.status !== 200) {
    throw new Error(`Failed to read integration "${integrationId}" (${response.status}): ${promoteFormatError(response)}`);
  }
  const integration = response.json && response.json.integration;
  if (!integration || integration.id !== integrationId || !Array.isArray(integration.actions)) {
    throw new Error(`Integration response did not include the requested integration "${integrationId}"`);
  }
  return integration;
}

function validateIntegrationActions(integration, label) {
  if (integration.actions.length > MAX_ACTIONS) {
    throw new Error(`${label} contains more than the safe ${MAX_ACTIONS}-action limit`);
  }
  const slugs = new Set();
  for (const action of integration.actions) {
    if (
      !action ||
      typeof action.id !== 'string' ||
      !UUID_RE.test(action.id) ||
      typeof action.slug !== 'string' ||
      !ACTION_SLUG_RE.test(action.slug)
    ) {
      throw new Error(`${label} contains an action without a valid UUID ID or safe slug`);
    }
    if (slugs.has(action.slug)) {
      throw new Error(`${label} contains duplicate action slug "${action.slug}"`);
    }
    slugs.add(action.slug);
    if (typeof action.code === 'string' && action.code.length > MAX_CODE_LENGTH) {
      throw new Error(`${label} action "${action.slug}" exceeds Langdock's ${MAX_CODE_LENGTH}-character code limit`);
    }
  }
  return integration.actions;
}

function promoteActionPayload(action) {
  return {
    name: action.name,
    description: action.description,
    code: action.code,
    inputFields: action.inputFields,
    requiresConfirmation: action.requiresConfirmation,
  };
}

function promoteComparableAction(action) {
  return JSON.stringify(promoteActionPayload(action));
}

async function promoteCreateAction(integrationId, action) {
  const response = await ld.request({
    url: `${baseUrl}/integrations/v1/${encodeURIComponent(integrationId)}/actions/create`,
    method: 'POST',
    headers: { Authorization: `Bearer ${data.auth.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(promoteActionPayload(action)),
  });
  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`Failed to create action "${action.slug}" (${response.status}): ${promoteFormatError(response)}`);
  }
  const created = response.json && response.json.action;
  if (!created || typeof created.id !== 'string' || !UUID_RE.test(created.id) || created.slug !== action.slug) {
    throw new Error(`Created action "${action.slug}" did not return a valid matching action`);
  }
  return created;
}

async function promoteUpdateAction(integrationId, action) {
  const response = await ld.request({
    url: `${baseUrl}/integrations/v1/${encodeURIComponent(integrationId)}/actions/${encodeURIComponent(action.id)}`,
    method: 'PUT',
    headers: { Authorization: `Bearer ${data.auth.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(promoteActionPayload(action)),
  });
  if (response.status !== 200 && response.status !== 204) {
    throw new Error(`Failed to update action "${action.slug}" (${response.status}): ${promoteFormatError(response)}`);
  }
}

async function promoteDeleteAction(integrationId, action) {
  const response = await ld.request({
    url: `${baseUrl}/integrations/v1/${encodeURIComponent(integrationId)}/actions/${encodeURIComponent(action.id)}`,
    method: 'DELETE',
    headers: { Authorization: `Bearer ${data.auth.apiKey}`, 'Content-Type': 'application/json' },
  });
  if (response.status !== 200 && response.status !== 204) {
    throw new Error(`Failed to delete action "${action.slug}" (${response.status}): ${promoteFormatError(response)}`);
  }
}


const dev = await promoteGetIntegration(devIntegrationId);
const staging = await promoteGetIntegration(stagingIntegrationId);
const devActions = validateIntegrationActions(dev, 'Dev integration');
const stagingActions = validateIntegrationActions(staging, 'Staging integration');
const stagingBySlug = new Map(stagingActions.map((action) => [action.slug, action]));
const changes = [];

for (const sourceAction of devActions) {
  const destinationAction = stagingBySlug.get(sourceAction.slug);
  if (!destinationAction) {
    const created = await promoteCreateAction(stagingIntegrationId, sourceAction);
    if (created.slug !== sourceAction.slug) {
      if (created.id) {
        await promoteDeleteAction(stagingIntegrationId, created);
      }
      throw new Error(
        `Created action "${sourceAction.slug}" with generated slug "${created.slug}". Promotion stopped because the slug could not be preserved.`,
      );
    }
    changes.push({ type: 'created', slug: sourceAction.slug, actionId: created.id });
    continue;
  }

  if (promoteComparableAction(sourceAction) !== promoteComparableAction(destinationAction)) {
    await promoteUpdateAction(stagingIntegrationId, { ...sourceAction, id: destinationAction.id });
    changes.push({ type: 'updated', slug: sourceAction.slug, actionId: destinationAction.id });
  }
}

const devSlugs = new Set(devActions.map((action) => action.slug));
for (const destinationAction of stagingActions) {
  if (!devSlugs.has(destinationAction.slug)) {
    await promoteDeleteAction(stagingIntegrationId, destinationAction);
    changes.push({ type: 'deleted', slug: destinationAction.slug, actionId: destinationAction.id });
  }
}

const after = await promoteGetIntegration(stagingIntegrationId);
const afterActions = validateIntegrationActions(after, 'Post-promotion Staging integration');
const afterBySlug = new Map(afterActions.map((action) => [action.slug, action]));
const missing = devActions.filter((action) => !afterBySlug.has(action.slug)).map((action) => action.slug);
const unexpected = afterActions.filter((action) => !devSlugs.has(action.slug)).map((action) => action.slug);
const changed = devActions
  .filter((action) => afterBySlug.has(action.slug))
  .filter((action) => promoteComparableAction(action) !== promoteComparableAction(afterBySlug.get(action.slug)))
  .map((action) => action.slug);
if (missing.length > 0 || unexpected.length > 0 || changed.length > 0) {
  throw new Error(
    `Promotion verification failed. Missing actions: ${missing.join(', ') || 'none'}. Unexpected actions: ${unexpected.join(', ') || 'none'}. Changed actions: ${changed.join(', ') || 'none'}.`,
  );
}

return {
  success: true,
  source: 'Dev',
  destination: 'Staging',
  devIntegrationId,
  stagingIntegrationId,
  changes,
  changeCount: changes.length,
  prePromotionStaging: {
    integration: { id: staging.id, name: staging.name, description: staging.description },
    actions: stagingActions,
  },
  afterPromotionStaging: {
    integration: { id: after.id, name: after.name, description: after.description },
    actions: afterActions,
  },
  rollbackInstruction:
    'To restore the exact pre-promotion Staging state, use the returned prePromotionStaging.actions as the source for confirmed action updates, creations, and deletions.',
};
