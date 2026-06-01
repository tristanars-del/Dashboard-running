/* ============================================================
   utils.js — Utility functions
   ============================================================ */

// Safe localStorage with quota handling
const Store = {
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
        console.warn('[Store] Quota exceeded, clearing localStorage');
        localStorage.clear();
        try {
          localStorage.setItem(key, JSON.stringify(value));
          return true;
        } catch (e2) {
          console.error('[Store] Still failing after clear:', e2);
          return false;
        }
      }
      return false;
    }
  },
  get(key) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch {}
  },
  clear() {
    try { localStorage.clear(); } catch {}
  }
};

// Date helpers
const DateUtils = {
  // Format date as "12 mai" or "12 mai 2024"
  format(date, showYear = false) {
    if (!date) return '—';
    const d = date instanceof Date ? date : new Date(date);
    const months = ['jan.', 'fév.', 'mars', 'avr.', 'mai', 'juin',
                    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const str = `${d.getDate()} ${months[d.getMonth()]}`;
    return showYear ? `${str} ${d.getFullYear()}` : str;
  },

  formatFull(date) {
    if (!date) return '—';
    const d = date instanceof Date ? date : new Date(date);
    const days = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
    const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  },

  formatTime(date) {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  },

  // Start of week (Monday)
  weekStart(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0 = sunday
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  },

  // Get Monday of current week
  currentWeekStart() {
    return this.weekStart(new Date());
  },

  // Subtract days from today
  daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d;
  },

  // Parse filter period string → Date cutoff
  periodToDate(period) {
    const now = new Date();
    switch (period) {
      case '1m':  return new Date(now.setMonth(now.getMonth() - 1));
      case '3m':  return new Date(now.setMonth(now.getMonth() - 3));
      case '6m':  return new Date(now.setMonth(now.getMonth() - 6));
      case '1y':  return new Date(now.setFullYear(now.getFullYear() - 1));
      case '4w':  return DateUtils.daysAgo(28);
      case '8w':  return DateUtils.daysAgo(56);
      case '12w': return DateUtils.daysAgo(84);
      case '7d':  return DateUtils.daysAgo(7);
      case '30d': return DateUtils.daysAgo(30);
      case '90d': return DateUtils.daysAgo(90);
      default:    return null; // "all"
    }
  },

  isoDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().split('T')[0];
  }
};

// Number / pace formatters
const Fmt = {
  // seconds → "1:23:45" or "23:45"
  duration(seconds) {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
    return `${m}:${String(s).padStart(2,'0')}`;
  },

  // seconds per km → "4:32 /km"
  pace(secPerKm) {
    if (!secPerKm || secPerKm === Infinity) return '—';
    const m = Math.floor(secPerKm / 60);
    const s = Math.round(secPerKm % 60);
    return `${m}:${String(s).padStart(2,'0')} /km`;
  },

  // meters → "12.3 km" or "800 m"
  distance(meters) {
    if (!meters) return '—';
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
    return `${Math.round(meters)} m`;
  },

  // meters → "12.3" (just number, no unit)
  km(meters) {
    if (!meters) return '0';
    return (meters / 1000).toFixed(1);
  },

  // bpm
  bpm(v) {
    if (!v) return '—';
    return `${Math.round(v)} bpm`;
  },

  // elevation
  elevation(m) {
    if (!m) return '—';
    return `${Math.round(m)} m`;
  },

  // Round to n decimals
  round(v, n = 1) {
    if (v === null || v === undefined) return '—';
    return parseFloat(v).toFixed(n);
  },

  // Short time label for chart axes (e.g. "12 mai")
  chartDate(dateOrStr) {
    return DateUtils.format(dateOrStr);
  }
};

// Math helpers
const MathUtils = {
  mean(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  },

  percentile(arr, p) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[idx];
  },

  stddev(arr) {
    if (!arr || arr.length < 2) return 0;
    const m = MathUtils.mean(arr);
    const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  },

  cv(arr) {
    const m = MathUtils.mean(arr);
    if (m === 0) return 0;
    return MathUtils.stddev(arr) / m;
  },

  // Exponential moving average (lambda = 1 - 1/span)
  ema(values, span) {
    const lambda = 1 - 1 / span;
    let ema = 0;
    for (const v of values) {
      ema = lambda * ema + (1 - lambda) * v;
    }
    return ema;
  },

  // Build daily EMA series
  buildEmaSeries(dailyLoad, span) {
    const lambda = 1 - 1 / span;
    let val = 0;
    return dailyLoad.map(v => {
      val = lambda * val + (1 - lambda) * v;
      return val;
    });
  },

  clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }
};

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Group array by key
function groupBy(arr, fn) {
  const map = {};
  for (const item of arr) {
    const key = fn(item);
    if (!map[key]) map[key] = [];
    map[key].push(item);
  }
  return map;
}

// Generate a range of dates (daily)
function dateRange(start, end) {
  const dates = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setHours(0, 0, 0, 0);
  while (cur <= e) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// Format seconds to a race time string "1h23'45"
function fmtRaceTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}h${String(m).padStart(2,'0')}'${String(s).padStart(2,'0')}`;
  return `${m}'${String(s).padStart(2,'0')}`;
}

// Debounce
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
