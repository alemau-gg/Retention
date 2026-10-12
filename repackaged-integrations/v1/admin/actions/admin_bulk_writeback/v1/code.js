// Admin bulk writeback for CKR Dataverse rows. Not used by the employee interview.
// Validates the whole payload before any write. Groups by table, merges the same
// id, and sends one UpdateMultiple request per table per 1000-row chunk. If that
// action is missing, falls back to one $batch changeset per chunk — never one
// PATCH request per row.

const MAX_ROWS = 5000;
const CHUNK_SIZE = 1000;
const MAX_RATE_LIMIT_RETRIES = 3;
const RETRY_FALLBACK_SECONDS = 2;
const MAX_WAIT_MS = 30000;
const MAX_ERRORS = 30;
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const READ_LOOKUP_PATTERN = /^_.+_value$/i;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
const ROW_KEYS = new Set(['table', 'id', 'values']);

const LOOKUP_TYPES = new Set(['Lookup', 'Owner', 'Customer']);
const LOOKUP_CAST = {
  Lookup: 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
  Owner: 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
  Customer: 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
};

function escapeODataLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function failureMessage(status, detail) {
  const code = status === null || status === undefined || status === '' ? 'not reported' : String(status);
  const message = detail === null || detail === undefined ? '' : String(detail);
  if (status === 429 || Number(status) === 429) {
    return `The save or request was not completed due to temporary rate limiting. Please retry shortly. When you contact your administrator, please pass on these details: the action that returned the error is "admin_bulk_writeback", the error code is ${code}, and the error returned by the API is: ${message}`;
  }
  return `An error occurred while connecting to the knowledge retention system. Please contact your administrator. When you contact them, please pass on these details: the action that returned the error is "admin_bulk_writeback", the error code is ${code}, and the error returned by the API is: ${message}`;
}

function responseDetail(response) {
  if (response && response.json && response.json.error && response.json.error.message) {
    return String(response.json.error.message);
  }
  if (response && response.text) return String(response.text);
  if (response && response.json) {
    try {
      return JSON.stringify(response.json);
    } catch (error) {
      return '';
    }
  }
  return '';
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAllowedValue(value) {
  if (value === null) return true;
  const kind = typeof value;
  if (kind === 'boolean') return true;
  if (kind === 'string') return true;
  return kind === 'number' && Number.isFinite(value);
}

function sameValue(left, right) {
  return Object.is(left, right);
}

function isGuid(value) {
  return typeof value === 'string' && GUID_PATTERN.test(value.trim());
}

function isDateTimeString(value) {
  return typeof value === 'string' && ISO_DATETIME.test(value.trim()) && !Number.isNaN(Date.parse(value));
}

function expectedPhrase(attributeType) {
  switch (attributeType) {
    case 'String':
    case 'Memo':
      return 'a string';
    case 'Integer':
    case 'BigInt':
      return 'an integer';
    case 'Double':
    case 'Decimal':
    case 'Money':
      return 'a number';
    case 'Boolean':
      return 'a boolean';
    case 'DateTime':
      return 'an ISO-8601 date/time string';
    case 'Picklist':
    case 'State':
    case 'Status':
      return 'a number (choice value)';
    case 'Uniqueidentifier':
      return 'a GUID string';
    case 'Lookup':
    case 'Owner':
    case 'Customer':
      return 'a target-record GUID string, or null to clear';
    default:
      return `a value this action can write (${attributeType} is unsupported)`;
  }
}

function valueMatches(attributeType, value) {
  if (value === null) return true;
  switch (attributeType) {
    case 'String':
    case 'Memo':
      return typeof value === 'string';
    case 'Integer':
    case 'BigInt':
    case 'Picklist':
    case 'State':
    case 'Status':
      return typeof value === 'number' && Number.isSafeInteger(value);
    case 'Double':
    case 'Decimal':
    case 'Money':
      return typeof value === 'number' && Number.isFinite(value);
    case 'Boolean':
      return typeof value === 'boolean';
    case 'DateTime':
      return isDateTimeString(value);
    case 'Uniqueidentifier':
    case 'Lookup':
    case 'Owner':
    case 'Customer':
      return isGuid(value);
    default:
      return false;
  }
}

function nativeValue(attributeType, value) {
  if (value === null) return null;
  if (attributeType === 'DateTime') return value.trim();
  if (attributeType === 'Uniqueidentifier' || LOOKUP_TYPES.has(attributeType)) return value.trim().toLowerCase();
  return value;
}

function canWriteType(attributeType) {
  return (
    attributeType === 'String' ||
    attributeType === 'Memo' ||
    attributeType === 'Integer' ||
    attributeType === 'BigInt' ||
    attributeType === 'Double' ||
    attributeType === 'Decimal' ||
    attributeType === 'Money' ||
    attributeType === 'Boolean' ||
    attributeType === 'DateTime' ||
    attributeType === 'Picklist' ||
    attributeType === 'State' ||
    attributeType === 'Status' ||
    attributeType === 'Uniqueidentifier' ||
    LOOKUP_TYPES.has(attributeType)
  );
}

const errors = [];
function addError(message) {
  errors.push(message);
}
function throwIfErrors() {
  if (errors.length === 0) return;
  const shown = errors.slice(0, MAX_ERRORS);
  const extra = errors.length - shown.length;
  const tail = extra > 0 ? `\n... and ${extra} more validation error(s).` : '';
  throw new Error(`${shown.join('\n')}${tail}\nNothing was written.`);
}

function newGuid() {
  const hex = [];
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) hex[i] = '-';
    else if (i === 14) hex[i] = '4';
    else if (i === 19) hex[i] = ((Math.random() * 4) | 8).toString(16);
    else hex[i] = ((Math.random() * 16) | 0).toString(16);
  }
  return hex.join('');
}

