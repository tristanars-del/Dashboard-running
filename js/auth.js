const Auth = (() => {
  const KEYS = {
    clientId: 'strava_client_id',
    clientSecret: 'strava_client_secret',
    accessToken: 'strava_access_token',
    refreshToken: 'strava_refresh_token',
    expiresAt: 'strava_expires_at'
  };
  const AUTH_URL = 'https://www.strava.com/oauth/authorize';
  const TOKEN_URL = 'https://www.strava.com/oauth/token';

  function getRedirectUri() {
    return 'https://tristanars-del.github.io/Dashboard-running/';
  }
  function hasCredentials() {
    return !!(localStorage.getItem(KEYS.clientId) && localStorage.getItem(KEYS.clientSecret));
  }
  function isAuthenticated() {
    return !!(localStorage.getItem(KEYS.accessToken) && localStorage.getItem(KEYS.refreshToken));
  }
  function tokenValid() {
    const exp = localStorage.getItem(KEYS.expiresAt);
    if (!exp) return false;
    return Date.now() / 1000 < parseFloat(exp) - 60;
  }
  async function getToken() {
    if (!isAuthenticated()) return null;
    if (!tokenValid()) await doRefresh();
    return localStorage.getItem(KEYS.accessToken);
  }
  async function doRefresh() {
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: localStorage.getItem(KEYS.clientId),
        client_secret: localStorage.getItem(KEYS.clientSecret),
        refresh_token: localStorage.getItem(KEYS.refreshToken),
        grant_type: 'refresh_token'
      })
    });
    if (!resp.ok) throw new Error('Refresh failed');
    saveTokens(await resp.json());
  }
  async function exchangeCode(code) {
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: localStorage.getItem(KEYS.clientId),
        client_secret: localStorage.getItem(KEYS.clientSecret),
        code: code,
        grant_type: 'authorization_code'
      })
    });
    if (!resp.ok) throw new Error('Exchange failed: ' + resp.status);
    const data = await resp.json();
    saveTokens(data);
    return data;
  }
  function saveTokens(data) {
    localStorage.setItem(KEYS.accessToken, data.access_token);
    localStorage.setItem(KEYS.refreshToken, data.refresh_token);
    localStorage.setItem(KEYS.expiresAt, data.expires_at);
    if (data.athlete) localStorage.setItem('strava_athlete', JSON.stringify(data.athlete));
  }
  function startOAuth() {
    const clientId = localStorage.getItem(KEYS.clientId);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getRedirectUri(),
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'read,activity:read_all'
    });
    window.location.href = AUTH_URL + '?' + params.toString();
  }
  async function handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return false;
    window.history.replaceState({}, document.title, window.location.pathname);
    await exchangeCode(code);
    return true;
  }
  function saveCredentials(clientId, clientSecret) {
    localStorage.setItem(KEYS.clientId, clientId.trim());
    localStorage.setItem(KEYS.clientSecret, clientSecret.trim());
  }
  function logout() {
    localStorage.clear();
    window.location.reload();
  }
  function getAthlete() {
    try { return JSON.parse(localStorage.getItem('strava_athlete')); } catch { return null; }
  }
  return {
    getRedirectUri, hasCredentials, isAuthenticated, tokenValid,
    getToken, exchangeCode, startOAuth, handleCallback,
    saveCredentials, logout, getAthlete
  };
})();
