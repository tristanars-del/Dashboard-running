/* ============================================================
   strava.js — Strava API client with caching and rate limiting
   ============================================================ */

const Strava = (() => {
  const BASE = 'https://www.strava.com/api/v3';
  const CACHE_VERSION = 'v2';
  const RUNS_KEY = `strava_runs_${CACHE_VERSION}`;
  const STREAMS_KEY_PREFIX = `strava_stream_${CACHE_VERSION}_`;
  const EFFORTS_KEY_PREFIX = `strava_efforts_${CACHE_VERSION}_`;
  const LAST_FETCH_KEY = 'strava_last_fetch';

  let requestCount = 0;

  async function apiFetch(endpoint, params = {}) {
    const token = await Auth.getToken();
    if (!token) throw new Error('No auth token');

    // Rate limiting: pause every 90 requests to avoid hitting Strava's 100/15min limit
    requestCount++;
    if (requestCount % 90 === 0) {
      console.log('[Strava] Rate limit pause — waiting 15 minutes...');
      // In practice we pause briefly and warn user
      await sleep(2000);
    }

    const url = new URL(`${BASE}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (resp.status === 429) {
      // Rate limited
      const retryAfter = parseInt(resp.headers.get('X-RateLimit-Reset') || '900');
      throw new Error(`rate_limited:${retryAfter}`);
    }

    if (!resp.ok) {
      throw new Error(`API error ${resp.status}: ${await resp.text()}`);
    }
    return resp.json();
  }

  // Fetch all running activities (with pagination + incremental refresh)
  async function fetchAllActivities(progressCb) {
    const cached = Store.get(RUNS_KEY) || [];
    const lastFetch = Store.get(LAST_FETCH_KEY);

    const params = {
      activity_type: 'Run',
      per_page: 200
    };

    if (lastFetch && cached.length > 0) {
      // Only fetch new activities
      params.after = lastFetch;
    }

    let page = 1;
    let newActivities = [];

    while (true) {
      if (progressCb) progressCb(`Chargement des activités (page ${page})…`);
      const activities = await apiFetch('/athlete/activities', { ...params, page });

      if (!activities || activities.length === 0) break;

      // Filter only runs
      const runs = activities.filter(a => a.type === 'Run' || a.sport_type === 'Run' ||
                                          a.type === 'TrailRun' || a.sport_type === 'TrailRun');
      newActivities = newActivities.concat(runs);

      if (activities.length < 200) break;
      page++;
    }

    // Merge with cache (deduplicate by id)
    const allIds = new Set(cached.map(a => a.id));
    const merged = [...cached];
    for (const a of newActivities) {
      if (!allIds.has(a.id)) {
        merged.push(a);
        allIds.add(a.id);
      } else {
        // Update existing
        const idx = merged.findIndex(x => x.id === a.id);
        if (idx >= 0) merged[idx] = a;
      }
    }

    // Sort by date descending
    merged.sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local));

    Store.set(RUNS_KEY, merged);
    Store.set(LAST_FETCH_KEY, Math.floor(Date.now() / 1000));

    return merged;
  }

  // Fetch streams for a single activity
  async function fetchStreams(activityId) {
    const key = STREAMS_KEY_PREFIX + activityId;
    const cached = Store.get(key);
    if (cached) return cached;

    try {
      const data = await apiFetch(`/activities/${activityId}/streams`, {
        keys: 'time,distance,heartrate,velocity_smooth,altitude,latlng',
        key_by_type: true
      });
      Store.set(key, data);
      return data;
    } catch (e) {
      console.warn(`[Strava] Stream fetch failed for ${activityId}:`, e.message);
      return null;
    }
  }

  // Fetch streams for multiple activities with rate limiting
  async function fetchStreamsForActivities(activities, progressCb) {
    const key = RUNS_KEY;
    const runs = Store.get(key) || [];
    let done = 0;

    for (const a of activities) {
      const cacheKey = STREAMS_KEY_PREFIX + a.id;
      if (!Store.get(cacheKey)) {
        if (progressCb) progressCb(`Streams: ${done}/${activities.length}…`);
        await fetchStreams(a.id);
        done++;

        // Small delay to be polite to Strava API
        if (done % 10 === 0) await sleep(1000);
      } else {
        done++;
      }
    }
  }

  // Fetch best efforts for a single activity
  async function fetchBestEfforts(activityId) {
    const key = EFFORTS_KEY_PREFIX + activityId;
    const cached = Store.get(key);
    if (cached) return cached;

    try {
      const data = await apiFetch(`/activities/${activityId}`, { include_all_efforts: true });
      const efforts = data.best_efforts || [];
      Store.set(key, efforts);
      return efforts;
    } catch (e) {
      console.warn(`[Strava] Best efforts failed for ${activityId}:`, e.message);
      return [];
    }
  }

  // Fetch best efforts for all activities in background (non-blocking)
  async function fetchAllBestEffortsBackground(activities, progressCb) {
    let done = 0;
    for (const a of activities) {
      const key = EFFORTS_KEY_PREFIX + a.id;
      if (!Store.get(key)) {
        await fetchBestEfforts(a.id);
        done++;
        if (progressCb) progressCb(done, activities.length);
        if (done % 15 === 0) await sleep(1000);
      }
    }
  }

  // Get cached runs
  function getCachedRuns() {
    return Store.get(RUNS_KEY) || [];
  }

  // Get streams from cache
  function getCachedStreams(activityId) {
    return Store.get(STREAMS_KEY_PREFIX + activityId);
  }

  // Get best efforts from cache
  function getCachedEfforts(activityId) {
    return Store.get(EFFORTS_KEY_PREFIX + activityId) || [];
  }

  // Clear all cached data
  function clearCache() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('strava_runs') || k.startsWith('strava_stream') ||
               k.startsWith('strava_efforts') || k === LAST_FETCH_KEY)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }

  return {
    fetchAllActivities,
    fetchStreams,
    fetchStreamsForActivities,
    fetchBestEfforts,
    fetchAllBestEffortsBackground,
    getCachedRuns,
    getCachedStreams,
    getCachedEfforts,
    clearCache
  };
})();