function chunkItems(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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

// Short, bounded 429 retry: honor Retry-After, cap the wait, then surface the
// same admin failure text the other admin actions use.
async function dvRequest(data, token, { method, url, headers, body }) {
  let rateLimitRetries = 0;
  while (true) {
    const response = await ld.request({
      method,
      url,
      headers,
      body,
    });
    if (response.status === 429) {
      if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) return response;
      rateLimitRetries++;
      const retryAfter = parseInt(
        (response.headers && (response.headers['Retry-After'] || response.headers['retry-after'])) || '',
        10,
      );
      await ld.wait(Math.min((retryAfter && retryAfter > 0 ? retryAfter : RETRY_FALLBACK_SECONDS) * 1000, MAX_WAIT_MS));
      continue;
    }
    return response;
  }
}

function apiUrl(data, path) {
  return `${data.auth.dataverseUrl}/api/data/v9.2${path}`;
}

async function dvGet(data, token, path) {
  const response = await dvRequest(data, token, {
    method: 'GET',
    url: apiUrl(data, path),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    },
  });
  if (response.status !== 200) {
    throw new Error(failureMessage(response.status, responseDetail(response)));
  }
  return response.json;
}

async function resolveEntity(data, token, tableInput) {
  const filter = `LogicalName eq '${escapeODataLiteral(tableInput)}' or EntitySetName eq '${escapeODataLiteral(tableInput)}'`;
  const result = await dvGet(
    data,
    token,
    `/EntityDefinitions?$select=LogicalName,EntitySetName,PrimaryIdAttribute&$filter=${encodeURIComponent(filter)}`,
  );
  const matches = ((result && result.value) || []).filter(
    (entity) => typeof entity.LogicalName === 'string' && entity.LogicalName.startsWith('ckr_'),
  );
  return matches;
}

async function fetchAttributes(data, token, logicalName) {
  const result = await dvGet(
    data,
    token,
    `/EntityDefinitions(LogicalName='${logicalName}')/Attributes?$select=LogicalName,AttributeType,IsValidForUpdate`,
  );
  return (result && result.value) || [];
}

async function fetchLookupTargets(data, token, entityLogicalName, attribute) {
  const castType = LOOKUP_CAST[attribute.AttributeType];
  const result = await dvGet(
    data,
    token,
    `/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${attribute.LogicalName}')/${castType}?$select=LogicalName,Targets`,
  );
  return (result && result.Targets) || [];
}

