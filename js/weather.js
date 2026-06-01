/* ============================================================
   weather.js — Open-Meteo API (free, no API key)
   ============================================================ */

const Weather = (() => {
  const BASE = 'https://api.open-meteo.com/v1/forecast';
  const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
  const CACHE_TTL = 3600 * 1000; // 1 hour

  // WMO weather codes → emoji
  const WMO_ICONS = {
    0: '☀️',   // Clear sky
    1: '🌤️', 2: '⛅', 3: '☁️',  // Partly cloudy
    45: '🌫️', 48: '🌫️',         // Fog
    51: '🌦️', 53: '🌦️', 55: '🌦️', // Drizzle
    61: '🌧️', 63: '🌧️', 65: '🌧️', // Rain
    71: '🌨️', 73: '🌨️', 75: '🌨️', // Snow
    80: '🌦️', 81: '🌧️', 82: '🌧️', // Showers
    95: '⛈️', 96: '⛈️', 99: '⛈️'  // Thunderstorm
  };

  function wmoIcon(code) {
    return WMO_ICONS[code] || '🌡️';
  }

  // Get weather for a past date and lat/lng
  async function getHistoricalWeather(date, lat, lng) {
    if (!lat || !lng) return null;
    const dateStr = DateUtils.isoDate(date);
    const cacheKey = `weather_${dateStr}_${lat.toFixed(2)}_${lng.toFixed(2)}`;
    const cached = Store.get(cacheKey);
    if (cached) return cached;

    try {
      const url = new URL(ARCHIVE);
      url.searchParams.set('latitude', lat.toFixed(4));
      url.searchParams.set('longitude', lng.toFixed(4));
      url.searchParams.set('start_date', dateStr);
      url.searchParams.set('end_date', dateStr);
      url.searchParams.set('daily', 'temperature_2m_max,precipitation_sum,weathercode');
      url.searchParams.set('timezone', 'auto');

      const resp = await fetch(url.toString());
      if (!resp.ok) return null;
      const data = await resp.json();

      const result = {
        temperature: data.daily?.temperature_2m_max?.[0] || null,
        precipitation: data.daily?.precipitation_sum?.[0] || 0,
        weathercode: data.daily?.weathercode?.[0] || 0
      };

      Store.set(cacheKey, result);
      return result;
    } catch (e) {
      console.warn('[Weather] Historical fetch failed:', e.message);
      return null;
    }
  }

  // Get current/forecast weather for home page alert
  async function getCurrentWeather(lat, lng) {
    if (!lat || !lng) return null;
    const cacheKey = `weather_current_${lat.toFixed(2)}_${lng.toFixed(2)}`;
    const cached = Store.get(cacheKey);
    const cacheTime = Store.get(cacheKey + '_ts');
    if (cached && cacheTime && Date.now() - cacheTime < CACHE_TTL) return cached;

    try {
      const url = new URL(BASE);
      url.searchParams.set('latitude', lat.toFixed(4));
      url.searchParams.set('longitude', lng.toFixed(4));
      url.searchParams.set('current', 'temperature_2m,weathercode,windspeed_10m,relativehumidity_2m');
      url.searchParams.set('daily', 'temperature_2m_max,precipitation_probability_max,weathercode');
      url.searchParams.set('forecast_days', 3);
      url.searchParams.set('timezone', 'auto');

      const resp = await fetch(url.toString());
      if (!resp.ok) return null;
      const data = await resp.json();

      const result = {
        temperature: data.current?.temperature_2m,
        weathercode: data.current?.weathercode,
        windspeed: data.current?.windspeed_10m,
        humidity: data.current?.relativehumidity_2m,
        icon: wmoIcon(data.current?.weathercode || 0),
        tomorrow: {
          maxTemp: data.daily?.temperature_2m_max?.[1],
          rainProb: data.daily?.precipitation_probability_max?.[1],
          weathercode: data.daily?.weathercode?.[1]
        }
      };

      Store.set(cacheKey, result);
      Store.set(cacheKey + '_ts', Date.now());
      return result;
    } catch (e) {
      console.warn('[Weather] Current weather fetch failed:', e.message);
      return null;
    }
  }

  // Format weather for display
  function formatWeather(w) {
    if (!w) return null;
    return {
      icon: wmoIcon(w.weathercode || 0),
      text: `${w.temperature !== null ? Math.round(w.temperature) + '°C' : '?'}`,
      details: [
        w.windspeed ? `Vent ${Math.round(w.windspeed)} km/h` : null,
        w.humidity ? `Humidité ${Math.round(w.humidity)}%` : null
      ].filter(Boolean).join(' · ')
    };
  }

  // Check if weather is hot (for VO2max exclusion)
  function isHot(temp) {
    return temp !== null && temp !== undefined && temp > 25;
  }

  return {
    getHistoricalWeather,
    getCurrentWeather,
    formatWeather,
    isHot,
    wmoIcon
  };
})();
