/* ============================================================
   classify.js — Automatic session classification (13 categories)
   ============================================================ */

const Classify = (() => {

  // Race/competition keywords in name/description
  const RACE_KEYWORDS = ['race', 'course', 'compétition', 'competition', 'marathon', 'semi',
                         'trail', '10k', '10km', '5k', '5km', 'chrono', 'chronométré',
                         'départ', 'arrivée', 'bib', 'dossard', 'parkrun'];

  // Get streams data as arrays indexed by time
  function parseStreams(streams) {
    if (!streams) return null;
    const hr = streams.heartrate?.data || [];
    const vel = streams.velocity_smooth?.data || [];
    const alt = streams.altitude?.data || [];
    const dist = streams.distance?.data || [];
    const latlng = streams.latlng?.data || [];
    return { hr, vel, alt, dist, latlng };
  }

  // Detect intervals: returns array of {start, end, avgVel, type}
  function detectIntervals(vel, hr, fcmax) {
    if (!vel || vel.length < 60) return [];

    // Smooth velocity with 5s window
    const smoothVel = vel.map((v, i) => {
      const w = 5;
      const slice = vel.slice(Math.max(0, i - w), i + w + 1);
      return MathUtils.mean(slice);
    });

    const meanVel = MathUtils.mean(smoothVel.filter(v => v > 0));
    const threshold = meanVel * 1.12; // 12% above mean = effort block

    let inBlock = false;
    let blockStart = 0;
    const blocks = [];

    for (let i = 0; i < smoothVel.length; i++) {
      const fast = smoothVel[i] > threshold;
      if (fast && !inBlock) {
        inBlock = true;
        blockStart = i;
      } else if (!fast && inBlock) {
        inBlock = false;
        const dur = i - blockStart;
        if (dur >= 20) { // min 20 seconds
          blocks.push({
            start: blockStart,
            end: i,
            dur,
            avgVel: MathUtils.mean(smoothVel.slice(blockStart, i))
          });
        }
      }
    }
    return blocks;
  }

  // Compute gradient per km from altitude + distance streams
  function gradientPerKm(alt, dist) {
    if (!alt || !dist || alt.length < 2) return 0;
    const totalAlt = alt.reduce((sum, v, i) => {
      if (i === 0) return 0;
      const diff = Math.abs(v - alt[i - 1]);
      return sum + diff;
    }, 0);
    const totalDist = dist[dist.length - 1] || 1;
    return (totalAlt / totalDist) * 1000; // m per km
  }

  // Classify a single activity
  function classify(activity, streams, fcmax) {
    const name = (activity.name || '').toLowerCase();
    const desc = (activity.description || '').toLowerCase();
    const distM = activity.distance || 0;
    const durationSec = activity.moving_time || 0;
    const hrMean = activity.average_heartrate || 0;
    const hrMax12 = fcmax || 190;

    // Check if race from name/description
    const isRaceNamed = RACE_KEYWORDS.some(kw => name.includes(kw) || desc.includes(kw));

    // Parsed streams
    const s = parseStreams(streams);

    // --- Thresholds (% of FCmax dynamic) ---
    const fc_z1 = hrMax12 * 0.60;  // <60%
    const fc_z2 = hrMax12 * 0.75;  // 60-75%
    const fc_ef_max = hrMax12 * 0.78; // EF ceiling
    const fc_tempo_min = hrMax12 * 0.78;
    const fc_tempo_max = hrMax12 * 0.86;
    const fc_threshold_min = hrMax12 * 0.86;
    const fc_race_min = hrMax12 * 0.88;
    const fc_recov_max = hrMax12 * 0.65;

    // Coefficient of variation of velocity
    let cvVel = 0;
    let gradKm = 0;
    let blocks = [];

    if (s) {
      const velPos = s.vel.filter(v => v > 0);
      cvVel = velPos.length > 10 ? MathUtils.cv(velPos) : 0;
      gradKm = gradientPerKm(s.alt, s.dist);
      blocks = detectIntervals(s.vel, s.hr, hrMax12);
    }

    // No HR data fallback
    if (!hrMean) {
      // Classify by distance/grade only
      if (gradKm > 35) return 'trail';
      if (gradKm > 25) return 'hills';
      if (distM >= 15000) return 'long_run';
      if (durationSec < 2400 && distM < 6000) return 'recovery';
      return 'ef';
    }

    // 1. COMPETITION
    if (isRaceNamed ||
        (hrMean > fc_race_min && distM > 5000 && cvVel < 0.15)) {
      return 'race';
    }

    // 2. TRAIL
    if (gradKm > 35) return 'trail';

    // 3. HILLS (côtes)
    if (gradKm >= 25 && gradKm <= 35 && cvVel > 0.25) return 'hills';

    // 4. INTERVALS (detect by effort blocks)
    if (blocks.length >= 3) {
      const avgBlockDur = MathUtils.mean(blocks.map(b => b.dur));
      if (avgBlockDur < 120) return 'intervals_short';    // <2min
      if (avgBlockDur < 300) return 'intervals_medium';   // 2-5min
      return 'intervals_long';                             // >5min
    }

    // 5. RECOVERY
    if (distM < 6000 && hrMean < fc_recov_max && durationSec < 2400) {
      return 'recovery';
    }

    // 6. THRESHOLD (seuil)
    if (hrMean > fc_threshold_min && cvVel < 0.15 && distM >= 4000 && distM <= 12000) {
      return 'threshold';
    }

    // 7. TEMPO
    if (hrMean >= fc_tempo_min && hrMean <= fc_tempo_max && cvVel < 0.18 && distM > 6000) {
      return 'tempo';
    }

    // 8. LONG RUN PROGRESSIVE (check 2nd half faster)
    if (distM >= 15000 && hrMean < fc_ef_max && s && s.vel.length > 100) {
      const half = Math.floor(s.vel.length / 2);
      const v1 = MathUtils.mean(s.vel.slice(0, half).filter(v => v > 0));
      const v2 = MathUtils.mean(s.vel.slice(half).filter(v => v > 0));
      if (v1 > 0 && (v2 - v1) / v1 > 0.08) return 'long_run_progressive';
    }

    // 9. LONG RUN
    if (distM >= 15000 && hrMean < fc_ef_max) return 'long_run';

    // 10. EF (endurance fondamentale)
    if (hrMean < fc_ef_max && cvVel < 0.22) return 'ef';

    // Default
    if (distM < 6000) return 'recovery';
    return 'ef';
  }

  // Classify all activities and cache
  function classifyAll(activities, fcmax) {
    const result = {};
    for (const a of activities) {
      const streams = Strava.getCachedStreams(a.id);
      result[a.id] = classify(a, streams, fcmax);
    }
    return result;
  }

  // Get taper sessions (light sessions in 10 days before a competition)
  function markTaperSessions(activities, classifications, fcmax) {
    // Find competition dates
    const raceDates = activities
      .filter(a => classifications[a.id] === 'race')
      .map(a => new Date(a.start_date_local).getTime());

    if (raceDates.length === 0) return classifications;

    const updated = { ...classifications };
    for (const a of activities) {
      if (updated[a.id] === 'race') continue;
      const aDate = new Date(a.start_date_local).getTime();
      const isBeforeRace = raceDates.some(rd => {
        const diff = rd - aDate;
        return diff > 0 && diff < 10 * 86400 * 1000;
      });
      if (isBeforeRace && (a.distance || 0) < 8000 &&
          (a.average_heartrate || 0) < (fcmax || 190) * 0.75) {
        updated[a.id] = 'taper';
      }
    }
    return updated;
  }

  // Human-readable type names
  const TYPE_LABELS = {
    recovery: 'Récupération',
    ef: 'Endurance fondamentale',
    long_run: 'Sortie longue',
    long_run_progressive: 'SL progressive',
    tempo: 'Tempo',
    threshold: 'Seuil',
    intervals_short: 'Intervalles courts',
    intervals_medium: 'Intervalles médiums',
    intervals_long: 'Intervalles longs',
    race: 'Compétition',
    taper: 'Affûtage',
    hills: 'Côtes',
    trail: 'Trail'
  };

  // CSS badge class
  const TYPE_BADGE = {
    recovery: 'badge-recovery',
    ef: 'badge-ef',
    long_run: 'badge-long',
    long_run_progressive: 'badge-long',
    tempo: 'badge-tempo',
    threshold: 'badge-threshold',
    intervals_short: 'badge-interval',
    intervals_medium: 'badge-interval',
    intervals_long: 'badge-interval',
    race: 'badge-race',
    taper: 'badge-taper',
    hills: 'badge-hills',
    trail: 'badge-trail'
  };

  function getLabel(type) {
    return TYPE_LABELS[type] || type;
  }
  function getBadgeClass(type) {
    return TYPE_BADGE[type] || 'badge-unknown';
  }

  return {
    classify,
    classifyAll,
    markTaperSessions,
    getLabel,
    getBadgeClass
  };
})();
