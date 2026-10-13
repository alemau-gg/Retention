// Discovers the CKR Dataverse schema live from EntityDefinitions/Attributes
// metadata (entities whose logical name starts with "ckr_"): tables, columns,
// their filterable types/operators, and choice option values. Read-only.
// Lets the caller learn admin_query_records's queryable fields, and the
// writable / writeField names admin_bulk_writeback needs, before calling them.

const MAX_ENTITIES_WITHOUT_FILTER = 10;

function escapeODataLiteral(value) {
  return String(value).replace(/'/g, "''");
}

// Dataverse metadata labels are { UserLocalizedLabel: { Label } }, not plain strings.
function label(labelObject) {
  return (labelObject && labelObject.UserLocalizedLabel && labelObject.UserLocalizedLabel.Label) || null;
}

// Bucket Dataverse's many attribute types down to the handful of value shapes
// admin_query_records knows how to filter on. null = readable via $select but
// not safe to build a $filter/$orderby clause against (unclear/unsupported).
function mapAttributeType(attributeType) {
  switch (attributeType) {
    case 'String':
    case 'Memo':
      return 'string';
    case 'Integer':
    case 'BigInt':
    case 'Double':
    case 'Decimal':
    case 'Money':
      return 'number';
    case 'Boolean':
      return 'boolean';
    case 'DateTime':
      return 'datetime';
    case 'Uniqueidentifier':
      return 'guid';
    case 'Lookup':
    case 'Owner':
    case 'Customer':
      return 'guid';
    case 'Picklist':
    case 'State':
    case 'Status':
      return 'number';
    default:
      return null;
  }
}

const OPERATORS_BY_TYPE = {
  string: ['eq', 'ne', 'contains', 'startswith'],
  number: ['eq', 'ne', 'gt', 'ge', 'lt', 'le'],
  boolean: ['eq', 'ne'],
  datetime: ['eq', 'ne', 'gt', 'ge', 'lt', 'le'],
  guid: ['eq', 'ne'],
};

// User-facing text for an API failure: keeps the "contact your administrator"
// guidance and hands over what the administrator needs — the failing action and
// what the API returned.
function failureMessage(status, detail) {
  const code = status === null || status === undefined || status === '' ? 'not reported' : String(status);
  const message = detail === null || detail === undefined ? '' : String(detail);
  if (status === 429 || Number(status) === 429) {
    return `The save or request was not completed due to temporary rate limiting. Please retry shortly. When you contact your administrator, please pass on these details: the action that returned the error is "admin_describe_schema", the error code is ${code}, and the error returned by the API is: ${message}`;
  }
  // Pass the API body through unchanged. Do not rephrase, wrap, or invent a message.
  return `An error occurred while connecting to the knowledge retention system. Please contact your administrator. When you contact them, please pass on these details: the action that returned the error is "admin_describe_schema", the error code is ${code}, and the error returned by the API is: ${message}`;
}

async function getToken(data, resource) {
  const response = await ld.request({
    url: `https://login.microsoftonline.com/${data.auth.tenantId}/oauth2/v2.0/token`,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: {
      client_id: data.auth.clientId,
      client_secret: data.auth.clientSecret,
      grant_type: 'client_credentials',
      scope: `${resource}/.default`,
    },
  });
  if (response.status !== 200 || !response.json || !response.json.access_token) {
    const detail =
      (response.json && (response.json.error_description || response.json.error)) || response.text || '';
    throw new Error(failureMessage(response.status, detail));
  }
  return response.json.access_token;
}

async function dvGet(data, token, path) {
  const response = await ld.request({
    url: `${data.auth.dataverseUrl}/api/data/v9.2${path}`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    },
  });
  if (response.status === 401 || response.status === 403) {
    const detail =
      (response.json && response.json.error && response.json.error.message) ||
      response.text ||
      '';
    throw new Error(failureMessage(response.status, detail));
  }
  if (response.status !== 200) {
    const detail = (response.json && response.json.error && response.json.error.message) || response.text || '';
    throw new Error(failureMessage(response.status, detail));
  }
  return response.json;
}

