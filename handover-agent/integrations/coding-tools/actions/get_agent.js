const agentId = data.input.agentId;
const baseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_INSTRUCTION_LENGTH = 100000;
const MAX_ACTIONS = 250;
const MAX_INPUT_FIELDS = 250;
const MAX_TEXT_LENGTH = 2048;
const MAX_ERROR_LENGTH = 2000;

if (typeof agentId !== 'string' || !UUID_RE.test(agentId)) {
  throw new Error('Agent ID must be a UUID');
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
    throw new Error('Agent detail contained an invalid input-field definition');
  }
  return {
    type: boundedText(field.type, 64),
    label: boundedText(field.label, 256),
    description: boundedText(field.description, 1024),
    required: field.required,
    order: field.order,
  };
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
if (agent.id !== agentId) {
  throw new Error('Agent detail response did not match the requested agent');
}
if (agent.instruction != null && typeof agent.instruction !== 'string') {
  throw new Error('Agent detail response contained invalid instructions');
}
if (typeof agent.instruction === 'string' && agent.instruction.length > MAX_INSTRUCTION_LENGTH) {
  throw new Error(`Agent instruction exceeds the ${MAX_INSTRUCTION_LENGTH}-character response bound`);
}

const actions = Array.isArray(agent.actions) ? agent.actions : [];
const inputFields = Array.isArray(agent.inputFields) ? agent.inputFields : [];
const conversationStarters = Array.isArray(agent.conversationStarters)
  ? agent.conversationStarters
  : [];
const attachments = Array.isArray(agent.attachments) ? agent.attachments : [];
const knowledgeFolderIds = Array.isArray(agent.knowledgeFolderIds) ? agent.knowledgeFolderIds : [];
return {
  id: agent.id,
  name: boundedText(agent.name, 256),
  description: boundedText(agent.description, 1024),
  instruction: agent.instruction ?? null,
  emojiIcon: boundedText(agent.emojiIcon, 32),
  model: boundedText(agent.model, 256),
  temperature: agent.temperature,
  conversationStarters: conversationStarters.slice(0, 50).map((starter) => boundedText(starter, 2048)),
  conversationStartersTruncated: conversationStarters.length > 50,
  inputType: agent.inputType,
  webSearchEnabled: agent.webSearchEnabled,
  imageGenerationEnabled: agent.imageGenerationEnabled,
  canvasEnabled: agent.canvasEnabled,
  extendedThinking: agent.extendedThinking,
  actions: actions.slice(0, MAX_ACTIONS).map((action) => {
    if (!action || typeof action !== 'object') {
      throw new Error('Agent detail contained an invalid action definition');
    }
    return {
      actionId: action.actionId,
      requiresConfirmation: action.requiresConfirmation,
    };
  }),
  actionsTruncated: actions.length > MAX_ACTIONS,
  inputFields: inputFields.slice(0, MAX_INPUT_FIELDS).map(inputFieldDetail),
  inputFieldsTruncated: inputFields.length > MAX_INPUT_FIELDS,
  attachments: attachments.slice(0, MAX_ACTIONS),
  attachmentsTruncated: attachments.length > MAX_ACTIONS,
  knowledgeFolderIds: knowledgeFolderIds.slice(0, MAX_ACTIONS),
  knowledgeFolderIdsTruncated: knowledgeFolderIds.length > MAX_ACTIONS,
  createdAt: agent.createdAt,
  updatedAt: agent.updatedAt,
  owner: agent.owner && typeof agent.owner === 'object'
    ? {
      id: agent.owner.id,
      name: boundedText(agent.owner.name, 256),
      email: boundedText(agent.owner.email, 320),
    }
    : null,
  note: 'Langdock returns the active published version, or the current draft when it has never been published. The documented Agent API exposes get-by-ID, not a workspace-wide list_agents endpoint.',
};
