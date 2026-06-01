/* ============================================================
   charts.js — All Chart.js chart rendering
   ============================================================ */

const Charts = (() => {
  const instances = {};

  // Chart.js global defaults
  function initDefaults() {
    Chart.defaults.color = '#7a7a90';
    Chart.defaults.font.family = "'DM Sans', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyleWidth = 8;
    Chart.defaults.plugins.legend.labels.padding = 16;
    Chart.defaults.plugins.tooltip.backgroundColor = '#1e1e24';
    Chart.defaults.plugins.tooltip.borderColor = '#2a2a34';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.titleColor = '#e8e8f0';
    Chart.defaults.plugins.tooltip.bodyColor = '#7a7a90';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.scale.grid.color = '#1e1e24';
    Chart.defaults.scale.ticks.color = '#7a7a90';
  }

  // Destroy existing chart if any
  function destroy(id) {
    if (instances[id]) {
      instances[id].destroy();
      delete instances[id];
    }
  }

  // Format date for axis label (French short)
  function fmtAxisDate(date) {
    return DateUtils.format(date);
  }

  // ─── VO2MAX MINI (home) ────────────────────────────────────
  function renderVo2maxMini(canvasId, history) {
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || history.length < 2) return;

    // Last 8 weeks
    const cutoff = DateUtils.daysAgo(56);
    const data = history.filter(p => p.date >= cutoff);
    if (data.length < 2) return;

    const labels = data.map(p => fmtAxisDate(p.date));
    const values = data.map(p => parseFloat(p.vo2.toFixed(1)));
    const first = values[0];
    const last = values[values.length - 1];
    const delta = last - first;

    // Trend line
    const n = data.length;
    const xMean = (n - 1) / 2;
    const yMean = MathUtils.mean(values);
    let num = 0, den = 0;
    values.forEach((y, i) => { num += (i - xMean) * (y - yMean); den += (i - xMean) ** 2; });
    const slope = den ? num / den : 0;
    const trendLine = values.map((_, i) => parseFloat((yMean + slope * (i - xMean)).toFixed(1)));

    instances[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'VO2max',
            data: values,
            borderColor: '#4af0c8',
            backgroundColor: 'rgba(74,240,200,0.08)',
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointHoverRadius: 5
          },
          {
            label: 'Tendance',
            data: trendLine,
            borderColor: '#c8f04a',
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false,
            tension: 0
          }
        ]
      },
      options: {
        responsive: true,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.raw} ml/kg/min`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } },
          y: {
            min: Math.floor(Math.min(...values) - 2),
            max: Math.ceil(Math.max(...values) + 2),
            ticks: { callback: v => v.toFixed(0) }
          }
        }
      }
    });

    return delta;
  }

  // ─── WEEKLY VOLUME STACKED ─────────────────────────────────
  function renderWeeklyVolume(canvasId, activities, classifications, cutoff) {
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const filtered = cutoff
      ? activities.filter(a => new Date(a.start_date_local) >= cutoff)
      : activities;

    const byWeek = Metrics.weeklyVolumes(activities, classifications, cutoff);
    const weeks = Object.keys(byWeek).sort();

    const typeColors = {
      recovery: '#4a5a6a',
      ef: '#4af0c8',
      long_run: '#4a90f0',
      long_run_progressive: '#4a6af0',
      tempo: '#f0a84a',
      threshold: '#f04a8a',
      intervals_short: '#c8f04a',
      intervals_medium: '#a0d040',
      intervals_long: '#80b030',
      race: '#f04a4a',
      taper: '#8c4af0',
      hills: '#c88c4a',
      trail: '#4ac84a',
      unknown: '#444450'
    };

    const allTypes = [...new Set(Object.values(classifications))];
    const datasets = allTypes.map(type => ({
      label: Classify.getLabel(type),
      data: weeks.map(wk => parseFloat((byWeek[wk]?.byType?.[type] || 0).toFixed(1))),
      backgroundColor: typeColors[type] || '#444450',
      stack: 'volume'
    }));

    const labels = weeks.map(w => fmtAxisDate(new Date(w)));

    instances[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { grid: { display: false } },
          y: {
            stacked: true,
            ticks: { callback: v => `${v} km` }
          }
        }
      }
    });
  }

  // ─── HR ZONES TIME STACKED ─────────────────────────────────
  function renderHrZonesTime(canvasId, activities, zones, cutoff) {
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const filtered = cutoff
      ? activities.filter(a => new Date(a.start_date_local) >= cutoff)
      : activities;

    const byWeek = {};
    for (const a of filtered) {
      const wk = DateUtils.isoDate(DateUtils.weekStart(new Date(a.start_date_local)));
      if (!byWeek[wk]) byWeek[wk] = [0, 0, 0, 0, 0];

      const streams = Strava.getCachedStreams(a.id);
      if (streams?.heartrate?.data) {
        const times = Metrics.timeInZones(streams.heartrate.data, zones);
        times.forEach((t, i) => { byWeek[wk][i] += t / 60; }); // convert to minutes
      } else {
        // Estimate from average HR
        if (a.average_heartrate) {
          const z = Metrics.getHrZone(a.average_heartrate, zones) - 1;
          byWeek[wk][z] += (a.moving_time || 0) / 60;
        }
      }
    }

    const weeks = Object.keys(byWeek).sort();
    const labels = weeks.map(w => fmtAxisDate(new Date(w)));
    const zoneColors = ['#4a90f0', '#4af0c8', '#c8f04a', '#f0a84a', '#f04a8a'];
    const zoneNames = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];

    const datasets = zoneNames.map((name, i) => ({
      label: name,
      data: weeks.map(wk => parseFloat((byWeek[wk][i] || 0).toFixed(0))),
      backgroundColor: zoneColors[i],
      stack: 'zones'
    }));

    instances[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { grid: { display: false } },
          y: {
            stacked: true,
            ticks: { callback: v => `${v} min` }
          }
        }
      }
    });
  }

  // ─── PIE CHARTS ───────────────────────────────────────────
  function renderTypePie(canvasId, activities, classifications, cutoff) {
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const filtered = cutoff
      ? activities.filter(a => new Date(a.start_date_local) >= cutoff)
      : activities;

    const counts = {};
    for (const a of filtered) {
      const t = classifications[a.id] || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    }

    const typeColors = {
      recovery: '#4a5a6a', ef: '#4af0c8', long_run: '#4a90f0',
      long_run_progressive: '#4a6af0', tempo: '#f0a84a', threshold: '#f04a8a',
      intervals_short: '#c8f04a', intervals_medium: '#a0d040', intervals_long: '#80b030',
      race: '#f04a4a', taper: '#8c4af0', hills: '#c88c4a', trail: '#4ac84a', unknown: '#444450'
    };

    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    instances[canvasId] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: entries.map(([t]) => Classify.getLabel(t)),
        datasets: [{ data: entries.map(([,c]) => c), backgroundColor: entries.map(([t]) => typeColors[t] || '#444450'), borderWidth: 0, hoverOffset: 4 }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }
      }
    });
  }

  function renderHrZonePie(canvasId, activities, zones, cutoff) {
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const filtered = cutoff
      ? activities.filter(a => new Date(a.start_date_local) >= cutoff)
      : activities;

    const totals = [0, 0, 0, 0, 0];
    for (const a of filtered) {
      const streams = Strava.getCachedStreams(a.id);
      if (streams?.heartrate?.data) {
        const t = Metrics.timeInZones(streams.heartrate.data, zones);
        t.forEach((v, i) => { totals[i] += v; });
      } else if (a.average_heartrate) {
        const z = Metrics.getHrZone(a.average_heartrate, zones) - 1;
        totals[z] += (a.moving_time || 0);
      }
    }

    const zoneColors = ['#4a90f0', '#4af0c8', '#c8f04a', '#f0a84a', '#f04a8a'];
    const labels = zones.map(z => z.name.split('—')[0].trim());

    instances[canvasId] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: totals.map(t => Math.round(t / 60)), backgroundColor: zoneColors, borderWidth: 0, hoverOffset: 4 }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 10 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${Fmt.duration(ctx.raw * 60)}` } }
        }
      }
    });
  }

  // ─── ATL / CTL / TSB ──────────────────────────────────────
  function renderAtlCtl(canvasId, series, cutoff) {
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || !series.length) return;

    const filtered = cutoff ? series.filter(p => p.date >= cutoff) : series;
    if (filtered.length < 7) return;

    // Sample every 3 days for performance
    const sampled = filtered.filter((_, i) => i % 3 === 0);

    instances[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: sampled.map(p => fmtAxisDate(p.date)),
        datasets: [
          {
            label: 'CTL (Forme)',
            data: sampled.map(p => p.ctl),
            borderColor: '#4af0c8',
            backgroundColor: 'rgba(74,240,200,0.05)',
            fill: true,
            tension: 0.4,
            pointRadius: 0
          },
          {
            label: 'ATL (Fatigue)',
            data: sampled.map(p => p.atl),
            borderColor: '#f04a8a',
            backgroundColor: 'rgba(240,74,138,0.05)',
            fill: true,
            tension: 0.4,
            pointRadius: 0
          },
          {
            label: 'TSB (Forme)',
            data: sampled.map(p => p.tsb),
            borderColor: '#c8f04a',
            borderDash: [4, 2],
            pointRadius: 0,
            fill: false,
            yAxisID: 'tsb'
          }
        ]
      },
      options: {
        responsive: true,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
          y: { title: { display: true, text: 'ATL / CTL' } },
          tsb: { position: 'right', title: { display: true, text: 'TSB' }, grid: { display: false } }
        }
      }
    });
  }

  // ─── VO2MAX HISTORY ────────────────────────────────────────
  function renderVo2maxHistory(canvasId, history, cutoff) {
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || history.length < 2) return;

    const filtered = cutoff ? history.filter(p => p.date >= cutoff) : history;
    if (filtered.length < 2) return;

    instances[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: filtered.map(p => fmtAxisDate(p.date)),
        datasets: [{
          label: 'VO2max',
          data: filtered.map(p => parseFloat(p.vo2.toFixed(1))),
          borderColor: '#4af0c8',
          backgroundColor: 'rgba(74,240,200,0.08)',
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
          y: { ticks: { callback: v => v.toFixed(1) } }
        }
      }
    });
  }

  // ─── RACE TIME EVOLUTION ───────────────────────────────────
  function renderRaceTime(canvasId, vo2History, distM, cutoff) {
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || vo2History.length < 2) return;

    const filtered = cutoff ? vo2History.filter(p => p.date >= cutoff) : vo2History;

    const data = filtered.map(p => {
      const vma = Metrics.computeVDOT(p.vo2);
      const secs = Metrics.predictRaceTime(vma, distM);
      return secs ? secs : null;
    });

    instances[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: filtered.map(p => fmtAxisDate(p.date)),
        datasets: [{
          label: 'Chrono estimé',
          data,
          borderColor: '#c8f04a',
          backgroundColor: 'rgba(200,240,74,0.08)',
          fill: true,
          tension: 0.4,
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ctx.raw ? ` ${fmtRaceTime(ctx.raw)}` : ' —' } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
          y: {
            reverse: true, // faster = lower on Y
            ticks: { callback: v => fmtRaceTime(v) }
          }
        }
      }
    });
  }

  // ─── EF PACE HISTORY ──────────────────────────────────────
  function renderEfPace(canvasId, efHistory) {
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || efHistory.length < 2) return;

    instances[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: efHistory.map(p => fmtAxisDate(p.date)),
        datasets: [{
          label: 'Allure EF',
          data: efHistory.map(p => parseFloat(p.pace.toFixed(0))),
          borderColor: '#4af0c8',
          backgroundColor: 'rgba(74,240,200,0.08)',
          fill: true,
          tension: 0.4,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` Allure: ${Fmt.pace(ctx.raw)}` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
          y: { reverse: true, ticks: { callback: v => Fmt.pace(v) } }
        }
      }
    });
  }

  // ─── PACE VS HR SCATTER ───────────────────────────────────
  function renderPaceHrScatter(canvasId, activities) {
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const data = activities
      .filter(a => a.average_heartrate && a.average_speed && a.distance > 3000)
      .map(a => ({
        x: a.average_heartrate,
        y: 1000 / (a.average_speed * 60)
      }));

    if (data.length < 5) return;

    instances[canvasId] = new Chart(canvas, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Séances',
          data,
          backgroundColor: 'rgba(74,240,200,0.4)',
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        interaction: { intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.raw.x} bpm — ${Fmt.pace(ctx.raw.y)}`
            }
          }
        },
        scales: {
          x: { title: { display: true, text: 'FC moy (bpm)' }, grid: { color: '#1e1e24' } },
          y: { reverse: true, title: { display: true, text: 'Allure (/km)' }, ticks: { callback: v => Fmt.pace(v) } }
        }
      }
    });
  }

  // ─── PR PROGRESSION (step chart) ──────────────────────────
  function renderPrProgression(canvasId, prHistory) {
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || prHistory.length < 2) return;

    const sorted = [...prHistory].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Build step data: each PR is a new record, time stays constant until next PR
    const labels = sorted.map(p => fmtAxisDate(new Date(p.date)));
    const values = sorted.map(p => p.elapsed_time);

    instances[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Record',
          data: values,
          borderColor: '#c8f04a',
          backgroundColor: 'rgba(200,240,74,0.08)',
          stepped: 'before',
          fill: true,
          pointRadius: 5,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${Fmt.duration(ctx.raw)}`
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            reverse: true,
            ticks: { callback: v => Fmt.duration(v) }
          }
        }
      }
    });
  }

  // ─── SESSION DETAIL CHARTS ────────────────────────────────
  function renderSessionDetail(hrCanvasId, paceCanvasId, streams, durationSec) {
    if (!streams) return;

    const timeData = streams.time?.data || [];
    const hrData = streams.heartrate?.data || [];
    const velData = streams.velocity_smooth?.data || [];

    // Sample data to max 300 points for performance
    const maxPoints = 300;
    const step = Math.max(1, Math.floor(timeData.length / maxPoints));

    const labels = [];
    const hrSampled = [];
    const paceSampled = [];

    for (let i = 0; i < timeData.length; i += step) {
      const t = timeData[i];
      labels.push(Fmt.duration(t));
      hrSampled.push(hrData[i] || null);
      const vel = velData[i] || 0;
      paceSampled.push(vel > 0 ? parseFloat((1000 / (vel * 60)).toFixed(0)) : null);
    }

    // HR chart
    if (hrSampled.some(v => v !== null)) {
      destroy(hrCanvasId);
      const hrCanvas = document.getElementById(hrCanvasId);
      if (hrCanvas) {
        instances[hrCanvasId] = new Chart(hrCanvas, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'FC (bpm)',
              data: hrSampled,
              borderColor: '#f04a8a',
              backgroundColor: 'rgba(240,74,138,0.08)',
              fill: true,
              tension: 0.3,
              pointRadius: 0,
              spanGaps: true
            }]
          },
          options: {
            responsive: true,
            interaction: { intersect: false, mode: 'index' },
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } },
              y: { title: { display: true, text: 'bpm' } }
            }
          }
        });
      }
    }

    // Pace chart
    if (paceSampled.some(v => v !== null)) {
      destroy(paceCanvasId);
      const paceCanvas = document.getElementById(paceCanvasId);
      if (paceCanvas) {
        instances[paceCanvasId] = new Chart(paceCanvas, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'Allure',
              data: paceSampled,
              borderColor: '#c8f04a',
              backgroundColor: 'rgba(200,240,74,0.08)',
              fill: true,
              tension: 0.3,
              pointRadius: 0,
              spanGaps: true
            }]
          },
          options: {
            responsive: true,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: ctx => ctx.raw ? ` ${Fmt.pace(ctx.raw)}` : ' —' } }
            },
            scales: {
              x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } },
              y: { reverse: true, title: { display: true, text: '/km' }, ticks: { callback: v => Fmt.pace(v) } }
            }
          }
        });
      }
    }
  }

  return {
    initDefaults,
    destroy,
    renderVo2maxMini,
    renderWeeklyVolume,
    renderHrZonesTime,
    renderTypePie,
    renderHrZonePie,
    renderAtlCtl,
    renderVo2maxHistory,
    renderRaceTime,
    renderEfPace,
    renderPaceHrScatter,
    renderPrProgression,
    renderSessionDetail
  };
})();
