const baseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');
const MAX_INTEGRATIONS = 100;
const MAX_ACTIONS_PER_INTEGRATION = 250;

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

function actionSummary(action) {
  return {
    id: action.id,
    name: action.name,
    description: action.description,
    kind: action.kind,
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
  const actions = Array.isArray(integration.actions) ? integration.actions : [];
  return {
    id: integration.id,
    name: integration.name,
    description: integration.description,
    iconUrl: integration.iconUrl ?? null,
    authType: integration.authType,
    buildByLangdock: integration.buildByLangdock,
    integrationType: integration.integrationType,
    serverUrl: integration.serverUrl ?? null,
    agentCardUrl: integration.agentCardUrl ?? null,
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