// Matches on the entity's logical name or its entity-set (plural) name, so callers
// need not know the singular/plural convention. Defaults to every ckr_ entity.
// Metadata $filter only supports equality (no startswith/contains), so the
// list-all path filters IsCustomEntity server-side and matches the ckr_ prefix client-side.
async function resolveEntities(data, token, tableInput) {
  if (tableInput) {
    const filter = `LogicalName eq '${escapeODataLiteral(tableInput)}' or EntitySetName eq '${escapeODataLiteral(tableInput)}'`;
    const result = await dvGet(data, token, `/EntityDefinitions?$select=LogicalName,EntitySetName,DisplayName&$filter=${encodeURIComponent(filter)}`);
    const matches = (result && result.value) || [];
    // Same ckr_ restriction as the list-all path below and as admin_query_records.
    // Without it, naming a table explicitly bypassed the allowlist and exposed the
    // schema of unrelated Dataverse tables the app-only credential can read.
    return matches.filter((entity) => typeof entity.LogicalName === 'string' && entity.LogicalName.startsWith('ckr_'));
  }
  const result = await dvGet(
    data,
    token,
    `/EntityDefinitions?$select=LogicalName,EntitySetName,DisplayName&$filter=${encodeURIComponent('IsCustomEntity eq true')}`,
  );
  const customEntities = (result && result.value) || [];
  return customEntities.filter((entity) => typeof entity.LogicalName === 'string' && entity.LogicalName.startsWith('ckr_'));
}

async function fetchAttributes(data, token, logicalName) {
  const result = await dvGet(
    data,
    token,
    `/EntityDefinitions(LogicalName='${logicalName}')/Attributes?$select=LogicalName,AttributeType,DisplayName,RequiredLevel,IsValidForUpdate`,
  );
  return (result && result.value) || [];
}

const OPTION_SET_CAST_TYPE = {
  Picklist: 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
  State: 'Microsoft.Dynamics.CRM.StateAttributeMetadata',
  Status: 'Microsoft.Dynamics.CRM.StatusAttributeMetadata',
};

// Best-effort: resolve human labels for choice values (e.g. ckr_topicstatus 30 =
// "Summarized"). Option-set/State/Status quirks vary by Dataverse version, so a
// failure here omits `options` rather than failing the whole describe call.
async function fetchOptionSetOptions(data, token, entityLogicalName, attribute) {
  const castType = OPTION_SET_CAST_TYPE[attribute.AttributeType];
  if (!castType) return null;
  try {
    const result = await dvGet(
      data,
      token,
      `/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${attribute.LogicalName}')/${castType}?$select=LogicalName&$expand=OptionSet`,
    );
    const options = result && result.OptionSet && result.OptionSet.Options;
    if (!Array.isArray(options)) return null;
    return options.map((option) => ({ value: option.Value, label: label(option.Label) }));
  } catch (error) {
    return null;
  }
}

async function describeEntity(data, token, entity) {
  const attributes = await fetchAttributes(data, token, entity.LogicalName);
  const columns = [];
  for (const attribute of attributes) {
    const bucket = mapAttributeType(attribute.AttributeType);
    const isLookup = attribute.AttributeType === 'Lookup' || attribute.AttributeType === 'Owner' || attribute.AttributeType === 'Customer';
    const field = isLookup ? `_${attribute.LogicalName}_value` : attribute.LogicalName;
    const column = {
      field,
      displayName: label(attribute.DisplayName),
      attributeType: attribute.AttributeType,
      type: bucket,
      operators: bucket ? OPERATORS_BY_TYPE[bucket] : [],
      writable: attribute.IsValidForUpdate === true,
    };
    // Read queries use _logicalname_value. admin_bulk_writeback needs the
    // attribute logical name (writeField), and it resolves the lookup target itself.
    if (isLookup) column.writeField = attribute.LogicalName;
    if (OPTION_SET_CAST_TYPE[attribute.AttributeType]) {
      const options = await fetchOptionSetOptions(data, token, entity.LogicalName, attribute);
      if (options) column.options = options;
    }
    columns.push(column);
  }
  return {
    table: entity.LogicalName,
    entitySetName: entity.EntitySetName,
    displayName: label(entity.DisplayName),
    columns,
  };
}

// Action body.
const tableInput = data.input.table;
const token = await getToken(data, data.auth.dataverseUrl);
const entities = await resolveEntities(data, token, tableInput);

if (entities.length === 0) {
  throw new Error(
    tableInput
      ? `No CKR entity matches "${tableInput}". Pass the entity logical name (e.g. ckr_interview) or entity set name (e.g. ckr_interviews), or omit table to list every ckr_ entity.`
      : 'No entities starting with "ckr_" were found in this Dataverse environment.',
  );
}

if (!tableInput && entities.length > MAX_ENTITIES_WITHOUT_FILTER) {
  return {
    tables: entities.map((entity) => ({ table: entity.LogicalName, entitySetName: entity.EntitySetName, displayName: label(entity.DisplayName) })),
    notice: `${entities.length} ckr_ entities exist; skipped fetching column detail for all of them to avoid an oversized response. Call again with a specific "table" to get its columns.`,
  };
}

const described = [];
for (const entity of entities) {
  described.push(await describeEntity(data, token, entity));
}

return tableInput ? described[0] : { tables: described };
