import { Router } from 'express';
import { crawlSearch, crawlCompanySources, crawlFeedSources } from '../services/scraperService.js';
import { sourcePools } from '../config/sources.js';
import { RawArticle } from '../models/RawArticle.js';
import { ExtractedFact } from '../models/ExtractedFact.js';
import { CanonicalEvent } from '../models/CanonicalEvent.js';

export const apiRouter = Router();

apiRouter.get('/health', (_, res) => {
  res.json({ ok: true, service: 'map-intel-backend' });
});

apiRouter.get('/sources', (_, res) => res.json(sourcePools));

apiRouter.post('/crawl', async (req, res) => {
  try {
    const { query, limit = 20 } = req.body ?? {};
    if (!query) return res.status(400).json({ error: 'query is required' });
    const result = await crawlSearch({
      query,
      limit: Number(limit),
      userAgent: process.env.USER_AGENT,
      requestDelayMs: Number(process.env.REQUEST_DELAY_MS || 800)
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/crawl/companies', async (req, res) => {
  try {
    const { perSourceLimit = 6 } = req.body ?? {};
    const result = await crawlCompanySources({
      perSourceLimit: Number(perSourceLimit),
      userAgent: process.env.USER_AGENT,
      requestDelayMs: Number(process.env.REQUEST_DELAY_MS || 800)
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/crawl/feeds', async (req, res) => {
  try {
    const { perFeedLimit = 10 } = req.body ?? {};
    const result = await crawlFeedSources({
      perFeedLimit: Number(perFeedLimit),
      userAgent: process.env.USER_AGENT,
      requestDelayMs: Number(process.env.REQUEST_DELAY_MS || 800)
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/stats', async (_, res) => {
  const [rawArticles, extractedFacts, canonicalEvents, totalCities, byRobotType] = await Promise.all([
    RawArticle.countDocuments(),
    ExtractedFact.countDocuments(),
    CanonicalEvent.countDocuments(),
    CanonicalEvent.distinct('cityCanonical').then((c) => c.filter((x) => x && x !== 'unknown').length),
    CanonicalEvent.aggregate([{ $group: { _id: '$robotType', count: { $sum: 1 } } }, { $sort: { count: -1 } }])
  ]);

  res.json({ rawArticles, extractedFacts, canonicalEvents, totalCities, byRobotType });
});

apiRouter.get('/events', async (req, res) => {
  const { city, province, country, robotType, eventType, company, limit = 100 } = req.query;
  const filter = {};
  if (city) filter.city = city;
  if (province) filter.province = province;
  if (country) filter.country = country;
  if (robotType) filter.robotType = robotType;
  if (eventType) filter.eventType = eventType;
  if (company) filter.companyCanonical = company;

  const data = await CanonicalEvent.find(filter).sort({ lastSeen: -1 }).limit(Number(limit));
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
        count: { $sum: 1 },
        sourceCount: { $sum: '$sourceCount' },
        lat: { $avg: '$location.lat' },
        lon: { $avg: '$location.lon' },
        latestAt: { $max: '$lastSeen' }
      }
    },
    { $sort: { count: -1 } }
  ]);

  const features = rows.map((r) => {
    const city = r._id.city || null;
    const province = r._id.province || null;
    const country = r._id.country || null;
    const label = level === 'country' ? country : level === 'province' ? `${province}, ${country}` : `${city}, ${province}`;

    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      properties: {
        level,
        label,
        city,
        province,
        country,
        cityCanonical: r._id.cityCanonical || null,
        eventCount: r.count,
        sourceCount: r.sourceCount,
        latestAt: r.latestAt
      }
    };
  });

  res.json({ type: 'FeatureCollection', features });
});

