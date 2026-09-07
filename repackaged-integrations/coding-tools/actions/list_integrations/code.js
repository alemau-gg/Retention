const baseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');
const MAX_INTEGRATIONS = 100;
const MAX_ACTIONS_PER_INTEGRATION = 250;
const MAX_TEXT_LENGTH = 2048;
const MAX_ERROR_LENGTH = 2000;

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

function actionSummary(action) {
  if (!action || typeof action !== 'object') {
    throw new Error('Integration catalog contained an invalid action summary');
  }
  return {
    id: action.id,
    name: boundedText(action.name, 256),
    description: boundedText(action.description),
    kind: boundedText(action.kind, 32),
    requiresConfirmation: action.requiresConfirmation,
  };
}

const response = await ld.request({
  url: `${baseUrl}/integrations/v1/get`,
  method: 'GET',
  headers: {
    Authorization: `Bearer ${data.auth.apiKey}`,
    'Content-Type': 'application/json',
  },
});

if (response.status !== 200) {
  throw new Error(`Failed to list integrations (${response.status}): ${formatError(response)}`);
}

const integrations = response.json && response.json.integrations;
if (!Array.isArray(integrations)) {
  throw new Error('Integration catalog response did not include an integrations array');
}

const bounded = integrations.slice(0, MAX_INTEGRATIONS).map((integration) => {
  if (!integration || typeof integration !== 'object') {
    throw new Error('Integration catalog contained an invalid integration entry');
  }
  const actions = Array.isArray(integration.actions) ? integration.actions : [];
  return {
    id: integration.id,
    name: boundedText(integration.name, 256),
    description: boundedText(integration.description),
    iconUrl: boundedText(integration.iconUrl, 4096),
    authType: boundedText(integration.authType, 64),
    buildByLangdock: integration.buildByLangdock,
    integrationType: boundedText(integration.integrationType, 64),
    serverUrl: boundedText(integration.serverUrl, 4096),
    agentCardUrl: boundedText(integration.agentCardUrl, 4096),
    actions: actions.slice(0, MAX_ACTIONS_PER_INTEGRATION).map(actionSummary),
    actionCount: actions.length,
    actionsTruncated: actions.length > MAX_ACTIONS_PER_INTEGRATION,
  };
});

return {
  integrations: bounded,
  integrationCount: integrations.length,
  truncated: integrations.length > MAX_INTEGRATIONS,
  limit: MAX_INTEGRATIONS,
  note: 'This catalog contains only private API, MCP, and A2A integrations shared with the configured API key.',
};
