const options = {
  url: 'https://graph.microsoft.com/v1.0/me',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': 'Bearer ' + data.auth.access_token,
  }
};

const response = await ld.request(options);

return response.json;