const entitySetCache = new Map();
async function entitySetNameFor(data, token, logicalName) {
  if (entitySetCache.has(logicalName)) return entitySetCache.get(logicalName);
  const result = await dvGet(
    data,
    token,
    `/EntityDefinitions(LogicalName='${logicalName}')?$select=LogicalName,EntitySetName`,
  );
  const entitySetName = result && result.EntitySetName;
  if (typeof entitySetName !== 'string' || !entitySetName) {
    throw new Error(
      `Could not resolve the entity set name for lookup target "${logicalName}". Nothing was written.`,
    );
  }
  entitySetCache.set(logicalName, entitySetName);
  return entitySetName;
}

function actionUnavailable(status, detail) {
  if (status === 404) return true;
  if (status !== 400) return false;
  const text = String(detail || '').toLowerCase();
  if (text.includes('not implemented')) return true;
  if (text.includes('no http resource was found')) return true;
  if (text.includes('resource not found for the segment')) return true;
  if (/update\s*multiple/.test(text) && text.includes('not found')) return true;
  if (/\baction\b/.test(text) && (text.includes('not found') || text.includes('not bound'))) return true;
  return false;
}

function jsonHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
  };
}

async function postUpdateMultiple(data, token, entitySetName, targets) {
  return dvRequest(data, token, {
    method: 'POST',
    url: apiUrl(data, `/${entitySetName}/Microsoft.Dynamics.CRM.UpdateMultiple`),
    headers: jsonHeaders(token),
    body: JSON.stringify({ Targets: targets }),
  });
}

function parseBatchStatusLines(text) {
  const statuses = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^HTTP\/1\.1\s+(\d+)/);
    if (match) statuses.push(Number(match[1]));
  }
  return statuses;
}

// One HTTP request for the whole chunk. The PATCH lines below are changeset
// parts inside that single multipart body, not separate ld.request calls.
function buildBatchBody(entitySetName, patches) {
  const batchBoundary = `batch_${newGuid()}`;
  const changesetBoundary = `changeset_${newGuid()}`;
  let contentId = 1;
  const parts = [];
  for (const patch of patches) {
    parts.push(
      `--${changesetBoundary}\r\n` +
        `Content-Type: application/http\r\n` +
        `Content-Transfer-Encoding: binary\r\n` +
        `Content-ID: ${contentId}\r\n\r\n` +
        `PATCH /api/data/v9.2/${entitySetName}(${patch.id}) HTTP/1.1\r\n` +
        `Content-Type: application/json;type=entry\r\n\r\n` +
        `${JSON.stringify(patch.body)}\r\n`,
    );
    contentId += 1;
  }
  const body =
    `--${batchBoundary}\r\n` +
    `Content-Type: multipart/mixed;boundary=${changesetBoundary}\r\n\r\n` +
    parts.join('') +
    `--${changesetBoundary}--\r\n` +
    `--${batchBoundary}--\r\n`;
  return { body, batchBoundary };
}

async function postBatch(data, token, entitySetName, patches) {
  const built = buildBatchBody(entitySetName, patches);
  return dvRequest(data, token, {
    method: 'POST',
    url: apiUrl(data, '/$batch'),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      'Content-Type': `multipart/mixed;boundary=${built.batchBoundary}`,
    },
    body: built.body,
  });
}

function batchOutcome(response, partCount) {
  const partStatuses = parseBatchStatusLines(response.text);
  const outerOk = response.status >= 200 && response.status < 300;
  const partsOk =
    partStatuses.length === partCount && partStatuses.every((status) => status >= 200 && status < 300);
  const failingPart = partStatuses.find((status) => status < 200 || status >= 300);
  return {
    ok: outerOk && partsOk,
    status: partsOk ? response.status : failingPart || response.status,
    detail: partsOk
      ? ''
      : `Batch update failed (parts=${partStatuses.join(',') || 'none'}): ${String(response.text || responseDetail(response)).slice(0, 800)}`,
  };
}

function summarize(groups, requests, { dryRun, written, appliedRowCount, error, notice }) {
  const requestCountByTable = {};
  for (const request of requests) {
    requestCountByTable[request.table] = (requestCountByTable[request.table] || 0) + 1;
  }
  const result = {
    dryRun,
    written,
    requestCount: requests.length,
    rowCount: groups.reduce((sum, group) => sum + group.rows.length, 0),
    tables: groups.map((group) => ({
      table: group.logicalName,
      entitySetName: group.entitySetName,
      rowCount: group.rows.length,
      requestCount: requestCountByTable[group.logicalName] || 0,
    })),
    requests,
  };
  if (error) {
    result.partial = true;
    result.appliedRowCount = appliedRowCount;
    result.error = error;
    result.notice = notice;
  }
  return result;
}

