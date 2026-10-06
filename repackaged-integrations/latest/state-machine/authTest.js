// Validates the admin connection: exchanges client credentials for app-only
// tokens and confirms access to both Dataverse and the central SharePoint site.
const tenantId = data.auth.tenantId;
const dataverseUrl = (data.auth.dataverseUrl || '').replace(/\/+$/, '');
// Read the manifest slug exactly. Accepting a second spelling here is what let a
// casing mismatch in the action files pass the connection test and fail at runtime.
const siteId = data.auth.sharepointSiteId;

// Same contract as the actions' failureMessage: name the step, give the status
// code, and pass the API body through verbatim rather than paraphrasing it.
function failureMessage(step, status, detail) {
  const code = status === null || status === undefined || status === '' ? 'not reported' : String(status);
  const message = detail === null || detail === undefined ? '' : String(detail);
  return `Connection test failed. The step that returned the error is "${step}", the error code is ${code}, and the error returned by the API is: ${message}`;
}

async function getToken(resource) {
  const response = await ld.request({
    url: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
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
    const detail = (response.json && (response.json.error_description || response.json.error)) || response.text || '';
    throw new Error(failureMessage(`token request for ${resource}`, response.status, detail));
  }
  return response.json.access_token;
}

// Dataverse: WhoAmI confirms the application user is provisioned and authorized.
const dataverseToken = await getToken(dataverseUrl);
const whoAmI = await ld.request({
  url: `${dataverseUrl}/api/data/v9.2/WhoAmI`,
  method: 'GET',
  headers: {
    Authorization: `Bearer ${dataverseToken}`,
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

// Graph: confirm the app can read the central CKR site (Sites.Selected grant).
const graphToken = await getToken('https://graph.microsoft.com');
const site = await ld.request({
  url: `https://graph.microsoft.com/v1.0/sites/${siteId}`,
  method: 'GET',
  headers: { Authorization: `Bearer ${graphToken}`, Accept: 'application/json' },
});
if (site.status !== 200) {
  const detail = (site.json && site.json.error && site.json.error.message) || site.text || '';
  throw new Error(
    `${failureMessage('SharePoint site lookup', site.status, detail)} Check the Sites.Selected grant on the CKR site.`,
  );
}

return {
  authenticated: true,
  dataverseUserId: whoAmI.json && whoAmI.json.UserId,
  sharePointSiteName: site.json && site.json.displayName,
  prefillEnabled: String(data.auth.prefillEnabled).toLowerCase() === 'true',
};
