const baseUrl = (data.auth.baseUrl || 'https://api.langdock.com').replace(/\/+$/, '');

// Use the Integrations API because every custom action in this integration
// reads or writes Langdock integration configuration.
const response = await ld.request({
  url: `${baseUrl}/integrations/v1/get`,
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${data.auth.apiKey}`,
    'Content-Type': 'application/json',
  },
});

if (response.status !== 200) {
  throw new Error(`Authentication failed (${response.status}): ${response.json?.message ?? 'Integrations API scope is required'}`);
}