function stopNotice(appliedRowCount) {
  if (appliedRowCount === 0) {
    return 'Stopped on the first write request. Nothing was written. Later chunks were not sent.';
  }
  return `Stopped after a Dataverse failure. ${appliedRowCount} row(s) in earlier successful requests were already written. Later chunks were not sent. The input was valid; this partial apply happened only because Dataverse failed mid-flight.`;
}

// --- validate the payload shape before any Dataverse call ---
const input = (data && data.input) || {};
if (input.dryRun !== undefined && input.dryRun !== null && typeof input.dryRun !== 'boolean') {
  addError('dryRun must be a boolean when provided.');
}
const dryRun = input.dryRun === true;
const rowsInput = input.rows;
if (!Array.isArray(rowsInput)) {
  addError('rows is required and must be an array of { table, id, values }.');
} else if (rowsInput.length < 1) {
  addError('rows must contain at least 1 item.');
} else if (rowsInput.length > MAX_ROWS) {
  addError(`rows has ${rowsInput.length} items; the maximum is ${MAX_ROWS}.`);
} else {
  rowsInput.forEach((row, index) => {
    const label = `rows[${index}]`;
    if (!isPlainObject(row)) {
      addError(`${label} must be an object with table, id, and values.`);
      return;
    }
    for (const key of Object.keys(row)) {
      if (!ROW_KEYS.has(key)) addError(`${label} has unexpected property "${key}".`);
    }
    if (typeof row.table !== 'string' || !row.table.trim()) {
      addError(`${label}.table is required and must be a CKR logical name or entity set name.`);
    }
    if (typeof row.id !== 'string' || !GUID_PATTERN.test(row.id.trim())) {
      addError(`${label}.id must be the primary-key GUID of the row.`);
    }
    if (!isPlainObject(row.values)) {
      addError(`${label}.values must be an object with at least one field.`);
      return;
    }
    const fieldNames = Object.keys(row.values);
    if (fieldNames.length < 1) addError(`${label}.values must contain at least one field.`);
    for (const fieldName of fieldNames) {
      const value = row.values[fieldName];
      if (!isAllowedValue(value)) {
        addError(
          `${label}.values.${fieldName} must be a string, number, boolean, or null. Got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}.`,
        );
      }
    }
  });
}
throwIfErrors();

const token = await getToken(data, data.auth.dataverseUrl);

const entityByInput = new Map();
const distinctTables = [];
for (const row of rowsInput) {
  const tableInput = row.table.trim();
  if (!entityByInput.has(tableInput)) {
    entityByInput.set(tableInput, null);
    distinctTables.push(tableInput);
  }
}
for (const tableInput of distinctTables) {
  const matches = await resolveEntity(data, token, tableInput);
  if (matches.length === 0) {
    addError(`No CKR entity matches "${tableInput}". Call admin_describe_schema to list valid tables.`);
  } else if (matches.length > 1) {
    addError(
      `"${tableInput}" matches more than one entity (${matches.map((entity) => entity.LogicalName).join(', ')}). Use the exact logical name or entity set name.`,
    );
  } else if (!matches[0].PrimaryIdAttribute || !matches[0].EntitySetName) {
    addError(`Entity "${matches[0].LogicalName}" is missing PrimaryIdAttribute or EntitySetName.`);
  } else {
    entityByInput.set(tableInput, matches[0]);
    entitySetCache.set(matches[0].LogicalName, matches[0].EntitySetName);
  }
}
throwIfErrors();

