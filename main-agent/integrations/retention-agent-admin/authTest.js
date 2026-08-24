// Validates Dataverse app-only access for Retention Agent Admin probes.
const tenantId = data.auth.tenantId;
const dataverseUrl = (data.auth.dataverseUrl || '').replace(/\/+$/, '');

function failureMessage(step, status, detail) {
  const code = status === null || status === undefined || status === '' ? 'not reported' : String(status);
  const message = detail === null || detail === undefined ? '' : String(detail);
  return `Connection test failed. The step that returned the error is "${step}", the error code is ${code}, and the error returned by the API is: ${message}`;
}

const tokenResponse = await ld.request({
  url: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: {
    client_id: data.auth.clientId,
    client_secret: data.auth.clientSecret,
    grant_type: 'client_credentials',
    scope: `${dataverseUrl}/.default`,
  },
});
if (tokenResponse.status !== 200 || !tokenResponse.json || !tokenResponse.json.access_token) {
  const detail =
    (tokenResponse.json && (tokenResponse.json.error_description || tokenResponse.json.error)) ||
    tokenResponse.text ||
    '';
  throw new Error(failureMessage(`token request for ${dataverseUrl}`, tokenResponse.status, detail));
}

const whoAmI = await ld.request({
  url: `${dataverseUrl}/api/data/v9.2/WhoAmI`,
  method: 'GET',
  headers: {
    Authorization: `Bearer ${tokenResponse.json.access_token}`,
    Accept: 'application/json',
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
  },
});
if (whoAmI.status !== 200) {
  const detail = (whoAmI.json && whoAmI.json.error && whoAmI.json.error.message) || whoAmI.text || '';
  throw new Error(
    `${failureMessage('Dataverse WhoAmI', whoAmI.status, detail)} Check the application user and security role.`,
  );
}

return {
  authenticated: true,
  dataverseUserId: whoAmI.json && whoAmI.json.UserId,
};
