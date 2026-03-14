import axios from 'axios';
import * as cheerio from 'cheerio';
import { randomUUID } from 'node:crypto';
import { geocodeCity } from './geocodeService.js';
import { normalizeUrl } from '../utils/dedupe.js';
import { cityDictionary } from '../config/cityDictionary.js';
import { companySeeds } from '../config/companySeeds.js';
import { RawArticle } from '../models/RawArticle.js';
import { ExtractedFact } from '../models/ExtractedFact.js';
import { CanonicalEvent } from '../models/CanonicalEvent.js';

const CITY_REGEX = new RegExp(`\\b(${cityDictionary.join('|')})\\b`, 'i');

const sourceFeeds = [
  { name: 'Robot Report', url: 'https://www.therobotreport.com/feed/', sourceType: 'source-feed' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/category/robotics/feed/', sourceType: 'source-feed' }
];

const companyAliases = {
  waymo: ['waymo', 'waymo one', 'waymo llc'],
  cruise: ['cruise', 'getcruise'],
  zoox: ['zoox'],
  starship: ['starship', 'starship technologies'],
  serve: ['serve robotics', 'serve'],
  kiwibot: ['kiwibot'],
  locus: ['locus robotics', 'locus'],
  greyorange: ['greyorange', 'greyorange']
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function inferCity(text = '') { return text.match(CITY_REGEX)?.[1] || 'Unknown'; }

function canonicalCompany(text = '') {
  const t = text.toLowerCase();
  for (const [k, aliases] of Object.entries(companyAliases)) {
    if (aliases.some((a) => t.includes(a))) return k;
  }
  return 'unknown';
}

function inferRobotType(text = '') {
  const t = text.toLowerCase();
  if (t.includes('robotaxi') || t.includes('autonomous vehicle') || t.includes('self-driving')) return 'robotaxi';
  if (t.includes('delivery robot') || t.includes('sidewalk')) return 'delivery';
  if (t.includes('warehouse')) return 'warehouse';
  return 'unknown';
}

function inferEventType(text = '') {
  const t = text.toLowerCase();
  if (t.includes('launch') || t.includes('rolled out') || t.includes('began operations')) return 'launch';
  if (t.includes('pilot') || t.includes('trial')) return 'pilot';
  if (t.includes('expand') || t.includes('expanded')) return 'expand';
  return 'update';
}

function extractCount(text = '') {
  const m = text.match(/\b(\d{2,5})\b/);
  if (!m) return { best: null, min: null, max: null };
  const n = Number(m[1]);
  return { best: n, min: n, max: n };
}

function sourceWeight(site = '') {
  const s = site.toLowerCase();
  if (s.includes('waymo.com') || s.includes('cruise') || s.includes('zoox')) return 0.5;
  if (s.includes('reuters')) return 0.3;
  if (s.includes('therobotreport') || s.includes('techcrunch')) return 0.2;
  return 0.08;
}

function cityCanonical(city = '', country = 'unknown') {
  if (!city || city === 'Unknown') return 'unknown';
  return `${city.toLowerCase().replace(/\s+/g, '_')}_${country.toLowerCase()}`;
}

function monthKey(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function persistRows(rows, { query, sourceSite, sourceType, userAgent, requestDelayMs = 600 }) {
  const batchId = randomUUID();
  let rawSaved = 0;
  let factsSaved = 0;
  let eventsMerged = 0;

  for (const r of rows) {
    const normalizedUrl = normalizeUrl(r.sourceUrl);
    const raw = await RawArticle.create({
      title: r.title,
      url: r.sourceUrl,
      normalizedUrl,
      sourceSite,
      sourceType,
      snippet: r.snippet,
      content: r.snippet,
      publishedAt: r.publishedAt || null,
      query,
      fetchBatchId: batchId
    });
    rawSaved += 1;

    const mixText = `${r.title} ${r.snippet}`;
    const city = inferCity(mixText);
    const companyCanonical = canonicalCompany(mixText);
    const robotType = r.robotType || inferRobotType(mixText);
    const eventType = inferEventType(mixText);
    const eventDate = r.publishedAt ? new Date(r.publishedAt) : new Date();
    const { best, min, max } = extractCount(mixText);
    const location = await geocodeCity(city, userAgent);
    const country = location?.country || (city === 'Unknown' ? 'Unknown' : 'US');
    const province = location?.province || 'Unknown';
    const cCanonical = cityCanonical(city, country);
    const confidenceBase = Math.min(0.95, 0.25 + sourceWeight(r.sourceUrl || sourceSite));

    const fact = await ExtractedFact.create({
      rawArticleId: raw._id,
      company: r.company || companyCanonical,
      companyCanonical,
      robotType,
      eventType,
      city,
      cityCanonical: cCanonical,
      province,
      country,
      location,
      countBest: best,
      countMin: min,
      countMax: max,
      eventDate,
      confidence: confidenceBase,
      sourceUrl: r.sourceUrl,
      sourceSite
    });
    factsSaved += 1;

    const fingerprint = `${companyCanonical}|${cCanonical}|${robotType}|${eventType}|${monthKey(eventDate)}`;
    await CanonicalEvent.findOneAndUpdate(
      { eventFingerprint: fingerprint },
      {
        $setOnInsert: {
          eventFingerprint: fingerprint,
          company: r.company || companyCanonical,
          companyCanonical,
          robotType,
          eventType,
          city,
          cityCanonical: cCanonical,
          province,
          country,
          location,
          eventDate,
          countBest: best,
          countMin: min,
          countMax: max,
          firstSeen: new Date()
        },
        $set: { lastSeen: new Date() },
        $addToSet: { sourceUrls: r.sourceUrl, sourceSites: sourceSite },
        $max: { confidence: confidenceBase }
      },
      { upsert: true, new: true }
    );

    await CanonicalEvent.updateOne(
      { eventFingerprint: fingerprint },
      [{ $set: { sourceCount: { $size: '$sourceUrls' } } }]
    );

    eventsMerged += 1;
    await sleep(requestDelayMs);
  }

  return { batchId, scanned: rows.length, rawSaved, factsSaved, eventsMerged };
}

export async function crawlSearch({ query, limit = 20, userAgent, requestDelayMs = 800 }) {
  const rows = [];

  try {
    const { data: xml } = await axios.get('https://news.google.com/rss/search', {
      params: { q: query, hl: 'en-US', gl: 'US', ceid: 'US:en' },
      headers: { 'User-Agent': userAgent }
    });
    const $xml = cheerio.load(xml, { xmlMode: true });
    $xml('item').each((_, el) => {
      if (rows.length >= limit) return;
      rows.push({
        title: $xml(el).find('title').first().text().trim(),
        sourceUrl: $xml(el).find('link').first().text().trim(),
        snippet: $xml(el).find('description').first().text().replace(/<[^>]+>/g, ' ').trim(),
        publishedAt: $xml(el).find('pubDate').first().text().trim()
      });
    });
  } catch {
    // noop
  }

  return persistRows(rows, { query, sourceSite: 'google-news', sourceType: 'search-news', userAgent, requestDelayMs });
}

export async function crawlFeedSources({ userAgent, perFeedLimit = 10, requestDelayMs = 600 }) {
  const details = [];
  for (const feed of sourceFeeds) {
    try {
      const { data: xml } = await axios.get(feed.url, { headers: { 'User-Agent': userAgent }, timeout: 15000 });
      const $xml = cheerio.load(xml, { xmlMode: true });
      const rows = [];
      $xml('item').each((_, el) => {
        if (rows.length >= perFeedLimit) return;
        rows.push({
          title: $xml(el).find('title').first().text().trim(),
          sourceUrl: $xml(el).find('link').first().text().trim(),
          snippet: $xml(el).find('description').first().text().replace(/<[^>]+>/g, ' ').trim(),
          publishedAt: $xml(el).find('pubDate').first().text().trim(),
          company: feed.name
        });
      });
      const s = await persistRows(rows, {
        query: `${feed.name} feed`, sourceSite: feed.name, sourceType: feed.sourceType, userAgent, requestDelayMs
      });
      details.push({ source: feed.name, ...s });
    } catch (error) {
      details.push({ source: feed.name, scanned: 0, rawSaved: 0, factsSaved: 0, eventsMerged: 0, error: error.message });
    }
  }
  return { feeds: details.length, details };
}

export async function crawlCompanySources({ userAgent, perSourceLimit = 6, requestDelayMs = 700 }) {
  const details = [];
  for (const company of companySeeds) {
    const q = `${company.name} robot deployment city robotaxi delivery`; 
    const s = await crawlSearch({ query: q, limit: perSourceLimit, userAgent, requestDelayMs });
    details.push({ company: company.name, robotType: company.robotType, ...s });
  }
  return { companies: details.length, details };
}