// Group by resolved table + id so ckr_interview and ckr_interviews merge.
const groupsByName = new Map();
for (const row of rowsInput) {
  const entity = entityByInput.get(row.table.trim());
  const id = row.id.trim().toLowerCase();
  if (!groupsByName.has(entity.LogicalName)) {
    groupsByName.set(entity.LogicalName, {
      logicalName: entity.LogicalName,
      entitySetName: entity.EntitySetName,
      primaryIdAttribute: entity.PrimaryIdAttribute,
      rowsById: new Map(),
    });
  }
  const group = groupsByName.get(entity.LogicalName);
  if (!group.rowsById.has(id)) {
    group.rowsById.set(id, { id, values: {} });
  }
  const merged = group.rowsById.get(id).values;
  for (const fieldName of Object.keys(row.values)) {
    const value = row.values[fieldName];
    if (Object.prototype.hasOwnProperty.call(merged, fieldName) && !sameValue(merged[fieldName], value)) {
      addError(
        `Rows for ${entity.LogicalName} ${id} set "${fieldName}" more than once with different values. Nothing was written.`,
      );
    } else {
      merged[fieldName] = value;
    }
  }
}
throwIfErrors();

const groups = [];
for (const group of groupsByName.values()) {
  const attributes = await fetchAttributes(data, token, group.logicalName);
  const byName = new Map();
  for (const attribute of attributes) {
    if (attribute && typeof attribute.LogicalName === 'string') byName.set(attribute.LogicalName, attribute);
  }
  group.attributes = byName;
  group.rows = Array.from(group.rowsById.values());
  groups.push(group);
}

const lookupFields = [];
for (const group of groups) {
  const seenFields = new Set();
  for (const row of group.rows) {
    for (const fieldName of Object.keys(row.values)) {
      if (seenFields.has(fieldName)) continue;
      seenFields.add(fieldName);
      if (READ_LOOKUP_PATTERN.test(fieldName)) {
        addError(
          `Field "${fieldName}" on "${group.logicalName}" is the read-form lookup name. Call admin_describe_schema and send writeField (the attribute logical name), not _logicalname_value.`,
        );
        continue;
      }
      if (!IDENTIFIER_PATTERN.test(fieldName)) {
        addError(`Field "${fieldName}" on "${group.logicalName}" is not a Dataverse attribute logical name.`);
        continue;
      }
      const attribute = group.attributes.get(fieldName);
      if (!attribute) {
        addError(
          `Unknown field "${fieldName}" on "${group.logicalName}". Call admin_describe_schema with table="${group.logicalName}" to see valid fields.`,
        );
        continue;
      }
      if (fieldName === group.primaryIdAttribute || attribute.IsValidForUpdate !== true) {
        addError(`Field "${fieldName}" on "${group.logicalName}" is not writable (IsValidForUpdate is false).`);
        continue;
      }
      if (!canWriteType(attribute.AttributeType)) {
        addError(
          `Field "${fieldName}" on "${group.logicalName}" has attribute type ${attribute.AttributeType}, which admin_bulk_writeback cannot write.`,
        );
        continue;
      }
      const sample = group.rows.find(
        (candidate) =>
          Object.prototype.hasOwnProperty.call(candidate.values, fieldName) &&
          !valueMatches(attribute.AttributeType, candidate.values[fieldName]),
      );
      if (sample) {
        const got = sample.values[fieldName];
        addError(
          `Field "${fieldName}" on "${group.logicalName}" expects ${expectedPhrase(attribute.AttributeType)}, got ${got === null ? 'null' : typeof got}.`,
        );
        continue;
      }
      if (LOOKUP_TYPES.has(attribute.AttributeType)) {
        const needsTarget = group.rows.some(
          (candidate) => Object.prototype.hasOwnProperty.call(candidate.values, fieldName) && candidate.values[fieldName] !== null,
        );
        if (needsTarget) lookupFields.push({ group, attribute });
      }
    }
  }
}
throwIfErrors();

const lookupEntitySets = new Map();
for (const entry of lookupFields) {
  const cacheKey = `${entry.group.logicalName}:${entry.attribute.LogicalName}`;
  if (lookupEntitySets.has(cacheKey)) continue;
  const targets = await fetchLookupTargets(data, token, entry.group.logicalName, entry.attribute);
  const names = Array.isArray(targets) ? targets.filter((name) => typeof name === 'string' && name) : [];
  if (names.length !== 1) {
    addError(
      `Field "${entry.attribute.LogicalName}" on "${entry.group.logicalName}" is a lookup with ${names.length === 0 ? 'no' : 'multiple'} targets${names.length ? ` (${names.join(', ')})` : ''}. admin_bulk_writeback can bind a GUID only when LookupAttributeMetadata.Targets has one entity.`,
    );
    continue;
  }
  if (!IDENTIFIER_PATTERN.test(names[0])) {
    addError(
      `Field "${entry.attribute.LogicalName}" on "${entry.group.logicalName}" has a lookup target "${names[0]}" that is not a Dataverse logical name.`,
    );
    continue;
  }
  const entitySetName = await entitySetNameFor(data, token, names[0]);
  lookupEntitySets.set(cacheKey, entitySetName);
}
throwIfErrors();

