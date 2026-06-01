/* ============================================================
   map.js — Leaflet map rendering for session detail
   ============================================================ */

const MapModule = (() => {
  let currentMap = null;

  // Dark tile layer
  const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

  function destroyMap() {
    if (currentMap) {
      currentMap.remove();
      currentMap = null;
    }
  }

  // Render activity map in given container ID
  function renderActivityMap(containerId, latlng) {
    destroyMap();
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!latlng || latlng.length < 2) {
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#4a4a5a;font-size:0.85rem;">Pas de données GPS</div>';
      return;
    }

    // Create map
    currentMap = L.map(containerId, {
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: false
    });

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTR,
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(currentMap);

    // Add route polyline
    const polyline = L.polyline(latlng, {
      color: '#c8f04a',
      weight: 3,
      opacity: 0.85,
      lineJoin: 'round',
      lineCap: 'round'
    }).addTo(currentMap);

    // Start/end markers
    const startIcon = L.divIcon({
      html: '<div style="width:10px;height:10px;background:#4af0c8;border:2px solid #0f0f11;border-radius:50%;"></div>',
      className: '',
      iconAnchor: [5, 5]
    });
    const endIcon = L.divIcon({
      html: '<div style="width:10px;height:10px;background:#f04a8a;border:2px solid #0f0f11;border-radius:50%;"></div>',
      className: '',
      iconAnchor: [5, 5]
    });

    L.marker(latlng[0], { icon: startIcon }).addTo(currentMap);
    L.marker(latlng[latlng.length - 1], { icon: endIcon }).addTo(currentMap);

    // Fit bounds
    currentMap.fitBounds(polyline.getBounds(), { padding: [20, 20] });

    // Double invalidateSize for mobile reliability
    setTimeout(() => {
      if (currentMap) {
        currentMap.invalidateSize();
        setTimeout(() => { if (currentMap) currentMap.invalidateSize(); }, 300);
      }
    }, 150);
  }

  // Encode/decode polyline (Strava uses Google's encoded polyline)
  function decodePolyline(encoded) {
    if (!encoded) return [];
    const poly = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = (result & 1) ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = (result & 1) ? ~(result >> 1) : result >> 1;
      lng += dlng;

      poly.push([lat / 1e5, lng / 1e5]);
    }
    return poly;
  }

  // Get lat/lng from streams or polyline
  function getLatLng(streams, activity) {
    if (streams?.latlng?.data && streams.latlng.data.length > 0) {
      return streams.latlng.data;
    }
    if (activity?.map?.summary_polyline) {
      return decodePolyline(activity.map.summary_polyline);
    }
    if (activity?.map?.polyline) {
      return decodePolyline(activity.map.polyline);
    }
    return null;
  }

  return {
    renderActivityMap,
    destroyMap,
    decodePolyline,
    getLatLng
  };
})();
