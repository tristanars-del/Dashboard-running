const Strava = (() => {
  const BASE = 'https://www.strava.com/api/v3';
  const RUNS_KEY = 'strava_runs_v2';
  const LAST_FETCH_KEY = 'strava_last_fetch';
  const STREAM_PREFIX = 'strava_stream_v2_';
  const EFFORT_PREFIX = 'strava_effort_v2_';
  let reqCount = 0;

  function lsGet(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch(e) {
      if (e.name === 'QuotaExceededError') {
        // Clear stream/effort caches only, keep runs
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith(STREAM_PREFIX) || k.startsWith(EFFORT_PREFIX))) toRemove.push(k);
        }
        toRemove.forEach(k => localStorage.removeItem(k));
        try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
      }
      return false;
    }
  }

  async function apiFetch(endpoint, params) {
    const token = localStorage.getItem('strava_access_token');
    if (!token) throw new Error('No auth token');

    // Auto-refresh if expired
    const exp = parseFloat(localStorage.getItem('strava_expires_at') || '0');
    if (Date.now() / 1000 > exp - 60) {
      await refreshToken();
    }

    reqCount++;
    if (reqCount % 85 === 0) await new Promise(r => setTimeout(r, 2000));

    const url = new URL(BASE + endpoint);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const freshToken = localStorage.getItem('strava_access_token');
    const resp = await fetch(url.toString(), { headers: { Authorization: 'Bearer ' + freshToken } });

    if (resp.status === 401) {
      await refreshToken();
      const t2 = localStorage.getItem('strava_access_token');
      const r2 = await fetch(url.toString(), { headers: { Authorization: 'Bearer ' + t2 } });
      if (!r2.ok) throw new Error('API ' + r2.status);
      return r2.json();
    }
    if (resp.status === 429) throw new Error('rate_limited');
    if (!resp.ok) throw new Error('API ' + resp.status);
    return resp.json();
  }

  async function refreshToken() {
    const cid = localStorage.getItem('strava_client_id');
    const csec = localStorage.getItem('strava_client_secret');
    const rt = localStorage.getItem('strava_refresh_token');
    if (!rt || !cid || !csec) return;
    const resp = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: cid, client_secret: csec, refresh_token: rt, grant_type: 'refresh_token' })
    });
    if (!resp.ok) return;
    const data = await resp.json();
    localStorage.setItem('strava_access_token', data.access_token);
    localStorage.setItem('strava_refresh_token', data.refresh_token);
    localStorage.setItem('strava_expires_at', data.expires_at);
  }

  async function fetchAllActivities(progressCb) {
    const cached = lsGet(RUNS_KEY) || [];
    const lastFetch = lsGet(LAST_FETCH_KEY);
    const params = { per_page: 200 };
    if (lastFetch && cached.length > 0) params.after = lastFetch;

    let page = 1;
    const newActs = [];
    while (true) {
      if (progressCb) progressCb('Chargement activités (page ' + page + ')…');
      let activities;
      try { activities = await apiFetch('/athlete/activities', { ...params, page }); }
      catch(e) { console.warn('[Strava] fetch page ' + page + ':', e.message); break; }
      if (!activities || activities.length === 0) break;
      const runs = activities.filter(a =>
        a.type === 'Run' || a.sport_type === 'Run' ||
        a.type === 'TrailRun' || a.sport_type === 'TrailRun' ||
        a.type === 'VirtualRun' || a.sport_type === 'VirtualRun'
      );
      newActs.push(...runs);
      if (activities.length < 200) break;
      page++;
    }

    const idSet = new Set(cached.map(a => a.id));
    const merged = [...cached];
    for (const a of newActs) {
      if (!idSet.has(a.id)) { merged.push(a); idSet.add(a.id); }
      else { const i = merged.findIndex(x => x.id === a.id); if (i >= 0) merged[i] = a; }
    }
    merged.sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local));
    lsSet(RUNS_KEY, merged);
    lsSet(LAST_FETCH_KEY, Math.floor(Date.now() / 1000));
    return merged;
  }

  async function fetchStreams(activityId) {
    const key = STREAM_PREFIX + activityId;
    const cached = lsGet(key);
    if (cached) return cached;
    try {
      const data = await apiFetch('/activities/' + activityId + '/streams', {
        keys: 'time,distance,heartrate,velocity_smooth,altitude,latlng',
        key_by_type: true
      });
      if (data) lsSet(key, data);
      return data;
    } catch(e) { console.warn('[Strava] stream ' + activityId + ':', e.message); return null; }
  }

  async function fetchStreamsForActivities(activities, progressCb) {
    let done = 0;
    for (const a of activities) {
      if (!lsGet(STREAM_PREFIX + a.id)) {
        await fetchStreams(a.id);
        done++;
        if (done % 10 === 0) await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  async function fetchBestEfforts(activityId) {
    const key = EFFORT_PREFIX + activityId;
    const cached = lsGet(key);
    if (cached) return cached;
    try {
      const data = await apiFetch('/activities/' + activityId, { include_all_efforts: true });
      const efforts = data.best_efforts || [];
      lsSet(key, efforts);
      return efforts;
    } catch(e) { console.warn('[Strava] efforts ' + activityId + ':', e.message); return []; }
  }

  async function fetchAllBestEffortsBackground(activities, progressCb) {
    let done = 0;
    for (const a of activities) {
      if (!lsGet(EFFORT_PREFIX + a.id)) {
        await fetchBestEfforts(a.id);
        done++;
        if (progressCb) progressCb(done, activities.length);
        if (done % 15 === 0) await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  function getCachedRuns() { return lsGet(RUNS_KEY) || []; }
  function getCachedStreams(id) { return lsGet(STREAM_PREFIX + id); }
  function getCachedEfforts(id) { return lsGet(EFFORT_PREFIX + id) || []; }
  function clearCache() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('strava_runs') || k.startsWith('strava_stream') || k.startsWith('strava_effort') || k === LAST_FETCH_KEY)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  }

  return { fetchAllActivities, fetchStreams, fetchStreamsForActivities, fetchBestEfforts, fetchAllBestEffortsBackground, getCachedRuns, getCachedStreams, getCachedEfforts, clearCache };
})();