for (const group of groups) {
  group.payloads = group.rows.map((row) => {
    const target = {
      '@odata.type': `Microsoft.Dynamics.CRM.${group.logicalName}`,
    };
    target[group.primaryIdAttribute] = row.id;
    const patch = {};
    for (const fieldName of Object.keys(row.values).sort()) {
      const attribute = group.attributes.get(fieldName);
      const value = nativeValue(attribute.AttributeType, row.values[fieldName]);
      if (LOOKUP_TYPES.has(attribute.AttributeType)) {
        const bindKey = `${fieldName}@odata.bind`;
        const bindValue =
          value === null
            ? null
            : `/${lookupEntitySets.get(`${group.logicalName}:${fieldName}`)}(${value})`;
        target[bindKey] = bindValue;
        patch[bindKey] = bindValue;
      } else {
        target[fieldName] = value;
        patch[fieldName] = value;
      }
    }
    return { id: row.id, target, patch };
  });
}

const plannedRequests = [];
for (const group of groups) {
  for (const payloads of chunkItems(group.payloads, CHUNK_SIZE)) {
    plannedRequests.push({
      table: group.logicalName,
      entitySetName: group.entitySetName,
      method: 'UpdateMultiple',
      rowCount: payloads.length,
      status: null,
      payloads,
    });
  }
}

if (dryRun) {
  return summarize(
    groups,
    plannedRequests.map((request) => ({
      table: request.table,
      method: request.method,
      rowCount: request.rowCount,
      status: request.status,
    })),
    { dryRun: true, written: false },
  );
}

const sent = [];
let appliedRowCount = 0;
let updateMultipleUnavailable = false;
for (const request of plannedRequests) {
  let method = updateMultipleUnavailable ? 'batch' : 'UpdateMultiple';
  let response;
  if (method === 'UpdateMultiple') {
    response = await postUpdateMultiple(
      data,
      token,
      request.entitySetName,
      request.payloads.map((payload) => payload.target),
    );
    const detail = responseDetail(response);
    if (actionUnavailable(response.status, detail)) {
      sent.push({
        table: request.table,
        method: 'UpdateMultiple',
        rowCount: request.rowCount,
        status: response.status,
      });
      updateMultipleUnavailable = true;
      method = 'batch';
      response = await postBatch(
        data,
        token,
        request.entitySetName,
        request.payloads.map((payload) => ({ id: payload.id, body: payload.patch })),
      );
    }
  } else {
    response = await postBatch(
      data,
      token,
      request.entitySetName,
      request.payloads.map((payload) => ({ id: payload.id, body: payload.patch })),
    );
  }

  if (method === 'UpdateMultiple') {
    const ok = response.status >= 200 && response.status < 300;
    sent.push({
      table: request.table,
      method: 'UpdateMultiple',
      rowCount: request.rowCount,
      status: response.status,
    });
    if (!ok) {
      return summarize(groups, sent, {
        dryRun: false,
        written: appliedRowCount > 0,
        appliedRowCount,
        error: failureMessage(response.status, responseDetail(response)),
        notice: stopNotice(appliedRowCount),
      });
    }
  } else {
    const outcome = batchOutcome(response, request.rowCount);
    sent.push({
      table: request.table,
      method: 'batch',
      rowCount: request.rowCount,
      status: outcome.status,
    });
    if (!outcome.ok) {
      return summarize(groups, sent, {
        dryRun: false,
        written: appliedRowCount > 0,
        appliedRowCount,
        error: failureMessage(outcome.status, outcome.detail || responseDetail(response)),
        notice: stopNotice(appliedRowCount),
      });
    }
  }
  appliedRowCount += request.rowCount;
}

return summarize(groups, sent, { dryRun: false, written: true });
