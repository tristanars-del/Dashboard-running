/* ============================================================
   records.js — Personal Records (PR) management
   ============================================================ */

const Records = (() => {

  // Standard race distances (in meters) with labels
  const STANDARD_DISTANCES = [
    { m: 400,   label: '400 m' },
    { m: 800,   label: '800 m' },
    { m: 1000,  label: '1 km' },
    { m: 1609,  label: '1 mile' },
    { m: 3000,  label: '3 km' },
    { m: 5000,  label: '5 km' },
    { m: 10000, label: '10 km' },
    { m: 15000, label: '15 km' },
    { m: 21097, label: 'Semi-marathon' },
    { m: 42195, label: 'Marathon' },
    { m: 50000, label: '50 km' }
  ];

  const TOLERANCE = 0.005; // 0.5%

  // Normalize a distance to nearest standard
  function normalizeDistance(meters) {
    for (const std of STANDARD_DISTANCES) {
      const diff = Math.abs(meters - std.m) / std.m;
      if (diff <= TOLERANCE) return std;
    }
    return null;
  }

  // Build PR list from best_efforts cached data
  function buildPRs(activities, cutoff) {
    const bests = {}; // key: std.m → { activity, effort }

    for (const a of activities) {
      if (cutoff && new Date(a.start_date_local) < cutoff) continue;
      const efforts = Strava.getCachedEfforts(a.id);
      for (const effort of efforts) {
        const dist = effort.distance;
        const std = normalizeDistance(dist);
        if (!std) continue;
        const key = std.m;
        if (!bests[key] || effort.elapsed_time < bests[key].elapsed_time) {
          bests[key] = {
            distance_m: std.m,
            distance_label: std.label,
            elapsed_time: effort.elapsed_time,
            date: a.start_date_local,
            activity_id: a.id,
            activity_name: a.name
          };
        }
      }
    }

    return Object.values(bests).sort((a, b) => a.distance_m - b.distance_m);
  }

  // Build history of a specific distance (for progression chart)
  function buildDistanceHistory(activities, distM) {
    const history = [];

    for (const a of activities) {
      const efforts = Strava.getCachedEfforts(a.id);
      for (const effort of efforts) {
        const std = normalizeDistance(effort.distance);
        if (std && std.m === distM) {
          history.push({
            date: a.start_date_local,
            elapsed_time: effort.elapsed_time,
            activity_id: a.id,
            activity_name: a.name
          });
        }
      }
    }

    // Sort by date
    history.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Keep only when a new PR was set
    let best = Infinity;
    const prOnly = [];
    for (const h of history) {
      if (h.elapsed_time < best) {
        best = h.elapsed_time;
        prOnly.push(h);
      }
    }
    return prOnly;
  }

  // Performance records (TSS max, elevation, longest by time, max HR last 12m)
  function buildPerfRecords(activities, fcmax, classifications) {
    const cutoff12m = DateUtils.daysAgo(365);

    let maxTSS = null, maxElev = null, longestTime = null, maxHR = null;

    for (const a of activities) {
      const type = classifications[a.id];
      const date = new Date(a.start_date_local);

      // TSS max (hors compétition)
      if (type !== 'race') {
        const tss = Metrics.computeTSS(a, fcmax);
        if (!maxTSS || tss > maxTSS.tss) {
          maxTSS = { tss: tss.toFixed(0), date: a.start_date_local, activity_id: a.id, name: a.name };
        }
      }

      // Elevation max
      const elev = a.total_elevation_gain || 0;
      if (!maxElev || elev > maxElev.elev) {
        maxElev = { elev, date: a.start_date_local, activity_id: a.id, name: a.name };
      }

      // Longest by time
      const t = a.moving_time || 0;
      if (!longestTime || t > longestTime.time) {
        longestTime = { time: t, date: a.start_date_local, activity_id: a.id, name: a.name };
      }

      // Max HR (last 12 months only)
      if (date >= cutoff12m) {
        const hr = a.max_heartrate || 0;
        if (hr > 0 && (!maxHR || hr > maxHR.hr)) {
          maxHR = { hr, date: a.start_date_local, activity_id: a.id, name: a.name };
        }
      }
    }

    return { maxTSS, maxElev, longestTime, maxHR };
  }

  // Volume records
  function buildVolumeRecords(activities, fcmax) {
    // Biggest week
    const byWeek = {};
    for (const a of activities) {
      const wk = DateUtils.isoDate(DateUtils.weekStart(new Date(a.start_date_local)));
      if (!byWeek[wk]) byWeek[wk] = { total: 0, activities: [] };
      byWeek[wk].total += (a.distance || 0) / 1000;
      byWeek[wk].activities.push(a);
    }

    let biggestWeek = null;
    for (const [wk, data] of Object.entries(byWeek)) {
      if (!biggestWeek || data.total > biggestWeek.km) {
        biggestWeek = { km: data.total.toFixed(1), week: wk };
      }
    }

    // Longest single run by km
    let longestRun = null;
    for (const a of activities) {
      const km = (a.distance || 0) / 1000;
      if (!longestRun || km > longestRun.km) {
        longestRun = { km: km.toFixed(1), date: a.start_date_local, activity_id: a.id, name: a.name };
      }
    }

    return { biggestWeek, longestRun };
  }

  return {
    STANDARD_DISTANCES,
    normalizeDistance,
    buildPRs,
    buildDistanceHistory,
    buildPerfRecords,
    buildVolumeRecords
  };
})();
