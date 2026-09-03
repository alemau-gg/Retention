const agentId = data.input.agentId;
const trustedAgentId = data.auth.trustedAgentId;
const baseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_INSTRUCTION_LENGTH = 100000;
const MAX_ACTIONS = 250;

if (typeof agentId !== 'string' || !UUID_RE.test(agentId)) {
  throw new Error('Agent ID must be a UUID');
}
if (!UUID_RE.test(trustedAgentId || '')) {
  throw new Error('No trusted handover agent ID is configured; refusing an unallowlisted agent lookup');
}
if (agentId !== trustedAgentId) {
  throw new Error('get_agent only permits the configured trusted handover agent ID');
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

const response = await ld.request({
  url: `${baseUrl}/agent/v1/get?agentId=${encodeURIComponent(agentId)}`,
  method: 'GET',
  headers: {
    Authorization: `Bearer ${data.auth.apiKey}`,
    'Content-Type': 'application/json',
  },
});

if (response.status !== 200) {
  throw new Error(`Failed to get agent (${response.status}): ${formatError(response)}`);
}

const agent = response.json && response.json.agent;
if (!agent || typeof agent !== 'object') {
  throw new Error('Agent detail response did not include an agent object');
}
if (typeof agent.instruction === 'string' && agent.instruction.length > MAX_INSTRUCTION_LENGTH) {
  throw new Error(`Agent instruction exceeds the ${MAX_INSTRUCTION_LENGTH}-character response bound`);
}

const actions = Array.isArray(agent.actions) ? agent.actions : [];
const conversationStarters = Array.isArray(agent.conversationStarters)
  ? agent.conversationStarters
  : [];
const attachments = Array.isArray(agent.attachments) ? agent.attachments : [];
const knowledgeFolderIds = Array.isArray(agent.knowledgeFolderIds) ? agent.knowledgeFolderIds : [];
return {
  id: agent.id,
  name: agent.name,
  description: agent.description ?? null,
  instruction: agent.instruction ?? null,
  emojiIcon: agent.emojiIcon ?? null,
  model: agent.model ?? null,
  temperature: agent.temperature,
  conversationStarters: conversationStarters.slice(0, 50),
  conversationStartersTruncated: conversationStarters.length > 50,
  inputType: agent.inputType,
  webSearchEnabled: agent.webSearchEnabled,
  imageGenerationEnabled: agent.imageGenerationEnabled,
  canvasEnabled: agent.canvasEnabled,
  extendedThinking: agent.extendedThinking,
  actions: actions.slice(0, MAX_ACTIONS),
  actionsTruncated: actions.length > MAX_ACTIONS,
  attachments: attachments.slice(0, MAX_ACTIONS),
  attachmentsTruncated: attachments.length > MAX_ACTIONS,
  knowledgeFolderIds: knowledgeFolderIds.slice(0, MAX_ACTIONS),
  knowledgeFolderIdsTruncated: knowledgeFolderIds.length > MAX_ACTIONS,
  createdAt: agent.createdAt,
  updatedAt: agent.updatedAt,
  note: 'The Agent API exposes get-by-ID but no documented workspace-wide list_agents endpoint.',
};
