import { Router } from 'express';
import { RawItem } from '../models/RawItem.js';
import { crawlSearch, crawlCompanySources } from '../services/scraperService.js';
import { sourcePools } from '../config/sources.js';

export const apiRouter = Router();

apiRouter.get('/health', (_, res) => {
  res.json({ ok: true, service: 'map-intel-backend' });
});

apiRouter.post('/crawl', async (req, res) => {
  try {
    const { query, limit = 20 } = req.body ?? {};
    if (!query) return res.status(400).json({ error: 'query is required' });

    const result = await crawlSearch({
      query,
      limit: Number(limit),
      userAgent: process.env.USER_AGENT,
      requestDelayMs: Number(process.env.REQUEST_DELAY_MS || 1200)
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/crawl/companies', async (req, res) => {
  try {
    const { perSourceLimit = 8 } = req.body ?? {};
    const result = await crawlCompanySources({
      perSourceLimit: Number(perSourceLimit),
      userAgent: process.env.USER_AGENT,
      requestDelayMs: Number(process.env.REQUEST_DELAY_MS || 1200)
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/items', async (req, res) => {
  const { q, city, robotType, limit = 100 } = req.query;
  const filter = {};
  if (q) {
    filter.$or = [
      { title: { $regex: q, $options: 'i' } },
      { snippet: { $regex: q, $options: 'i' } },
      { query: { $regex: q, $options: 'i' } }
    ];
  }
  if (city) filter.city = city;
  if (robotType) filter.robotType = robotType;

  const data = await RawItem.find(filter).sort({ createdAt: -1 }).limit(Number(limit));
  res.json({ total: data.length, data });
});

apiRouter.get('/sources', async (_, res) => {
  res.json(sourcePools);
});

apiRouter.get('/stats', async (_, res) => {
  const [totalItems, totalCities, byRobotType] = await Promise.all([
    RawItem.countDocuments(),
    RawItem.distinct('city').then((c) => c.filter((x) => x && x !== 'Unknown').length),
    RawItem.aggregate([{ $group: { _id: '$robotType', count: { $sum: 1 } } }, { $sort: { count: -1 } }])
  ]);

  res.json({ totalItems, totalCities, byRobotType });
});

apiRouter.get('/map/cities', async (_, res) => {
  const rows = await RawItem.aggregate([
    { $match: { 'location.lat': { $ne: null }, 'location.lon': { $ne: null } } },
    {
      $group: {
        _id: '$city',
        count: { $sum: 1 },
        lat: { $avg: '$location.lat' },
        lon: { $avg: '$location.lon' },
        latestAt: { $max: '$createdAt' }
      }
    },
    { $sort: { count: -1 } }
  ]);

  const features = rows.map((r) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
    properties: {
      city: r._id,
      count: r.count,
      latestAt: r.latestAt
    }
  }));

  res.json({
    type: 'FeatureCollection',
    features
  });
});
