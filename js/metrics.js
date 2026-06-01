/* ============================================================
   metrics.js — VO2max, TSS, ATL/CTL/TSB, VDOT, Zones
   ============================================================ */

const Metrics = (() => {

  // ─── FCmax DYNAMIC ────────────────────────────────────────
  // 99th percentile of max HR from intense sessions in last 12 months
  function computeFCmax(activities) {
    const cutoff = DateUtils.daysAgo(365);
    const hrMaxValues = [];

    for (const a of activities) {
      const date = new Date(a.start_date_local);
      if (date < cutoff) continue;
      if (!a.max_heartrate || !a.average_heartrate) continue;
      // "Intense" = average HR > 80% of max HR of the session
      if (a.average_heartrate > a.max_heartrate * 0.75) {
        hrMaxValues.push(a.max_heartrate);
      }
    }

    if (hrMaxValues.length < 3) {
      // Fallback: max of all activities or default
      const allMax = activities.map(a => a.max_heartrate || 0).filter(v => v > 0);
      if (allMax.length > 0) return Math.max(...allMax);
      return 190;
    }

    return MathUtils.percentile(hrMaxValues, 99);
  }

  // ─── HR ZONES ─────────────────────────────────────────────
  function computeHrZones(fcmax) {
    return [
      { id: 1, name: 'Z1 — Récupération',      pctMin: 0,    pctMax: 0.60, color: '#4a90f0' },
      { id: 2, name: 'Z2 — Endurance fond.',   pctMin: 0.60, pctMax: 0.75, color: '#4af0c8' },
      { id: 3, name: 'Z3 — Tempo / Seuil aér.',pctMin: 0.75, pctMax: 0.85, color: '#c8f04a' },
      { id: 4, name: 'Z4 — Seuil anaér.',      pctMin: 0.85, pctMax: 0.93, color: '#f0a84a' },
      { id: 5, name: 'Z5 — VO2max',            pctMin: 0.93, pctMax: 1.10, color: '#f04a8a' }
    ].map(z => ({
      ...z,
      min: Math.round(fcmax * z.pctMin),
      max: Math.round(fcmax * z.pctMax)
    }));
  }

  function getHrZone(hr, zones) {
    for (const z of zones) {
      if (hr >= z.min && hr < z.max) return z.id;
    }
    return 1;
  }

  // Time in each zone from HR stream
  function timeInZones(hrStream, zones) {
    const counts = [0, 0, 0, 0, 0];
    for (const hr of hrStream) {
      const zone = getHrZone(hr, zones) - 1;
      counts[zone]++;
    }
    return counts; // seconds (1 per data point = 1s)
  }

  // ─── VO2MAX ───────────────────────────────────────────────
  // Jack Daniels inverse: VO2(v) = 0.000104v² + 0.182258v - 4.602, v in m/min
  function vo2FromVelocity(vMperMin) {
    return 0.000104 * vMperMin ** 2 + 0.182258 * vMperMin - 4.602;
  }

  // Inverse: find v (m/min) that gives a target VO2 (Newton iteration)
  function velocityFromVo2(targetVO2) {
    let v = 200; // initial guess m/min
    for (let i = 0; i < 50; i++) {
      const f = vo2FromVelocity(v) - targetVO2;
      const df = 2 * 0.000104 * v + 0.182258;
      v = v - f / df;
    }
    return Math.max(0, v);
  }

  // Firstbeat-style VO2max for a run
  function vo2maxFirstbeat(activity) {
    const v = (activity.average_speed || 0) * 60; // m/s → m/min
    const hrMean = activity.average_heartrate || 0;
    const hrMax = activity.max_heartrate || 0;
    if (!v || !hrMean || !hrMax) return null;
    return ((v * 0.2) + 3.5) * (hrMax / hrMean);
  }

  // VO2max from race performance (Jack Daniels)
  function vo2maxFromRace(distM, timeSec) {
    if (!distM || !timeSec) return null;
    const vMperMin = (distM / timeSec) * 60;
    return vo2FromVelocity(vMperMin);
  }

  // Build VO2max history (one value per activity, smoothed 28 days)
  function buildVo2maxHistory(activities, fcmax) {
    const HEAT_THRESHOLD = 25; // °C, skip hot sessions

    // Collect raw estimates per activity
    const raw = [];

    for (const a of activities) {
      // Skip hot sessions (if weather data available)
      const temp = a._weather?.temperature;
      if (temp !== undefined && temp > HEAT_THRESHOLD) continue;

      // Skip if no HR data
      if (!a.average_heartrate || !a.max_heartrate) continue;

      // Skip very short activities
      if ((a.moving_time || 0) < 600) continue;

      let vo2;

      // Check if it's a competition/race (use race formula)
      const type = a._type;
      if (type === 'race' && a.distance && a.moving_time) {
        vo2 = vo2maxFromRace(a.distance, a.moving_time);
      }

      // Firstbeat estimate
      if (!vo2) {
        vo2 = vo2maxFirstbeat(a);
      }

      if (vo2 && vo2 > 20 && vo2 < 90) {
        raw.push({
          date: new Date(a.start_date_local),
          ts: new Date(a.start_date_local).getTime(),
          vo2,
          isRace: type === 'race'
        });
      }
    }

    if (raw.length === 0) return [];

    // Sort by date
    raw.sort((a, b) => a.ts - b.ts);

    // Apply 28-day smoothing: for each day, compute weighted avg of estimates in window
    const WINDOW = 28 * 86400 * 1000;
    const smoothed = [];

    for (const point of raw) {
      const windowPoints = raw.filter(p =>
        Math.abs(p.ts - point.ts) <= WINDOW / 2
      );
      // Weight race-based estimates 3x higher
      let totalWeight = 0;
      let weightedSum = 0;
      for (const p of windowPoints) {
        const w = p.isRace ? 3 : 1;
        totalWeight += w;
        weightedSum += p.vo2 * w;
      }
      smoothed.push({
        date: point.date,
        vo2: weightedSum / totalWeight
      });
    }

    // Deduplicate to one per week (take last)
    const byWeek = {};
    for (const s of smoothed) {
      const wk = DateUtils.isoDate(DateUtils.weekStart(s.date));
      byWeek[wk] = s;
    }

    return Object.values(byWeek).sort((a, b) => a.date - b.date);
  }

  // ─── VDOT / Race predictions ───────────────────────────────
  function computeVDOT(vo2max) {
    // VMA (m/min) = velocity at VO2max
    return velocityFromVo2(vo2max);
  }

  // Predict race time from VDOT using Jack Daniels model
  // Returns seconds
  function predictRaceTime(vma_mpermin, distM) {
    // Oxygen cost at various paces as fraction of VO2max
    // We use the formula approach: find velocity where % VO2max = race-specific %
    const pctVo2byDist = {
      400:   1.00,
      800:   0.98,
      1600:  0.96,
      3000:  0.94,
      5000:  0.92,
      10000: 0.88,
      21097: 0.82,
      42195: 0.75
    };

    // Find nearest distance or interpolate
    const dists = Object.keys(pctVo2byDist).map(Number).sort((a, b) => a - b);
    let pct;
    if (distM <= dists[0]) {
      pct = pctVo2byDist[dists[0]];
    } else if (distM >= dists[dists.length - 1]) {
      pct = pctVo2byDist[dists[dists.length - 1]];
    } else {
      for (let i = 0; i < dists.length - 1; i++) {
        if (distM >= dists[i] && distM <= dists[i + 1]) {
          const t = (distM - dists[i]) / (dists[i + 1] - dists[i]);
          pct = pctVo2byDist[dists[i]] * (1 - t) + pctVo2byDist[dists[i + 1]] * t;
          break;
        }
      }
    }

    const raceVma = vma_mpermin * pct;
    if (!raceVma) return null;
    return (distM / raceVma) * 60; // seconds
  }

  // Training paces from VMA (m/min)
  function trainingPaces(vma_mpermin) {
    return {
      recovery:    { pct: 0.59, name: 'Récupération' },
      ef:          { pct: 0.65, name: 'Endurance fond.' },
      tempo:       { pct: 0.80, name: 'Tempo' },
      threshold:   { pct: 0.85, name: 'Seuil' },
      intervals:   { pct: 0.975, name: 'Intervalles' },
      repetitions: { pct: 1.05, name: 'Répétitions' },
      marathon:    { pct: 0.75, name: 'Marathon' }
    };
  }

  // ─── TSS / ATL / CTL / TSB ────────────────────────────────
  function computeTSS(activity, fcmax) {
    const durationHours = (activity.moving_time || 0) / 3600;
    const hrMean = activity.average_heartrate || 0;
    if (!hrMean || !fcmax) return 0;
    const ratio = hrMean / fcmax;
    return durationHours * ratio * ratio * 100;
  }

  // Build daily load array from activities
  function buildDailyLoad(activities, fcmax, startDate, endDate) {
    const start = startDate instanceof Date ? startDate : new Date(startDate);
    const end = endDate instanceof Date ? endDate : new Date(endDate);

    // Map of dateStr → total TSS
    const dailyMap = {};
    for (const a of activities) {
      const d = DateUtils.isoDate(new Date(a.start_date_local));
      const tss = computeTSS(a, fcmax);
      dailyMap[d] = (dailyMap[d] || 0) + tss;
    }

    // Build array
    const dates = dateRange(start, end);
    return dates.map(d => ({
      date: d,
      tss: dailyMap[DateUtils.isoDate(d)] || 0
    }));
  }

  // Compute ATL, CTL, TSB series
  function computeAtlCtlTsb(activities, fcmax) {
    if (!activities || activities.length === 0) return [];

    const sorted = [...activities].sort((a, b) =>
      new Date(a.start_date_local) - new Date(b.start_date_local)
    );

    const firstDate = new Date(sorted[0].start_date_local);
    const today = new Date();
    const daily = buildDailyLoad(sorted, fcmax, firstDate, today);

    const atl_lambda = 1 - 1 / 7;
    const ctl_lambda = 1 - 1 / 42;

    let atl = 0, ctl = 0;
    const series = [];

    for (const day of daily) {
      atl = atl_lambda * atl + (1 - atl_lambda) * day.tss;
      ctl = ctl_lambda * ctl + (1 - ctl_lambda) * day.tss;
      const tsb = ctl - atl;
      series.push({
        date: day.date,
        atl: parseFloat(atl.toFixed(1)),
        ctl: parseFloat(ctl.toFixed(1)),
        tsb: parseFloat(tsb.toFixed(1)),
        tss: day.tss
      });
    }

    return series;
  }

  // Get latest ATL/CTL/TSB
  function getCurrentForm(series) {
    if (!series || series.length === 0) return { atl: 0, ctl: 0, tsb: 0 };
    return series[series.length - 1];
  }

  // TSB interpretation
  function tsbLabel(tsb) {
    if (tsb > 5)   return { text: 'Frais', cls: 'tsb-fresh' };
    if (tsb >= 0)  return { text: 'Équilibré', cls: 'tsb-ok' };
    if (tsb >= -15) return { text: 'Entraîné', cls: 'tsb-tired' };
    return { text: 'Fatigué', cls: 'tsb-very-tired' };
  }

  // ─── EF EFFICIENCY FACTOR ─────────────────────────────────
  // EF pace = average pace of EF sessions
  function efPaceHistory(activities, classifications) {
    return activities
      .filter(a => classifications[a.id] === 'ef' && a.average_heartrate &&
                   a.average_speed && a.distance > 5000)
      .map(a => ({
        date: new Date(a.start_date_local),
        pace: 1000 / a.average_speed, // s/km
        hr: a.average_heartrate,
        ef: a.average_heartrate / (a.average_speed * 3.6) // HR per pace
      }))
      .sort((a, b) => a.date - b.date);
  }

  // ─── WEEKLY VOLUMES ───────────────────────────────────────
  function weeklyVolumes(activities, classifications, cutoff) {
    const filtered = cutoff
      ? activities.filter(a => new Date(a.start_date_local) >= cutoff)
      : activities;

    const byWeek = {};
    for (const a of filtered) {
      const wk = DateUtils.isoDate(DateUtils.weekStart(new Date(a.start_date_local)));
      if (!byWeek[wk]) byWeek[wk] = { total: 0, byType: {} };
      const km = (a.distance || 0) / 1000;
      byWeek[wk].total += km;
      const type = (classifications && classifications[a.id]) || 'unknown';
      byWeek[wk].byType[type] = (byWeek[wk].byType[type] || 0) + km;
    }

    return byWeek;
  }

  // Compute analysis metrics summary
  function analysisSummary(activities, fcmax, cutoff, classifications) {
    const filtered = cutoff
      ? activities.filter(a => new Date(a.start_date_local) >= cutoff)
      : activities;

    if (filtered.length === 0) return {};

    const weeks = weeklyVolumes(activities, classifications, cutoff);
    const weekVols = Object.values(weeks).map(w => w.total);
    const avgVol = weekVols.length ? MathUtils.mean(weekVols) : 0;
    const maxVol = weekVols.length ? Math.max(...weekVols) : 0;
    const maxRun = Math.max(...filtered.map(a => (a.distance || 0) / 1000));
    const maxHR = Math.max(...filtered.map(a => a.max_heartrate || 0));
    const totalTSS = filtered.reduce((s, a) => s + computeTSS(a, fcmax), 0);

    return {
      avgVolPerWeek: avgVol,
      biggestWeek: maxVol,
      biggestRun: maxRun,
      nbSessions: filtered.length,
      totalTSS,
      maxHR
    };
  }

  return {
    computeFCmax,
    computeHrZones,
    getHrZone,
    timeInZones,
    vo2maxFirstbeat,
    vo2maxFromRace,
    vo2FromVelocity,
    velocityFromVo2,
    buildVo2maxHistory,
    computeVDOT,
    predictRaceTime,
    trainingPaces,
    computeTSS,
    computeAtlCtlTsb,
    getCurrentForm,
    tsbLabel,
    efPaceHistory,
    weeklyVolumes,
    analysisSummary
  };
})();
