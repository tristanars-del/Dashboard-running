(async function init() {
  Charts.initDefaults();
  initTips();

  // Handle OAuth callback
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('code')) {
    showLoading('Authentification Strava…', 10);
    try {
      const code = urlParams.get('code');
      window.history.replaceState({}, document.title, window.location.pathname);
      const cid = localStorage.getItem('strava_client_id');
      const csec = localStorage.getItem('strava_client_secret');
      if (!cid || !csec) throw new Error('Credentials manquants');
      const resp = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: cid, client_secret: csec, code: code, grant_type: 'authorization_code' })
      });
      if (!resp.ok) throw new Error('Échange token échoué: ' + resp.status);
      const data = await resp.json();
      localStorage.setItem('strava_access_token', data.access_token);
      localStorage.setItem('strava_refresh_token', data.refresh_token);
      localStorage.setItem('strava_expires_at', data.expires_at);
      if (data.athlete) localStorage.setItem('strava_athlete', JSON.stringify(data.athlete));
    } catch(e) {
      alert('Erreur connexion Strava: ' + e.message + '\nVeuillez réessayer.');
      localStorage.removeItem('strava_access_token');
      localStorage.removeItem('strava_refresh_token');
      window.location.reload();
      return;
    }
  }

  // Check credentials
  const cid = localStorage.getItem('strava_client_id');
  const csec = localStorage.getItem('strava_client_secret');
  const token = localStorage.getItem('strava_access_token');

  if (!cid || !csec) {
    document.getElementById('setup-modal').classList.remove('hidden');
    return;
  }
  if (!token) {
    const params = new URLSearchParams({
      client_id: cid,
      redirect_uri: 'https://tristanars-del.github.io/Dashboard-running/',
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'read,activity:read_all'
    });
    window.location.href = 'https://www.strava.com/oauth/authorize?' + params.toString();
    return;
  }

  // Load activities
  showLoading('Connexion à Strava…', 15);
  let activities = Strava.getCachedRuns();
  try {
    activities = await Strava.fetchAllActivities(function(msg) { showLoading(msg, 35); });
  } catch(e) {
    console.error('Fetch activities:', e.message);
    if (activities.length === 0) {
      showError('Impossible de charger les activités.<br>Vérifiez vos identifiants Strava.<br><br>Erreur: ' + e.message);
      return;
    }
  }

  if (activities.length === 0) {
    hideLoading();
    document.getElementById('main-content').innerHTML = '<div style="text-align:center;padding:60px 20px;color:#7a7a90;"><div style="font-size:3rem;margin-bottom:16px;">🏃</div><p>Aucune activité running trouvée sur Strava.</p></div>';
    return;
  }

  showLoading('Calcul FCmax et zones FC…', 55);
  const fcmax = Metrics.computeFCmax(activities);
  const zones = Metrics.computeHrZones(fcmax);

  showLoading('Classification des séances…', 68);
  let classifications = Classify.classifyAll(activities, fcmax);
  classifications = Classify.markTaperSessions(activities, classifications, fcmax);
  activities.forEach(function(a) { a._type = classifications[a.id]; });

  showLoading('Calcul VO2max…', 78);
  const vo2History = Metrics.buildVo2maxHistory(activities, fcmax);

  showLoading('Calcul ATL / CTL / TSB…', 88);
  const atlCtlSeries = Metrics.computeAtlCtlTsb(activities, fcmax);

  showLoading('Préparation de l\'interface…', 96);
  const appState = { activities, fcmax, zones, vo2History, atlCtlSeries, classifications };

  UI.init(appState);
  UI.setAthleteName();
  UI.navigateTo('home');
  hideLoading();

  // Background: streams + best efforts
  setTimeout(async function() {
    try {
      const recent = activities.slice(0, 150);
      await Strava.fetchStreamsForActivities(recent, null);
    } catch(e) { console.warn('Streams bg:', e.message); }
  }, 2000);

  setTimeout(async function() {
    try {
      await Strava.fetchAllBestEffortsBackground(activities.slice(0, 200), null);
    } catch(e) { console.warn('Efforts bg:', e.message); }
  }, 5000);
})();

function showLoading(text, pct) {
  var s = document.getElementById('loading-screen');
  if (s) s.classList.remove('hidden');
  if (text) { var el = document.getElementById('loading-text'); if (el) el.textContent = text; }
  if (pct !== undefined) { var bar = document.getElementById('loading-bar'); if (bar) bar.style.width = pct + '%'; }
}
function hideLoading() {
  var s = document.getElementById('loading-screen');
  if (s) { s.style.opacity = '0'; s.style.transition = 'opacity 0.4s'; setTimeout(function() { s.classList.add('hidden'); s.style.opacity = ''; }, 400); }
}
function showError(msg) {
  hideLoading();
  document.getElementById('main-content').innerHTML = '<div style="text-align:center;padding:60px 20px;"><div style="font-size:3rem;margin-bottom:16px;">⚠️</div><p style="color:#f04a8a;font-size:0.95rem;line-height:1.6;">' + msg + '</p><button onclick="localStorage.clear();location.reload()" style="margin-top:20px;background:transparent;border:1px solid #2a2a34;color:#7a7a90;padding:10px 20px;border-radius:8px;cursor:pointer;font-family:inherit;">Réinitialiser et recommencer</button></div>';
}
