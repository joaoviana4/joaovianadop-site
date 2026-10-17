// Localização dos décors: morada → coordenadas, hospital (e polícia/bombeiros) mais perto, sol e tempo.
// Serviços gratuitos, sem chave: OpenStreetMap (Nominatim e Overpass), OSRM (tempo de carro) e Open-Meteo.
// O resultado fica guardado no décor (locations.info.geo e info.near) para não perguntar sempre.

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const OSRM = 'https://router.project-osrm.org/table/v1/driving/';

const R = (d) => (d * Math.PI) / 180;
export const km = (a, b) => { const dLat = R(b.lat - a.lat), dLng = R(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(R(a.lat)) * Math.cos(R(b.lat)) * Math.sin(dLng / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(h)); };
export const pinUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

// coordenadas dentro de um link do Google Maps ou escritas à mão ("38.72, -9.14")
export function coordsFrom(text) {
  const t = String(text || '');
  const m = t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || t.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/) || t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || t.match(/^\s*(-?\d{1,2}\.\d{3,})\s*[,;]\s*(-?\d{1,3}\.\d{3,})\s*$/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

export async function geocode(q) {
  const c = coordsFrom(q); if (c) return { ...c, label: q };
  if (!String(q || '').trim()) return null;
  const tries = [q, String(q).split(',').slice(-2).join(',')];
  for (const t of tries) {
    const u = `${NOMINATIM}?format=jsonv2&limit=1&accept-language=pt&q=${encodeURIComponent(t)}`;
    const r = await fetch(u, { headers: { Accept: 'application/json' } }); if (!r.ok) continue;
    const j = await r.json(); if (j[0]) return { lat: Number(j[0].lat), lng: Number(j[0].lon), label: j[0].display_name, approx: t !== q };
  }
  return null;
}

const kindOf = (tags) => {
  const op = `${tags['operator:type'] || ''} ${tags.operator || ''} ${tags['healthcare:speciality'] || ''} ${tags.name || ''}`.toLowerCase();
  if (/private|privad|cuf|luz saúde|lusíadas|lusiadas|trofa|particular|clínica|clinica/.test(op)) return 'privado';
  if (/public|government|sns|serviço nacional|centro hospitalar|unidade local de saúde|uls|ministério|estado|nhs|santa casa/.test(op)) return 'público';
  return '';
};

// hospitais (com urgência primeiro), polícia e bombeiros à volta, com distância e tempo de carro
export async function nearby(pt) {
  const q = `[out:json][timeout:25];(nwr["amenity"="hospital"](around:40000,${pt.lat},${pt.lng});nwr["amenity"="police"](around:15000,${pt.lat},${pt.lng});nwr["amenity"="fire_station"](around:15000,${pt.lat},${pt.lng}););out center tags;`;
  let els = null;
  for (const u of OVERPASS) { try { const r = await fetch(u, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }); if (r.ok) { els = (await r.json()).elements; break; } } catch { /* tenta o seguinte */ } }
  if (!els) throw new Error('O serviço de mapas não respondeu. Tenta outra vez daqui a pouco.');
  const all = els.map((e) => ({ type: e.tags?.amenity, name: e.tags?.name || e.tags?.['name:pt'] || '', lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon, phone: e.tags?.phone || e.tags?.['contact:phone'] || '', emergency: e.tags?.emergency === 'yes', kind: kindOf(e.tags || {}), addr: [e.tags?.['addr:street'], e.tags?.['addr:housenumber'], e.tags?.['addr:city']].filter(Boolean).join(' ') }))
    .filter((x) => x.lat && x.name).map((x) => ({ ...x, km: km(pt, x) }));
  const pick = (t, n) => all.filter((x) => x.type === t).sort((a, b) => a.km - b.km).slice(0, n);
  let hospitals = all.filter((x) => x.type === 'hospital').sort((a, b) => (b.emergency - a.emergency) || a.km - b.km);
  // com urgência primeiro, mas só se não ficar muito mais longe do que o mais perto
  const nearest = Math.min(...hospitals.map((h) => h.km), Infinity);
  hospitals = hospitals.filter((h, i, arr) => arr.findIndex((y) => y.name === h.name) === i).sort((a, b) => ((a.emergency || a.km < nearest + 3 ? 0 : 1) - (b.emergency || b.km < nearest + 3 ? 0 : 1)) || (b.emergency - a.emergency) || a.km - b.km).slice(0, 3);
  const out = { hospitals, police: pick('police', 1), fire: pick('fire_station', 1) };
  // tempo de carro (um só pedido para todos)
  const dests = [...out.hospitals, ...out.police, ...out.fire];
  if (dests.length) {
    try {
      const r = await fetch(`${OSRM}${[pt, ...dests].map((x) => `${x.lng.toFixed(6)},${x.lat.toFixed(6)}`).join(';')}?sources=0&annotations=duration,distance`);
      if (r.ok) { const j = await r.json(); dests.forEach((d, i) => { const s = j.durations?.[0]?.[i + 1]; const m = j.distances?.[0]?.[i + 1]; if (s != null) d.min = Math.round(s / 60); if (m != null) d.km = m / 1000; }); }
    } catch { /* fica só a distância em linha reta */ }
  }
  out.hospitals.sort((a, b) => (b.emergency - a.emergency) || (a.min ?? a.km * 1.5) - (b.min ?? b.km * 1.5));
  dests.forEach((d) => { d.url = pinUrl(d.lat, d.lng); d.km = Math.round(d.km * 10) / 10; });
  return out;
}

// ---------- sol e tempo ----------
const WMO = { 0: 'Céu limpo', 1: 'Pouco nublado', 2: 'Parcialmente nublado', 3: 'Nublado', 45: 'Nevoeiro', 48: 'Nevoeiro com geada', 51: 'Chuvisco fraco', 53: 'Chuvisco', 55: 'Chuvisco forte', 56: 'Chuvisco gelado', 57: 'Chuvisco gelado', 61: 'Chuva fraca', 63: 'Chuva', 65: 'Chuva forte', 66: 'Chuva gelada', 67: 'Chuva gelada', 71: 'Neve fraca', 73: 'Neve', 75: 'Neve forte', 77: 'Grãos de neve', 80: 'Aguaceiros fracos', 81: 'Aguaceiros', 82: 'Aguaceiros fortes', 85: 'Aguaceiros de neve', 86: 'Aguaceiros de neve', 95: 'Trovoada', 96: 'Trovoada com granizo', 99: 'Trovoada com granizo' };
const hhmm = (iso) => (iso ? iso.slice(11, 16) : '');
const addMin = (t, m) => { if (!t) return ''; const [h, mm] = t.split(':').map(Number); const x = h * 60 + mm + m; return `${String(Math.floor(((x % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((x % 60) + 60) % 60).padStart(2, '0')}`; };
const DAILY = 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,windspeed_10m_max,sunrise,sunset';

// date = 'AAAA-MM-DD'. Até 16 dias: previsão. Mais longe: média dos últimos 3 anos nesse dia (estimativa).
export async function weatherFor(pt, date) {
  const today = new Date().toISOString().slice(0, 10);
  const days = Math.round((new Date(date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
  const base = `latitude=${pt.lat}&longitude=${pt.lng}&timezone=auto&windspeed_unit=kmh`;
  const sun = (d) => ({ sunrise: hhmm(d.sunrise?.[0]), sunset: hhmm(d.sunset?.[0]) });
  if (days >= -60 && days <= 15) {
    const host = days < 0 ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
    const r = await fetch(`${host}?${base}&daily=${days < 0 ? DAILY.replace(',precipitation_probability_max', '') : DAILY}&start_date=${date}&end_date=${date}`);
    if (!r.ok) throw new Error('Sem resposta do serviço de meteorologia.');
    const d = (await r.json()).daily || {};
    return finish({ kind: days < 0 ? 'passado' : 'previsão', code: d.weathercode?.[0], min: d.temperature_2m_min?.[0], max: d.temperature_2m_max?.[0], rainP: d.precipitation_probability_max?.[0], rain: d.precipitation_sum?.[0], wind: d.windspeed_10m_max?.[0], ...sun(d) });
  }
  // estimativa: o mesmo dia nos 3 anos anteriores
  const y = Number(date.slice(0, 4)); const md = date.slice(4);
  const ys = [1, 2, 3].map((k) => `${Math.min(y, Number(today.slice(0, 4))) - k}${md}`);
  const rs = await Promise.all(ys.map((dd) => fetch(`https://archive-api.open-meteo.com/v1/archive?${base}&daily=${DAILY.replace(',precipitation_probability_max', '')}&start_date=${dd}&end_date=${dd}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  const ds = rs.map((x) => x?.daily).filter(Boolean);
  if (!ds.length) throw new Error('Sem resposta do serviço de meteorologia.');
  const avg = (k) => { const v = ds.map((d) => d[k]?.[0]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const rainyYears = ds.filter((d) => (d.precipitation_sum?.[0] || 0) >= 1).length;
  const codes = ds.map((d) => d.weathercode?.[0]).filter((x) => x != null).sort((a, b) => a - b);
  return finish({ kind: 'estimativa', code: codes[Math.floor(codes.length / 2)], min: avg('temperature_2m_min'), max: avg('temperature_2m_max'), rainP: Math.round((rainyYears / ds.length) * 100), rain: avg('precipitation_sum'), wind: avg('windspeed_10m_max'), ...sun(ds[0]) });
}
function finish(w) {
  const r = (x) => (x == null ? null : Math.round(x));
  return {
    ...w, min: r(w.min), max: r(w.max), wind: r(w.wind), rainP: w.rainP == null ? null : Math.round(w.rainP),
    text: WMO[w.code] || '',
    goldenAm: w.sunrise ? `${w.sunrise}–${addMin(w.sunrise, 60)}` : '', goldenPm: w.sunset ? `${addMin(w.sunset, -60)}–${w.sunset}` : '',
    blueAm: w.sunrise ? `${addMin(w.sunrise, -30)}–${w.sunrise}` : '', bluePm: w.sunset ? `${w.sunset}–${addMin(w.sunset, 30)}` : '',
  };
}
export const weatherLine = (w) => [w.text, w.rainP != null && w.rainP >= 20 ? `chuva ${w.rainP}%` : '', w.wind != null && w.wind >= 25 ? `vento ${w.wind} km/h` : ''].filter(Boolean).join(' · ');
