/* ============================================================
   ui.js — Page rendering and UI state management
   ============================================================ */

const UI = (() => {
  let currentPage = 'home';
  let appState = {}; // shared state from app.js

  // ─── PAGE NAVIGATION ──────────────────────────────────────
  function init(state) {
    appState = state;

    // Hamburger / drawer
    document.getElementById('hamburger').addEventListener('click', openDrawer);
    document.getElementById('drawer-close').addEventListener('click', closeDrawer);
    document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);

    // Nav items
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const page = el.getAttribute('data-page');
        navigateTo(page);
        closeDrawer();
      });
    });

    // Logout / refresh
    document.getElementById('logout-btn').addEventListener('click', () => {
      if (confirm('Déconnecter et effacer les données locales ?')) Auth.logout();
    });
    document.getElementById('refresh-btn').addEventListener('click', async () => {
      closeDrawer();
      Strava.clearCache();
      window.location.reload();
    });

    // Back from session detail
    document.getElementById('back-to-sessions').addEventListener('click', () => {
      document.getElementById('session-detail-view').classList.add('hidden');
      document.getElementById('session-list-view').classList.remove('hidden');
      MapModule.destroyMap();
    });

    // Setup form
    document.getElementById('setup-save-btn').addEventListener('click', () => {
      const cid = document.getElementById('setup-client-id').value.trim();
      const csec = document.getElementById('setup-client-secret').value.trim();
      if (!cid || !csec) { alert('Veuillez remplir les deux champs.'); return; }
      Auth.saveCredentials(cid, csec);
      document.getElementById('setup-modal').classList.add('hidden');
      Auth.startOAuth();
    });

    // Set redirect URI in modal
    document.getElementById('redirect-uri-display').textContent = Auth.getRedirectUri();
  }

  function openDrawer() {
    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.remove('hidden');
    document.getElementById('drawer').classList.remove('hidden');
  }

  function closeDrawer() {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.add('hidden');
  }

  function navigateTo(page) {
    currentPage = page;

    // Hide all pages
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
      p.classList.add('hidden');
    });

    // Show target page
    const target = document.getElementById(`page-${page}`);
    if (target) {
      target.classList.add('active');
      target.classList.remove('hidden');
    }

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-page') === page);
    });

    // Update topbar title
    const titles = {
      home: 'Accueil', analysis: 'Analyse', performance: 'Performance',
      records: 'Records', sessions: 'Séances', methods: 'Méthodes'
    };
    document.getElementById('page-title').textContent = titles[page] || page;

    // Render page content
    renderPage(page);
  }

  function renderPage(page) {
    if (!appState.activities) return;
    switch (page) {
      case 'home':       renderHome(); break;
      case 'analysis':   renderAnalysis(); break;
      case 'performance': renderPerformance(); break;
      case 'records':    renderRecords(); break;
      case 'sessions':   renderSessions(); break;
      case 'methods':    renderMethods(); break;
    }
  }

  // ─── HOME PAGE ────────────────────────────────────────────
  function renderHome() {
    const { activities, fcmax, zones, vo2History, atlCtlSeries, classifications } = appState;

    // TSB
    const form = Metrics.getCurrentForm(atlCtlSeries);
    const tsbInfo = Metrics.tsbLabel(form.tsb);
    const tsbEl = document.getElementById('home-tsb');
    tsbEl.textContent = form.tsb > 0 ? `+${form.tsb.toFixed(0)}` : form.tsb.toFixed(0);
    tsbEl.className = `stat-value ${tsbInfo.cls}`;
    document.getElementById('home-tsb-label').textContent = tsbInfo.text;

    // VO2max
    const latestVo2 = vo2History.length ? vo2History[vo2History.length - 1].vo2 : null;
    document.getElementById('home-vo2max').textContent = latestVo2 ? latestVo2.toFixed(1) : '—';

    // Weekly volume
    const weekStart = DateUtils.currentWeekStart();
    const weekRuns = activities.filter(a => new Date(a.start_date_local) >= weekStart);
    const weekKm = weekRuns.reduce((s, a) => s + (a.distance || 0) / 1000, 0);
    document.getElementById('home-weekly-vol').textContent = weekKm.toFixed(1);

    // Week range label
    const today = new Date();
    document.getElementById('home-week-range').textContent =
      `${DateUtils.format(weekStart)} – ${DateUtils.format(today)}`;

    // Week sessions list
    renderWeekSessions(weekRuns);

    // Last session
    if (activities.length > 0) renderLastSession(activities[0]);

    // VO2max mini chart
    const delta = Charts.renderVo2maxMini('chart-vo2max-home', vo2History);
    if (delta !== undefined && latestVo2) {
      const sign = delta >= 0 ? '+' : '';
      // Could append delta to the section title — skip for simplicity
    }

    // Alert banner
    renderAlert(form, activities);
  }

  function renderWeekSessions(weekRuns) {
    const container = document.getElementById('home-week-sessions');
    if (!weekRuns.length) {
      container.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;">Aucune séance cette semaine</p>';
      return;
    }
    container.innerHTML = weekRuns.map(a => sessionCardHTML(a, true)).join('');
    container.querySelectorAll('.session-see-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSessionDetail(parseInt(btn.dataset.id));
      });
    });
    container.querySelectorAll('.session-card').forEach(card => {
      card.addEventListener('click', () => openSessionDetail(parseInt(card.dataset.id)));
    });
  }

  function renderLastSession(activity) {
    const container = document.getElementById('home-last-session');
    container.innerHTML = sessionCardHTML(activity, true);
    container.querySelector('.session-see-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openSessionDetail(activity.id);
    });
    container.querySelector('.session-card')?.addEventListener('click', () => openSessionDetail(activity.id));
  }

  function renderAlert(form, activities) {
    const banner = document.getElementById('alert-banner');
    let msg = '', cls = '';

    if (form.tsb < -25) {
      msg = '⚠️ Fatigue élevée (TSB ' + form.tsb.toFixed(0) + '). Priorisez la récupération.';
      cls = 'danger';
    } else if (form.tsb > 10) {
      msg = '✅ Vous êtes frais (TSB +' + form.tsb.toFixed(0) + '). Idéal pour une séance clé ou compétition !';
      cls = 'success';
    } else if (form.atl > form.ctl * 1.3) {
      msg = '🟠 Charge récente élevée. Pensez à intégrer une journée de récupération.';
      cls = '';
    }

    if (msg) {
      banner.textContent = msg;
      banner.className = `alert-banner ${cls}`;
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }

  // ─── SESSION CARD HTML ────────────────────────────────────
  function sessionCardHTML(activity, showBtn = false) {
    const type = appState.classifications?.[activity.id] || 'unknown';
    const badgeClass = Classify.getBadgeClass(type);
    const label = Classify.getLabel(type);
    const date = DateUtils.formatFull(new Date(activity.start_date_local));
    const dist = Fmt.km(activity.distance);
    const dur = Fmt.duration(activity.moving_time);
    const pace = activity.average_speed
      ? Fmt.pace(1000 / activity.average_speed)
      : '—';
    const hr = activity.average_heartrate ? `${Math.round(activity.average_heartrate)} bpm` : '—';

    return `
      <div class="session-card" data-id="${activity.id}">
        <span class="session-badge ${badgeClass}">${label}</span>
        <div class="session-info">
          <div class="session-name">${activity.name}</div>
          <div class="session-meta">${date}</div>
        </div>
        <div class="session-stats">
          <div class="session-stat">
            <div class="val">${dist} km</div>
            <div class="lbl">Distance</div>
          </div>
          <div class="session-stat">
            <div class="val">${dur}</div>
            <div class="lbl">Durée</div>
          </div>
          <div class="session-stat">
            <div class="val">${pace}</div>
            <div class="lbl">Allure</div>
          </div>
          <div class="session-stat">
            <div class="val">${hr}</div>
            <div class="lbl">FC moy</div>
          </div>
        </div>
        ${showBtn ? `<button class="session-see-btn" data-id="${activity.id}">Voir →</button>` : ''}
      </div>`;
  }

  // ─── SESSION DETAIL ────────────────────────────────────────
  async function openSessionDetail(activityId, fromPage) {
    const { activities, fcmax, zones, classifications } = appState;
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return;

    // Switch to sessions page detail view
    navigateTo('sessions');
    document.getElementById('session-list-view').classList.add('hidden');
    document.getElementById('session-detail-view').classList.remove('hidden');

    const type = classifications[activityId] || 'unknown';
    const streams = Strava.getCachedStreams(activityId);
    const latlng = MapModule.getLatLng(streams, activity);

    const tss = Metrics.computeTSS(activity, fcmax);
    const pace = activity.average_speed ? 1000 / activity.average_speed : null;

    const content = document.getElementById('session-detail-content');
    content.innerHTML = `
      <div class="detail-header">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
          <span class="session-badge ${Classify.getBadgeClass(type)}">${Classify.getLabel(type)}</span>
        </div>
        <h2>${activity.name}</h2>
        <div class="detail-meta">${DateUtils.formatFull(new Date(activity.start_date_local))} à ${DateUtils.formatTime(new Date(activity.start_date_local))}</div>
      </div>

      <div class="detail-stats">
        <div class="detail-stat"><div class="ds-label">Distance</div><div class="ds-val">${Fmt.km(activity.distance)} km</div></div>
        <div class="detail-stat"><div class="ds-label">Durée</div><div class="ds-val">${Fmt.duration(activity.moving_time)}</div></div>
        <div class="detail-stat"><div class="ds-label">Allure moy</div><div class="ds-val">${pace ? Fmt.pace(pace) : '—'}</div></div>
        <div class="detail-stat"><div class="ds-label">FC moy</div><div class="ds-val">${Fmt.bpm(activity.average_heartrate)}</div></div>
        <div class="detail-stat"><div class="ds-label">FC max</div><div class="ds-val">${Fmt.bpm(activity.max_heartrate)}</div></div>
        <div class="detail-stat"><div class="ds-label">D+</div><div class="ds-val">${Fmt.elevation(activity.total_elevation_gain)}</div></div>
        <div class="detail-stat"><div class="ds-label">TSS</div><div class="ds-val">${tss.toFixed(0)}</div></div>
        <div class="detail-stat"><div class="ds-label">Cadence</div><div class="ds-val">${activity.average_cadence ? Math.round(activity.average_cadence * 2) + ' spm' : '—'}</div></div>
      </div>

      <div id="session-map-container" class="map-container"></div>

      <div class="chart-wrap-detail" id="detail-hr-wrap">
        <canvas id="detail-hr-chart"></canvas>
      </div>
      <div class="chart-wrap-detail" id="detail-pace-wrap">
        <canvas id="detail-pace-chart"></canvas>
      </div>

      <div id="detail-auto-analysis" class="auto-analysis"></div>

      <div id="detail-weather-widget"></div>

      <div id="detail-laps-wrap"></div>
    `;

    // Map
    MapModule.renderActivityMap('session-map-container', latlng);

    // Charts
    if (streams) {
      Charts.renderSessionDetail('detail-hr-chart', 'detail-pace-chart', streams, activity.moving_time);
    }

    // Auto analysis
    renderAutoAnalysis(activity, type, streams, fcmax);

    // Weather
    await renderSessionWeather(activity);

    // Laps
    if (activity.laps && activity.laps.length > 1) {
      renderLaps(activity.laps);
    } else if (streams?.distance?.data) {
      renderKmSplits(streams, activity);
    }
  }

  function renderAutoAnalysis(activity, type, streams, fcmax) {
    const el = document.getElementById('detail-auto-analysis');
    const hr = activity.average_heartrate || 0;
    const dist = (activity.distance || 0) / 1000;
    const pctMax = fcmax > 0 ? (hr / fcmax * 100).toFixed(0) : '?';

    let text = `🔍 <strong>Analyse automatique</strong> — Cette séance est classée <em>${Classify.getLabel(type)}</em>. `;

    text += `FC moyenne : ${Math.round(hr)} bpm (${pctMax}% FCmax). `;

    if (type === 'ef') text += `Séance d'endurance fondamentale bien calibrée. Favorise l'adaptation aérobie de base.`;
    else if (type === 'tempo') text += `Allure tempo maintenue. Développe le seuil aérobie.`;
    else if (type === 'threshold') text += `Travail au seuil anaérobie. Séance intense, récupération de 48h recommandée.`;
    else if (type.startsWith('intervals')) text += `Séance fractionnée. Charge neuro-musculaire importante.`;
    else if (type === 'long_run') text += `Sortie longue. Stimulus d'adaptation aérobie maximum.`;
    else if (type === 'recovery') text += `Séance de récupération. Maintient le volume sans ajouter de fatigue.`;
    else if (type === 'race') text += `Compétition. Donnée haute intensité exclue du calcul VO2max lissé.`;
    else if (type === 'trail') text += `Trail. Charge musculaire importante due au dénivelé.`;

    el.innerHTML = text;
  }

  async function renderSessionWeather(activity) {
    const el = document.getElementById('detail-weather-widget');
    if (!el) return;
    try {
      const lat = activity.start_latlng?.[0];
      const lng = activity.start_latlng?.[1];
      if (!lat || !lng) return;
      const w = await Weather.getHistoricalWeather(new Date(activity.start_date_local), lat, lng);
      if (!w || w.temperature === null) return;
      el.innerHTML = `
        <div class="weather-widget">
          <span class="weather-icon">${Weather.wmoIcon(w.weathercode)}</span>
          <div class="weather-info">
            <strong>${Math.round(w.temperature)}°C</strong>
            ${w.precipitation > 0 ? ` · ${w.precipitation.toFixed(1)} mm de pluie` : ''}
            ${w.temperature > 25 ? ' · 🌡️ Chaleur — VO2max exclue du calcul' : ''}
          </div>
        </div>`;
    } catch(e) {}
  }

  function renderLaps(laps) {
    const wrap = document.getElementById('detail-laps-wrap');
    const rows = laps.map(lap => {
      const pace = lap.average_speed ? 1000 / lap.average_speed : null;
      return `<tr>
        <td>${lap.lap_index || '—'}</td>
        <td>${Fmt.km(lap.distance)} km</td>
        <td>${Fmt.duration(lap.moving_time)}</td>
        <td>${pace ? Fmt.pace(pace) : '—'}</td>
        <td>${Fmt.bpm(lap.average_heartrate)}</td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `
      <div class="laps-table-wrap">
        <div class="section-title" style="margin-top:0">Laps</div>
        <table class="laps-table">
          <thead><tr><th>#</th><th>Distance</th><th>Temps</th><th>Allure</th><th>FC</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderKmSplits(streams, activity) {
    const dist = streams.distance?.data || [];
    const hr = streams.heartrate?.data || [];
    const vel = streams.velocity_smooth?.data || [];
    if (dist.length === 0) return;

    const totalKm = dist[dist.length - 1] / 1000;
    const splits = [];
    let kmIndex = 1;

    for (let i = 0; i < dist.length; i++) {
      if (dist[i] >= kmIndex * 1000) {
        // Find average over last 1km section
        const start = splits.length > 0 ? splits[splits.length - 1]._endIdx : 0;
        const section_hr = hr.slice(start, i).filter(v => v > 0);
        const section_vel = vel.slice(start, i).filter(v => v > 0);
        const avgHr = section_hr.length ? MathUtils.mean(section_hr) : null;
        const avgVel = section_vel.length ? MathUtils.mean(section_vel) : null;
        const pace = avgVel ? 1000 / avgVel : null;
        splits.push({
          km: kmIndex,
          avgHr: avgHr ? Math.round(avgHr) : null,
          pace,
          _endIdx: i
        });
        kmIndex++;
        if (kmIndex > 100) break; // safety
      }
    }

    if (splits.length < 2) return;

    const rows = splits.map(s => `<tr>
      <td>Km ${s.km}</td>
      <td>1 km</td>
      <td>${s.pace ? Fmt.pace(s.pace) : '—'}</td>
      <td>${s.avgHr ? s.avgHr + ' bpm' : '—'}</td>
    </tr>`).join('');

    document.getElementById('detail-laps-wrap').innerHTML = `
      <div class="laps-table-wrap">
        <div class="section-title" style="margin-top:0">Splits par km</div>
        <table class="laps-table">
          <thead><tr><th>Km</th><th>Distance</th><th>Allure</th><th>FC</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // ─── ANALYSIS PAGE ────────────────────────────────────────
  function renderAnalysis() {
    const { activities, fcmax, zones, vo2History, atlCtlSeries, classifications } = appState;

    // Period filter pills
    const filterContainer = document.getElementById('analysis-period-filter');
    filterContainer.querySelectorAll('.pill').forEach(p => {
      p.addEventListener('click', () => {
        filterContainer.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
        p.classList.add('active');
        const cutoff = DateUtils.periodToDate(p.dataset.val);
        redrawAnalysis(activities, fcmax, zones, vo2History, atlCtlSeries, classifications, cutoff);
      });
    });

    // Race time selector
    document.getElementById('analysis-race-select').addEventListener('change', () => {
      const pill = filterContainer.querySelector('.pill.active');
      const cutoff = pill ? DateUtils.periodToDate(pill.dataset.val) : DateUtils.daysAgo(56);
      const dist = getRaceDist();
      Charts.renderRaceTime('chart-race-time', vo2History, dist, cutoff);
    });

    // Initial render (8 weeks default)
    const cutoff = DateUtils.daysAgo(56);
    redrawAnalysis(activities, fcmax, zones, vo2History, atlCtlSeries, classifications, cutoff);
  }

  function getRaceDist() {
    const v = document.getElementById('analysis-race-select')?.value;
    return { '5k': 5000, '10k': 10000, 'half': 21097, 'marathon': 42195 }[v] || 5000;
  }

  function redrawAnalysis(activities, fcmax, zones, vo2History, atlCtlSeries, classifications, cutoff) {
    // Metrics summary
    const summary = Metrics.analysisSummary(activities, fcmax, cutoff, classifications);
    const form = Metrics.getCurrentForm(atlCtlSeries);
    const latestVo2 = vo2History.length ? vo2History[vo2History.length - 1].vo2 : null;
    const firstVo2 = cutoff ? vo2History.find(p => p.date >= cutoff) : vo2History[0];
    const vo2Delta = latestVo2 && firstVo2 ? latestVo2 - firstVo2.vo2 : null;

    const metricsEl = document.getElementById('analysis-metrics');
    metricsEl.innerHTML = [
      { label: 'Volume moy/sem', val: summary.avgVolPerWeek?.toFixed(0) + ' km', detail: '' },
      { label: 'Plus grosse sortie', val: summary.biggestRun?.toFixed(1) + ' km', detail: '' },
      { label: 'Plus grosse semaine', val: summary.biggestWeek?.toFixed(0) + ' km', detail: '' },
      { label: 'VO2max Δ', val: vo2Delta !== null ? (vo2Delta >= 0 ? '+' : '') + vo2Delta.toFixed(1) : '—', detail: 'ml/kg/min', color: vo2Delta > 0 ? 'accent' : vo2Delta < 0 ? 'rose' : '' },
      { label: 'Charge (TSS total)', val: summary.totalTSS?.toFixed(0), detail: '' },
      { label: 'Forme (TSB)', val: form.tsb > 0 ? '+' + form.tsb.toFixed(0) : form.tsb.toFixed(0), detail: Metrics.tsbLabel(form.tsb).text },
      { label: 'Nb séances', val: summary.nbSessions, detail: '' },
      { label: 'FC max obs.', val: summary.maxHR ? summary.maxHR + ' bpm' : '—', detail: '' }
    ].map(m => `
      <div class="metric-card">
        <div class="metric-label">${m.label}</div>
        <div class="metric-val ${m.color || ''}">${m.val ?? '—'}</div>
        ${m.detail ? `<div class="metric-detail">${m.detail}</div>` : ''}
      </div>`).join('');

    Charts.renderWeeklyVolume('chart-volume-weekly', activities, classifications, cutoff);
    Charts.renderHrZonesTime('chart-hr-zones-time', activities, zones, cutoff);
    Charts.renderTypePie('chart-type-pie', activities, classifications, cutoff);
    Charts.renderHrZonePie('chart-hr-pie', activities, zones, cutoff);
    Charts.renderAtlCtl('chart-atl-ctl', atlCtlSeries, cutoff);
    Charts.renderVo2maxHistory('chart-vo2max-analysis', vo2History, cutoff);
    Charts.renderRaceTime('chart-race-time', vo2History, getRaceDist(), cutoff);
  }

  // ─── PERFORMANCE PAGE ─────────────────────────────────────
  function renderPerformance() {
    const { activities, fcmax, zones, vo2History, classifications } = appState;
    const latestVo2 = vo2History.length ? vo2History[vo2History.length - 1].vo2 : null;
    const vma = latestVo2 ? Metrics.computeVDOT(latestVo2) : null;

    // Metrics
    const efRecent = Metrics.efPaceHistory(activities, classifications).slice(-5);
    const avgEfPace = efRecent.length ? MathUtils.mean(efRecent.map(p => p.pace)) : null;

    document.getElementById('perf-metrics').innerHTML = [
      { label: 'VO2max <button class="tip-btn" data-tip="vo2max">?</button>', val: latestVo2 ? latestVo2.toFixed(1) : '—', detail: 'ml/kg/min', color: 'turquoise' },
      { label: 'VMA (VDOT) <button class="tip-btn" data-tip="vdot">?</button>', val: vma ? (vma / 1000 * 60).toFixed(2) : '—', detail: 'km/h' },
      { label: 'FCmax dynamique', val: fcmax ? Math.round(fcmax) + ' bpm' : '—', detail: '99e percentile 12m' },
      { label: 'Allure EF récente', val: avgEfPace ? Fmt.pace(avgEfPace) : '—', detail: 'Moy. 5 dernières EF' }
    ].map(m => `
      <div class="metric-card">
        <div class="metric-label">${m.label}</div>
        <div class="metric-val ${m.color || ''}">${m.val}</div>
        ${m.detail ? `<div class="metric-detail">${m.detail}</div>` : ''}
      </div>`).join('');

    // HR Zones
    renderHrZonesDisplay(zones, fcmax);

    // VDOT estimates
    renderVdotEstimates(vma);

    // Training paces
    renderTrainingPaces(vma);

    // Charts
    const efHistory = Metrics.efPaceHistory(activities, classifications);
    Charts.renderEfPace('chart-ef-pace', efHistory);
    Charts.renderPaceHrScatter('chart-pace-hr-scatter', activities);
  }

  function renderHrZonesDisplay(zones, fcmax) {
    const el = document.getElementById('hr-zones-display');
    el.innerHTML = `<div class="zones-list">` +
      zones.map(z => `
        <div class="zone-row">
          <div class="zone-dot" style="background:${z.color}"></div>
          <div class="zone-name">${z.name}</div>
          <div class="zone-range">${z.min} – ${z.max === Math.round(fcmax * 1.1) ? '∞' : z.max} bpm</div>
          <div class="zone-bar-wrap">
            <div class="zone-bar" style="background:${z.color};width:${(z.id / 5) * 100}%"></div>
          </div>
        </div>`).join('') + `</div>`;
  }

  function renderVdotEstimates(vma) {
    const el = document.getElementById('vdot-estimates');
    if (!vma) { el.innerHTML = '<p style="color:var(--text-dim)">Données insuffisantes</p>'; return; }
    const distances = [
      { m: 5000, label: '5 km' }, { m: 10000, label: '10 km' },
      { m: 21097, label: 'Semi' }, { m: 42195, label: 'Marathon' }
    ];
    el.innerHTML = `<div class="vdot-grid">` + distances.map(d => {
      const t = Metrics.predictRaceTime(vma, d.m);
      const pace = t ? t / (d.m / 1000) : null; // s/km
      return `<div class="vdot-card">
        <div class="vdot-dist">${d.label}</div>
        <div class="vdot-time">${t ? fmtRaceTime(t) : '—'}</div>
        <div class="vdot-pace">${pace ? Fmt.pace(pace) : ''}</div>
      </div>`;
    }).join('') + `</div>`;
  }

  function renderTrainingPaces(vma) {
    const el = document.getElementById('training-paces');
    if (!vma) { el.innerHTML = ''; return; }
    const paces = Metrics.trainingPaces(vma);
    el.innerHTML = `<div class="paces-grid">` + Object.entries(paces).map(([k, p]) => {
      const speedMperSec = vma * p.pct / 60; // m/s
      const paceSecPerKm = 1000 / speedMperSec;
      return `<div class="pace-card">
        <div class="pace-type">${p.name}</div>
        <div class="pace-val">${Fmt.pace(paceSecPerKm)}</div>
        <div class="pace-desc">${Math.round(p.pct * 100)}% VMA</div>
      </div>`;
    }).join('') + `</div>`;
  }

  // ─── RECORDS PAGE ─────────────────────────────────────────
  function renderRecords() {
    const { activities, fcmax, classifications } = appState;

    // Period filter
    const filterContainer = document.getElementById('records-period-filter');
    filterContainer.querySelectorAll('.pill').forEach(p => {
      p.addEventListener('click', () => {
        filterContainer.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
        p.classList.add('active');
        const cutoff = DateUtils.periodToDate(p.dataset.val);
        redrawRecords(activities, fcmax, classifications, cutoff);
      });
    });

    // Distance selector for progression chart
    document.getElementById('pr-distance-select').addEventListener('change', () => {
      const distM = parseInt(document.getElementById('pr-distance-select').value);
      const history = Records.buildDistanceHistory(activities, distM);
      Charts.renderPrProgression('chart-pr-progression', history);
    });

    redrawRecords(activities, fcmax, classifications, null);
  }

  function redrawRecords(activities, fcmax, classifications, cutoff) {
    // PR list
    const prs = Records.buildPRs(activities, cutoff);
    const prEl = document.getElementById('pr-list');
    if (prs.length === 0) {
      prEl.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;">Aucun record trouvé. Les best efforts Strava doivent être chargés.</p>';
    } else {
      prEl.innerHTML = prs.map(pr => `
        <div class="record-item">
          <span class="record-dist">${pr.distance_label}</span>
          <span class="record-time">${Fmt.duration(pr.elapsed_time)}</span>
          <span class="record-date">${DateUtils.format(new Date(pr.date), true)}</span>
          <button class="record-link" data-id="${pr.activity_id}">Voir la séance →</button>
        </div>`).join('');
      prEl.querySelectorAll('.record-link').forEach(btn => {
        btn.addEventListener('click', () => openSessionDetail(parseInt(btn.dataset.id)));
      });
    }

    // Progression chart for first distance
    const distM = parseInt(document.getElementById('pr-distance-select')?.value || '5000');
    const history = Records.buildDistanceHistory(activities, distM);
    Charts.renderPrProgression('chart-pr-progression', history);

    // Perf records
    const perf = Records.buildPerfRecords(activities, fcmax, classifications);
    const perfEl = document.getElementById('perf-records');
    perfEl.innerHTML = [
      perf.maxTSS ? { label: 'TSS max (hors compétition)', val: perf.maxTSS.tss, detail: DateUtils.format(new Date(perf.maxTSS.date), true), id: perf.maxTSS.activity_id } : null,
      perf.maxElev ? { label: 'Dénivelé max', val: Fmt.elevation(perf.maxElev.elev), detail: DateUtils.format(new Date(perf.maxElev.date), true), id: perf.maxElev.activity_id } : null,
      perf.longestTime ? { label: 'Séance la plus longue', val: Fmt.duration(perf.longestTime.time), detail: DateUtils.format(new Date(perf.longestTime.date), true), id: perf.longestTime.activity_id } : null,
      perf.maxHR ? { label: 'FC max (12 mois)', val: Fmt.bpm(perf.maxHR.hr), detail: DateUtils.format(new Date(perf.maxHR.date), true), id: perf.maxHR.activity_id } : null
    ].filter(Boolean).map(r => `
      <div class="record-item">
        <span class="record-dist">${r.label}</span>
        <span class="record-time">${r.val}</span>
        <span class="record-date">${r.detail}</span>
        <button class="record-link" data-id="${r.id}">Voir →</button>
      </div>`).join('');
    perfEl.querySelectorAll('.record-link').forEach(btn => {
      btn.addEventListener('click', () => openSessionDetail(parseInt(btn.dataset.id)));
    });

    // Volume records
    const vol = Records.buildVolumeRecords(activities, fcmax);
    const volEl = document.getElementById('vol-records');
    volEl.innerHTML = [
      vol.biggestWeek ? { label: 'Plus grosse semaine', val: vol.biggestWeek.km + ' km', detail: 'Semaine du ' + DateUtils.format(new Date(vol.biggestWeek.week), true), id: null } : null,
      vol.longestRun ? { label: 'Sortie la plus longue', val: vol.longestRun.km + ' km', detail: DateUtils.format(new Date(vol.longestRun.date), true), id: vol.longestRun.activity_id } : null
    ].filter(Boolean).map(r => `
      <div class="record-item">
        <span class="record-dist">${r.label}</span>
        <span class="record-time">${r.val}</span>
        <span class="record-date">${r.detail}</span>
        ${r.id ? `<button class="record-link" data-id="${r.id}">Voir →</button>` : ''}
      </div>`).join('');
    volEl.querySelectorAll('.record-link').forEach(btn => {
      btn.addEventListener('click', () => openSessionDetail(parseInt(btn.dataset.id)));
    });
  }

  // ─── SESSIONS PAGE ────────────────────────────────────────
  let sessionsPage = 1;
  const SESSIONS_PER_PAGE = 20;

  function renderSessions() {
    const { activities, classifications } = appState;

    // Populate type filter
    const typeSelect = document.getElementById('session-type-filter');
    if (typeSelect.options.length <= 1) {
      const types = [...new Set(Object.values(classifications))];
      types.sort().forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = Classify.getLabel(t);
        typeSelect.appendChild(opt);
      });
    }

    // Filters
    const searchInput = document.getElementById('session-search');
    const periodSelect = document.getElementById('session-period-filter');
    const sortSelect = document.getElementById('session-sort');

    const renderFiltered = debounce(() => {
      sessionsPage = 1;
      renderSessionList();
    }, 200);

    searchInput.addEventListener('input', renderFiltered);
    typeSelect.addEventListener('change', renderFiltered);
    periodSelect.addEventListener('change', renderFiltered);
    sortSelect.addEventListener('change', renderFiltered);

    renderSessionList();
  }

  function renderSessionList() {
    const { activities, classifications } = appState;
    const search = document.getElementById('session-search')?.value?.toLowerCase() || '';
    const typeFilter = document.getElementById('session-type-filter')?.value || '';
    const periodFilter = document.getElementById('session-period-filter')?.value || '';
    const sort = document.getElementById('session-sort')?.value || 'date-desc';

    const cutoff = DateUtils.periodToDate(periodFilter);

    let filtered = activities.filter(a => {
      if (cutoff && new Date(a.start_date_local) < cutoff) return false;
      if (typeFilter && classifications[a.id] !== typeFilter) return false;
      if (search && !a.name.toLowerCase().includes(search)) return false;
      return true;
    });

    // Sort
    if (sort === 'date-asc') filtered.sort((a, b) => new Date(a.start_date_local) - new Date(b.start_date_local));
    else if (sort === 'date-desc') filtered.sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local));
    else if (sort === 'dist-desc') filtered.sort((a, b) => (b.distance || 0) - (a.distance || 0));
    else if (sort === 'tss-desc') filtered.sort((a, b) => Metrics.computeTSS(b, appState.fcmax) - Metrics.computeTSS(a, appState.fcmax));

    // Pagination
    const totalPages = Math.ceil(filtered.length / SESSIONS_PER_PAGE);
    if (sessionsPage > totalPages) sessionsPage = 1;
    const start = (sessionsPage - 1) * SESSIONS_PER_PAGE;
    const page = filtered.slice(start, start + SESSIONS_PER_PAGE);

    const container = document.getElementById('sessions-container');
    if (page.length === 0) {
      container.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;padding:20px 0;">Aucune séance trouvée.</p>';
    } else {
      container.innerHTML = page.map(a => sessionCardHTML(a, true)).join('');
      container.querySelectorAll('.session-card').forEach(card => {
        card.addEventListener('click', () => openSessionDetail(parseInt(card.dataset.id)));
      });
      container.querySelectorAll('.session-see-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openSessionDetail(parseInt(btn.dataset.id));
        });
      });
    }

    // Pagination controls
    const pag = document.getElementById('sessions-pagination');
    pag.innerHTML = '';
    if (totalPages <= 1) return;

    const prev = document.createElement('button');
    prev.className = 'page-btn';
    prev.textContent = '← Préc.';
    prev.disabled = sessionsPage === 1;
    prev.addEventListener('click', () => { sessionsPage--; renderSessionList(); });
    pag.appendChild(prev);

    const info = document.createElement('span');
    info.style.cssText = 'color:var(--text-muted);font-size:0.82rem;padding:0 8px;';
    info.textContent = `${sessionsPage} / ${totalPages}`;
    pag.appendChild(info);

    const next = document.createElement('button');
    next.className = 'page-btn';
    next.textContent = 'Suiv. →';
    next.disabled = sessionsPage === totalPages;
    next.addEventListener('click', () => { sessionsPage++; renderSessionList(); });
    pag.appendChild(next);
  }

  // ─── METHODS PAGE ─────────────────────────────────────────
  function renderMethods() {
    document.getElementById('methods-content').innerHTML = `
      <div class="method-block">
        <h2>🏷️ Classification des séances <button class="tip-btn" data-tip="classification">?</button></h2>
        <p>Chaque séance est analysée automatiquement via les streams Strava (vitesse, FC, altitude). 13 catégories sont détectées :</p>
        <table>
          <tr><th>Type</th><th>Critères</th></tr>
          <tr><td>Récupération</td><td>&lt;6km, FC&lt;65% FCmax, &lt;40min</td></tr>
          <tr><td>Endurance fondamentale</td><td>FC&lt;78% FCmax, CV vitesse&lt;0.22</td></tr>
          <tr><td>Sortie longue</td><td>EF + distance ≥15km</td></tr>
          <tr><td>SL progressive</td><td>SL + accélération &gt;8% en 2e moitié</td></tr>
          <tr><td>Tempo</td><td>FC 78–86% FCmax, vitesse stable, &gt;6km</td></tr>
          <tr><td>Seuil</td><td>FC&gt;86% FCmax, vitesse stable, 4–12km</td></tr>
          <tr><td>Intervalles courts</td><td>Blocs d'effort &lt;2min répétés</td></tr>
          <tr><td>Intervalles médiums</td><td>Blocs 2–5min</td></tr>
          <tr><td>Intervalles longs</td><td>Blocs &gt;5min</td></tr>
          <tr><td>Compétition</td><td>FC&gt;88% FCmax, vitesse stable, &gt;5km</td></tr>
          <tr><td>Affûtage</td><td>Séance légère dans les 10j avant compétition</td></tr>
          <tr><td>Côtes</td><td>Dénivelé 25–35m/km + répétitions</td></tr>
          <tr><td>Trail</td><td>Dénivelé &gt;35m/km</td></tr>
        </table>
        <p>Les seuils FC sont calculés dynamiquement en % de FCmax (99e percentile des séances intenses des 12 derniers mois).</p>
      </div>

      <div class="method-block">
        <h2>💓 Zones FC <button class="tip-btn" data-tip="zones">?</button></h2>
        <table>
          <tr><th>Zone</th><th>% FCmax</th><th>Objectif</th></tr>
          <tr><td>Z1 — Récupération</td><td>&lt;60%</td><td>Récupération active</td></tr>
          <tr><td>Z2 — Endurance fond.</td><td>60–75%</td><td>Base aérobie</td></tr>
          <tr><td>Z3 — Tempo</td><td>75–85%</td><td>Seuil aérobie</td></tr>
          <tr><td>Z4 — Seuil anaér.</td><td>85–93%</td><td>Seuil lactique</td></tr>
          <tr><td>Z5 — VO2max</td><td>&gt;93%</td><td>Puissance maximale</td></tr>
        </table>
      </div>

      <div class="method-block">
        <h2>🫁 VO2max — Méthode hybride <button class="tip-btn" data-tip="vo2max">?</button></h2>
        <h3>1. Ancrage sur compétitions (Jack Daniels)</h3>
        <p><code>VO2(v) = 0.000104×v² + 0.182258×v − 4.602</code> où v = vitesse en m/min</p>
        <h3>2. Séances courantes (Firstbeat)</h3>
        <p><code>VO2max ≈ (v×0.2 + 3.5) × (FCmax / FC_moy)</code></p>
        <h3>3. Lissage 28 jours</h3>
        <p>Moyenne pondérée sur fenêtre glissante de 28 jours. Séances à &gt;25°C exclues.</p>
      </div>

      <div class="method-block">
        <h2>⚡ TSS / ATL / CTL / TSB <button class="tip-btn" data-tip="atl">?</button></h2>
        <p><strong>TSS</strong> = durée (h) × (FC_moy / FCmax)² × 100</p>
        <p><strong>ATL</strong> (Fatigue) = EMA 7 jours de TSS quotidien</p>
        <p><strong>CTL</strong> (Fitness) = EMA 42 jours de TSS quotidien</p>
        <p><strong>TSB</strong> (Forme) = CTL − ATL</p>
        <table>
          <tr><th>TSB</th><th>État</th></tr>
          <tr><td>&gt; +5</td><td>✅ Frais — idéal compétition</td></tr>
          <tr><td>0 à +5</td><td>🟢 Équilibré</td></tr>
          <tr><td>−15 à 0</td><td>🟡 Entraîné (fatigue légère)</td></tr>
          <tr><td>&lt; −20</td><td>🔴 Fatigué — récupération nécessaire</td></tr>
        </table>
      </div>

      <div class="method-block">
        <h2>🎯 VDOT — Jack Daniels <button class="tip-btn" data-tip="vdot">?</button></h2>
        <p>Le VDOT est une estimation de VO2max basée sur la performance en course. La VMA (vitesse à VO2max) est calculée en inversant la formule de Jack Daniels.</p>
        <table>
          <tr><th>Allure</th><th>% VMA</th></tr>
          <tr><td>Récupération</td><td>59%</td></tr>
          <tr><td>Endurance fond.</td><td>65%</td></tr>
          <tr><td>Tempo</td><td>80%</td></tr>
          <tr><td>Seuil</td><td>85%</td></tr>
          <tr><td>Intervalles</td><td>97,5%</td></tr>
          <tr><td>Répétitions</td><td>105%</td></tr>
          <tr><td>Marathon</td><td>75%</td></tr>
        </table>
      </div>

      <div class="method-block">
        <h2>🌤️ Météo — Open-Meteo</h2>
        <p>Les données météo utilisent l'API Open-Meteo (gratuite, sans clé API). Les données historiques proviennent de l'archive ERA5. Les conditions à &gt;25°C excluent la séance du calcul VO2max (chaleur = FC artificielle-ment haute).</p>
      </div>
    `;
  }

  // ─── ATHLETE NAME ─────────────────────────────────────────
  function setAthleteName() {
    const athlete = Auth.getAthlete();
    if (athlete) {
      document.getElementById('athlete-name').textContent = `${athlete.firstname || ''} ${athlete.lastname || ''}`.trim();
    }
  }

  return {
    init,
    navigateTo,
    setAthleteName,
    openSessionDetail,
    renderPage
  };
})();
