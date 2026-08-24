// Admin-only ad hoc query over ckr_ Dataverse tables with structured column
// filters, for monitoring/reporting. Unlike the interview actions, this is NOT
// scoped to the caller's own interview — every row of the named table is in reach,
// so access control is whoever the connection is shared with. It IS restricted to
// ckr_ entities (see resolveEntity): the app-only credential can read the whole
// environment, and that prefix filter is the only thing keeping this action inside
// CKR. Field names and types are resolved live from EntityDefinitions/Attributes
// metadata; call admin_describe_schema first.

const MAX_TOP = 5000;
const DEFAULT_TOP = 200;
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeODataLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function label(labelObject) {
  return (labelObject && labelObject.UserLocalizedLabel && labelObject.UserLocalizedLabel.Label) || null;
}

// Bucket Dataverse's many attribute types down to the handful of value shapes
// this action knows how to filter on. null = readable via $select but not
// safe to build a $filter/$orderby clause against (unclear/unsupported type).
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
  // Pass the API body through unchanged. Do not rephrase, wrap, or invent a message.
  const code = status === null || status === undefined || status === '' ? 'not reported' : String(status);
  const message = detail === null || detail === undefined ? '' : String(detail);
  return `An error occurred while connecting to the knowledge retention system. Please contact your administrator. When you contact them, please pass on these details: the action that returned the error is "admin_query_records", the error code is ${code}, and the error returned by the API is: ${message}`;
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

// Matches on the entity's logical name or its entity-set (plural) name, so the
// caller need not know the singular/plural convention. Restricted to ckr_ entities
// (same rule as admin_describe_schema): the app-only credential can read every
// table in the environment, so without this the action reaches far outside CKR.
// Metadata $filter has no startswith, so the prefix is enforced client-side.
async function resolveEntity(data, token, tableInput) {
  const filter = `LogicalName eq '${escapeODataLiteral(tableInput)}' or EntitySetName eq '${escapeODataLiteral(tableInput)}'`;
  const result = await dvGet(data, token, `/EntityDefinitions?$select=LogicalName,EntitySetName,DisplayName&$filter=${encodeURIComponent(filter)}`);
  const matches = (result && result.value) || [];
  return matches.filter((entity) => typeof entity.LogicalName === 'string' && entity.LogicalName.startsWith('ckr_'));
}

async function fetchAttributes(data, token, logicalName) {
  const result = await dvGet(
    data,
    token,
    `/EntityDefinitions(LogicalName='${logicalName}')/Attributes?$select=LogicalName,AttributeType,DisplayName,RequiredLevel`,
  );
  return (result && result.value) || [];
}

// Live column map for one entity: field identifier (Dataverse logical name,
// or _{logicalname}_value for lookups) -> value type bucket. Every attribute
// is included (even unsupported ones, with type null) so $select can still
// return them; only filtering/sorting requires a non-null type.
function buildColumnMap(attributes) {
  const columnMap = {};
  for (const attribute of attributes) {
    const isLookup = attribute.AttributeType === 'Lookup' || attribute.AttributeType === 'Owner' || attribute.AttributeType === 'Customer';
    const field = isLookup ? `_${attribute.LogicalName}_value` : attribute.LogicalName;
    columnMap[field] = { queryColumn: field, type: mapAttributeType(attribute.AttributeType) };
  }
  return columnMap;
}

function resolveColumn(columnMap, entityLogicalName, friendlyName, context, { requireFilterable } = {}) {
  const column = columnMap[friendlyName];
  if (!column || (requireFilterable && !column.type)) {
    throw new Error(
      `Unknown or unfilterable ${context} field "${friendlyName}" on "${entityLogicalName}". Call admin_describe_schema with table="${entityLogicalName}" to see valid fields.`,
    );
  }
  return column;
}

function formatFilterClause(column, friendlyName, entityLogicalName, operator, rawValue) {
  const allowedOps = OPERATORS_BY_TYPE[column.type];
  if (!allowedOps.includes(operator)) {
    throw new Error(
      `Operator "${operator}" is not valid for field "${friendlyName}" (${entityLogicalName}, type ${column.type}). Valid operators: ${allowedOps.join(', ')}.`,
    );
  }
  const logical = column.queryColumn;
  if (column.type === 'string') {
    const literal = escapeODataLiteral(String(rawValue));
    if (operator === 'contains' || operator === 'startswith') {
      return `${operator}(${logical},'${literal}')`;
    }
    return `${logical} ${operator} '${literal}'`;
  }
  if (column.type === 'number') {
    const n = Number(rawValue);
    if (!Number.isFinite(n)) {
      throw new Error(`Value for field "${friendlyName}" must be a number, got "${rawValue}".`);
    }
    return `${logical} ${operator} ${n}`;
  }
  if (column.type === 'boolean') {
    const b = rawValue === true || rawValue === 'true';
    return `${logical} ${operator} ${b}`;
  }
  if (column.type === 'datetime') {
    const d = new Date(rawValue);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`Value for field "${friendlyName}" must be a valid date/time, got "${rawValue}".`);
    }
    return `${logical} ${operator} ${d.toISOString()}`;
  }
  // guid
  const guidValue = String(rawValue);
  if (!GUID_PATTERN.test(guidValue)) {
    throw new Error(`Value for field "${friendlyName}" must be a GUID, got "${rawValue}".`);
  }
  return `${logical} ${operator} ${guidValue}`;
}

