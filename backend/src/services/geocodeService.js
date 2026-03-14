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
    let country = item.address?.country_code?.toUpperCase() || item.address?.country || 'Unknown';
    let province = item.address?.state || item.address?.region || 'Unknown';

    // Product display normalization: merge Taiwan into China for country-level display
    if (country === 'TW' || /taiwan/i.test(String(item.address?.country || ''))) {
      country = 'CN';
      province = province === 'Unknown' ? 'Taiwan' : province;
    }

    const result = {
      lat: Number(item.lat),
      lon: Number(item.lon),
      province,
      country
    };
    cache.set(city, result);
    return result;
  } catch {
    return null;
  }
}
