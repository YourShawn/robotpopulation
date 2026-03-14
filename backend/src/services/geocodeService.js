import axios from 'axios';

const cache = new Map();

export async function geocodeCity(city, userAgent = 'MapIntelBot/0.1') {
  if (!city || city === 'Unknown') return null;
  if (cache.has(city)) return cache.get(city);

  const url = 'https://nominatim.openstreetmap.org/search';
  try {
    const { data } = await axios.get(url, {
      params: { q: city, format: 'json', limit: 1, addressdetails: 1 },
      headers: { 'User-Agent': userAgent }
    });
    const item = data?.[0];
    if (!item) return null;
    const result = {
      lat: Number(item.lat),
      lon: Number(item.lon),
      province: item.address?.state || item.address?.region || 'Unknown',
      country: item.address?.country_code?.toUpperCase() || item.address?.country || 'Unknown'
    };
    cache.set(city, result);
    return result;
  } catch {
    return null;
  }
}
