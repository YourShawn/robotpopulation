import { Router } from 'express';
import { sourcePools } from '../config/sources.js';
import { RawArticle } from '../models/RawArticle.js';
import { ExtractedFact } from '../models/ExtractedFact.js';
import { CanonicalEvent } from '../models/CanonicalEvent.js';

const countryToContinent = {
  CN: 'Asia', US: 'North America', CA: 'North America', MX: 'North America',
  GB: 'Europe', FR: 'Europe', DE: 'Europe', ES: 'Europe', IT: 'Europe', NL: 'Europe',
  JP: 'Asia', KR: 'Asia', SG: 'Asia', IN: 'Asia', AE: 'Asia', SA: 'Asia',
  AU: 'Oceania', NZ: 'Oceania',
  BR: 'South America', AR: 'South America', CL: 'South America',
  ZA: 'Africa', EG: 'Africa', NG: 'Africa'
};

function continentOf(country) {
  return countryToContinent[country] || 'Other';
}

function countriesForContinent(continent) {
  return Object.entries(countryToContinent)
    .filter(([, c]) => c === continent)
    .map(([code]) => code);
}

export const apiRouter = Router();

apiRouter.get('/health', (_, res) => {
  res.json({ ok: true, service: 'map-intel-backend' });
});

apiRouter.get('/sources', (_, res) => res.json(sourcePools));

apiRouter.get('/stats', async (_, res) => {
  const [rawArticles, extractedFacts, canonicalEvents, totalCities, byRobotType, estimatedRobots] = await Promise.all([
    RawArticle.countDocuments(),
    ExtractedFact.countDocuments(),
    CanonicalEvent.countDocuments(),
    CanonicalEvent.distinct('cityCanonical').then((c) => c.filter((x) => x && x !== 'unknown').length),
    CanonicalEvent.aggregate([{ $group: { _id: '$robotType', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    CanonicalEvent.aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ['$countBest', 0] } } } }]).then((r) => r[0]?.total || 0)
  ]);

  res.json({ rawArticles, extractedFacts, canonicalEvents, totalCities, estimatedRobots, byRobotType });
});

apiRouter.get('/events', async (req, res) => {
  const { city, province, country, continent, robotType, eventType, company, limit = 100 } = req.query;
  const filter = {};
  if (city) filter.city = city;
  if (province) filter.province = province;
  if (country) filter.country = country;
  if (continent) {
    const codes = countriesForContinent(continent);
    filter.country = { $in: codes.length ? codes : ['__none__'] };
  }
  if (robotType) filter.robotType = robotType;
  if (eventType) filter.eventType = eventType;
  if (company) filter.companyCanonical = company;

  const data = await CanonicalEvent.find(filter).sort({ confidence: -1, sourceCount: -1, lastSeen: -1 }).limit(Number(limit));
  res.json({ total: data.length, data });
});

apiRouter.get('/map/regions', async (req, res) => {
  const { level = 'city' } = req.query;

  let groupId;
  if (level === 'country') groupId = { country: '$country' };
  else if (level === 'province') groupId = { country: '$country', province: '$province' };
  else groupId = { city: '$city', province: '$province', country: '$country', cityCanonical: '$cityCanonical' };

  const rows = await CanonicalEvent.aggregate([
    { $match: { 'location.lat': { $ne: null }, 'location.lon': { $ne: null } } },
    {
      $group: {
        _id: groupId,
        eventCount: { $sum: 1 },
        sourceCount: { $sum: '$sourceCount' },
        deployedRobots: { $sum: { $ifNull: ['$countBest', 0] } },
        companySet: { $addToSet: '$companyCanonical' },
        lat: { $avg: '$location.lat' },
        lon: { $avg: '$location.lon' },
        latestAt: { $max: '$lastSeen' }
      }
    },
    { $sort: { deployedRobots: -1, eventCount: -1 } }
  ]);

  const features = rows.map((r) => {
    const city = r._id.city || null;
    const province = r._id.province || null;
    const country = r._id.country || null;
    const label = level === 'country' ? country : level === 'province' ? `${province}, ${country}` : `${city}, ${province}`;
    const continent = continentOf(country);

    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      properties: {
        level,
        label,
        city,
        province,
        country,
        continent,
        cityCanonical: r._id.cityCanonical || null,
        eventCount: r.eventCount,
        sourceCount: r.sourceCount,
        deployedRobots: r.deployedRobots,
        companyCount: (r.companySet || []).filter((x) => x && x !== 'unknown').length,
        latestAt: r.latestAt
      }
    };
  });

  res.json({ type: 'FeatureCollection', features });
});
