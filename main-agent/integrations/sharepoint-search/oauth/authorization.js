const tenantId = env.TENANT_ID || 'common';
const BASE_URL = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;

return `${BASE_URL}?client_id=${env.CLIENT_ID}&response_type=code&scope=${data.input.scope}&access_type=offline&redirect_uri=${encodeURIComponent(data.input.redirectUrl)}&state=${data.input.state}&response_mode=query&prompt=select_account`;
