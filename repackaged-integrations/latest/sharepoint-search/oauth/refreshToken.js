const tenantId = env.TENANT_ID || 'common';
const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

const body = {
  client_id: env.CLIENT_ID,
  client_secret: env.CLIENT_SECRET,
  refresh_token: data.auth.refresh_token,
  grant_type: 'refresh_token',
};

const response = await ld.request({
  url: tokenUrl,
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: body,
});

return response.json;