// RFC4180: quote any cell containing a comma, quote, or newline; double embedded quotes.
function csvEscape(value) {
  const cell = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

function buildCsv(rows, columns) {
  const header = columns.map(csvEscape).join(',');
  const lines = [header];
  for (const row of rows) {
    lines.push(columns.map((column) => csvEscape(row[column])).join(','));
  }
  return lines.join('\r\n');
}

// Action body.
const tableInput = data.input.table;
if (!tableInput) {
  throw new Error(
    'table is required: the entity logical name (e.g. ckr_interview) or entity set name (e.g. ckr_interviews). Call admin_describe_schema first if you don\'t know it.',
  );
}

const token = await getToken(data, data.auth.dataverseUrl);
const entities = await resolveEntity(data, token, tableInput);
if (entities.length === 0) {
  throw new Error(`No CKR entity matches "${tableInput}". Call admin_describe_schema to list valid tables.`);
}
if (entities.length > 1) {
  throw new Error(`"${tableInput}" matches more than one entity (${entities.map((entity) => entity.LogicalName).join(', ')}). Use the exact logical name or entity set name.`);
}
const entity = entities[0];
const attributes = await fetchAttributes(data, token, entity.LogicalName);
const columnMap = buildColumnMap(attributes);

// $select: the caller's chosen fields, or every attribute on the entity when
// none are given (an admin monitoring tool defaults to "show me everything").
const requestedSelect = Array.isArray(data.input.select) && data.input.select.length > 0 ? data.input.select : Object.keys(columnMap);
const selectColumns = requestedSelect.map((fieldName) => ({
  fieldName,
  column: resolveColumn(columnMap, entity.LogicalName, fieldName, 'select'),
}));

// $filter: each clause built from the live field/type map above, never from a
// raw OData string the model might supply, so a bad field name or a
// mismatched operator/type fails loudly instead of silently matching nothing
// (or, worse, matching everything).
const filters = Array.isArray(data.input.filters) ? data.input.filters : [];
const filterClauses = filters.map((entry) => {
  if (!entry || typeof entry.field !== 'string' || typeof entry.operator !== 'string' || entry.value === undefined) {
    throw new Error('Each filter needs "field", "operator", and "value".');
  }
  const column = resolveColumn(columnMap, entity.LogicalName, entry.field, 'filter', { requireFilterable: true });
  return formatFilterClause(column, entry.field, entity.LogicalName, entry.operator, entry.value);
});

// $orderby: the caller's choice, or createdon when the entity has one (true
// of every CKR entity), or no ordering at all as a last resort.
const orderByFieldName = data.input.orderBy || (columnMap.createdon ? 'createdon' : null);
const orderColumn = orderByFieldName
  ? resolveColumn(columnMap, entity.LogicalName, orderByFieldName, 'orderBy', { requireFilterable: true })
  : null;
const orderDirection = data.input.orderDirection === 'asc' ? 'asc' : 'desc';

// $top, clamped to a sane ceiling regardless of what the model asks for.
const requestedTop = parseInt(data.input.top, 10);
const top = Math.min(Math.max(Number.isFinite(requestedTop) ? requestedTop : DEFAULT_TOP, 1), MAX_TOP);

const queryParts = [`$select=${selectColumns.map((entry) => entry.column.queryColumn).join(',')}`];
if (filterClauses.length > 0) {
  queryParts.push(`$filter=${encodeURIComponent(filterClauses.join(' and '))}`);
}
if (orderColumn) {
  queryParts.push(`$orderby=${orderColumn.queryColumn} ${orderDirection}`);
}
queryParts.push(`$top=${top}`);

const result = await dvGet(data, token, `/${entity.EntitySetName}?${queryParts.join('&')}`);
const rawRows = (result && result.value) || [];

const rows = rawRows.map((rawRow) => {
  const row = {};
  for (const { fieldName, column } of selectColumns) {
    row[fieldName] = rawRow[column.queryColumn] !== undefined ? rawRow[column.queryColumn] : null;
  }
  return row;
});

const appliedQuery = {
  entitySet: entity.EntitySetName,
  filter: filterClauses.length > 0 ? filterClauses.join(' and ') : null,
  orderBy: orderColumn ? `${orderColumn.queryColumn} ${orderDirection}` : null,
  top,
};

const exportAsCsv = data.input.exportAsCsv === true || data.input.exportAsCsv === 'true';
if (exportAsCsv) {
  if (rows.length === 0) {
    return { table: entity.LogicalName, count: 0, hasMore: false, query: appliedQuery, files: [], notices: ['No records matched the given filters; nothing to export.'] };
  }
  const csv = buildCsv(rows, selectColumns.map((entry) => entry.fieldName));
  return {
    table: entity.LogicalName,
    count: rows.length,
    hasMore: rows.length === top,
    query: appliedQuery,
    files: [{ fileName: `${entity.LogicalName}_export.csv`, mimeType: 'text/csv', text: csv }],
  };
}

return {
  table: entity.LogicalName,
  count: rows.length,
  hasMore: rows.length === top,
  query: appliedQuery,
  rows,
};
