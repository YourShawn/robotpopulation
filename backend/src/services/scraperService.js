import axios from 'axios';
import * as cheerio from 'cheerio';
import { randomUUID } from 'node:crypto';
import { geocodeCity } from './geocodeService.js';
import { normalizeUrl } from '../utils/dedupe.js';
import { cityDictionary } from '../config/cityDictionary.js';
import { companySeeds } from '../config/companySeeds.js';
import { companySourcesSeed } from '../config/companySourcesSeed.js';
import { RawArticle } from '../models/RawArticle.js';
import { ExtractedFact } from '../models/ExtractedFact.js';
import { CanonicalEvent } from '../models/CanonicalEvent.js';

const CITY_REGEX = new RegExp(`\\b(${cityDictionary.join('|')})\\b`, 'i');
const DEPLOYMENT_KEYWORDS = [
  'deploy', 'deployment', 'launched', 'launch', 'rollout', 'expanded', 'expansion', 'operations',
  'service area', 'served', 'fleet', 'robotaxi', 'delivery robot', 'autonomous vehicle', 'pilot',
  'permit', 'dmv', 'approved', 'regulatory', 'public road'
];

const sourceFeeds = [
  { name: 'Robot Report', url: 'https://www.therobotreport.com/feed/', sourceType: 'source-feed' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/category/robotics/feed/', sourceType: 'source-feed' }
];

const companyAliases = {
  waymo: ['waymo', 'waymo one', 'waymo llc'],
  cruise: ['cruise', 'getcruise'],
  zoox: ['zoox'],
  starship: ['starship', 'starship technologies'],
  'starship-technologies': ['starship', 'starship technologies'],
  serve: ['serve robotics', 'serve'],
  'serve-robotics': ['serve robotics', 'serve'],
  kiwibot: ['kiwibot'],
  locus: ['locus robotics', 'locus'],
  greyorange: ['greyorange'],
  nuro: ['nuro'],
  'pony-ai': ['pony.ai', 'pony ai'],
  weride: ['weride'],
  autox: ['autox'],
  'coco-robotics': ['coco robotics', 'coco']
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function inferCity(text = '') {
  const direct = text.match(CITY_REGEX)?.[1];
  if (direct) return direct;
  const inMatch = text.match(/\b(?:in|across|around|near)\s+([A-Z][a-zA-Z\-\s]{2,30})\b/);
  return inMatch?.[1]?.trim() || 'Unknown';
}

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
  if (t.includes('delivery robot') || t.includes('sidewalk') || t.includes('last-mile')) return 'delivery';
  if (t.includes('warehouse') || t.includes('fulfillment')) return 'warehouse';
  return 'unknown';
}

function inferEventType(text = '') {
  const t = text.toLowerCase();
  if (t.includes('permit') || t.includes('approved') || t.includes('authorization') || t.includes('regulatory')) return 'permit';
  if (t.includes('launch') || t.includes('rolled out') || t.includes('began operations')) return 'launch';
  if (t.includes('pilot') || t.includes('trial')) return 'pilot';
  if (t.includes('expand') || t.includes('expanded') || t.includes('service area')) return 'expand';
  return 'update';
}

function extractCount(text = '') {
  const t = text.toLowerCase();
  const range = t.match(/\b(\d{1,5})\s*(?:-|to)\s*(\d{1,5})\b/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return { best: Math.round((min + max) / 2), min, max };
  }

  const plus = t.match(/\b(\d{1,5})\s*\+\b/);
  if (plus) {
    const n = Number(plus[1]);
    return { best: n, min: n, max: null };
  }

  const m = t.match(/\b(\d{2,5})\b/);
  if (!m) return { best: null, min: null, max: null };
  const n = Number(m[1]);
  return { best: n, min: n, max: n };
}

function sourceWeight(site = '', sourceType = '') {
  const s = `${site} ${sourceType}`.toLowerCase();
  if (s.includes('.gov') || s.includes('dmv') || s.includes('transport') || s.includes('permit')) return 0.62;
  if (s.includes('waymo.com') || s.includes('getcruise.com') || s.includes('zoox.com') || s.includes('nuro.ai') || s.includes('serve.co')) return 0.52;
  if (s.includes('reuters')) return 0.32;
  if (s.includes('therobotreport') || s.includes('techcrunch')) return 0.25;
  return 0.1;
}

function cityCanonical(city = '', country = 'unknown') {
  if (!city || city === 'Unknown') return 'unknown';
  return `${city.toLowerCase().replace(/\s+/g, '_')}_${country.toLowerCase()}`;
}

function monthKey(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

function hasDeploymentSignal(text = '') {
  const t = text.toLowerCase();
  return DEPLOYMENT_KEYWORDS.some((k) => t.includes(k));
}

function rowQualityScore(row = {}, sourceType = '', sourceSite = '') {
  const text = `${row.title || ''} ${row.snippet || ''}`;
  let score = sourceWeight(row.sourceUrl || sourceSite, sourceType);
  if (hasDeploymentSignal(text)) score += 0.18;
  if (inferCity(text) !== 'Unknown') score += 0.08;
  if (canonicalCompany(text) !== 'unknown' || row.company) score += 0.06;
  if (extractCount(text).best != null) score += 0.05;
  return Math.min(0.98, score);
}

function shouldKeepRow(row = {}, sourceType = '') {
  const text = `${row.title || ''} ${row.snippet || ''}`;
  if (sourceType === 'permit' || sourceType === 'regulator') return true;
  if ((row.title || '').length < 12) return false;
  if (!row.sourceUrl) return false;
  return hasDeploymentSignal(text) || canonicalCompany(text) !== 'unknown';
}

export async function persistRows(rows, { query, sourceSite, sourceType, userAgent, requestDelayMs = 600 }) {
  const batchId = randomUUID();
  let rawSaved = 0;
  let factsSaved = 0;
  let eventsMerged = 0;
  const seenUrls = new Set();

  for (const r of rows) {
    if (!shouldKeepRow(r, sourceType)) continue;

    const normalizedUrl = normalizeUrl(r.sourceUrl);
    if (seenUrls.has(normalizedUrl)) continue;
    seenUrls.add(normalizedUrl);

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

    const confidenceBase = rowQualityScore(r, sourceType, sourceSite);
    const completenessBoost = (city !== 'Unknown' ? 0.05 : 0) + (robotType !== 'unknown' ? 0.04 : 0) + (best != null ? 0.03 : 0);
    const confidence = Math.min(0.99, confidenceBase + completenessBoost);

    await ExtractedFact.create({
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
      confidence,
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
        $max: { confidence, countBest: best ?? 0, countMax: max ?? 0 }
      },
      { upsert: true, new: true }
    );

    await CanonicalEvent.updateOne(
      { eventFingerprint: fingerprint },
      [{
        $set: {
          sourceCount: { $size: '$sourceUrls' },
          countBest: {
            $cond: [
              { $gt: ['$countBest', 0] }, '$countBest', null
            ]
          }
        }
      }]
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

async function fetchRowsByStrategy(source, userAgent, limit = 8) {
  if (source.crawl_strategy === 'rss') {
    const { data: xml } = await axios.get(source.url, { headers: { 'User-Agent': userAgent }, timeout: 15000 });
    const $xml = cheerio.load(xml, { xmlMode: true });
    const rows = [];
    $xml('item').each((_, el) => {
      if (rows.length >= limit) return;
      rows.push({
        title: $xml(el).find('title').first().text().trim(),
        sourceUrl: $xml(el).find('link').first().text().trim(),
        snippet: $xml(el).find('description').first().text().replace(/<[^>]+>/g, ' ').trim(),
        publishedAt: $xml(el).find('pubDate').first().text().trim(),
        company: source.company_slug
      });
    });
    return rows;
  }

  const { data: html } = await axios.get(source.url, { headers: { 'User-Agent': userAgent }, timeout: 20000 });
  const $ = cheerio.load(html);

  if (source.crawl_strategy === 'structured_table') {
    const rows = [];
    $('table tr').each((_, tr) => {
      if (rows.length >= limit) return;
      const cols = $(tr).find('th,td').map((__, c) => $(c).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean);
      const line = cols.join(' | ');
      if (!line || line.length < 18) return;
      if (!/permit|driverless|autonomous|deployment|approved|disengagement/i.test(line)) return;
      rows.push({
        title: `${source.company_slug} ${source.source_type} update`,
        sourceUrl: source.url,
        snippet: line.slice(0, 400),
        company: source.company_slug
      });
    });
    if (rows.length) return rows;
  }

  if (source.crawl_strategy === 'list_page' || source.crawl_strategy === 'structured_list') {
    const rows = [];
    $('a').each((_, el) => {
      if (rows.length >= limit) return;
      const href = $(el).attr('href');
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (!href || !text || text.length < 14) return;
      if (!/deploy|launch|expand|pilot|robot|autonomous|permit|service|operation/i.test(text)) return;
      const url = href.startsWith('http') ? href : new URL(href, source.url).toString();
      rows.push({ title: text.slice(0, 180), sourceUrl: url, snippet: `${source.source_type} ${text}`.slice(0, 300), company: source.company_slug });
    });
    if (rows.length) return rows;
  }

  const title = $('title').first().text().trim() || `${source.company_slug} ${source.source_type}`;
  const body = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 900);
  return [{ title, sourceUrl: source.url, snippet: body, company: source.company_slug }];
}

export async function crawlCompanyRegistrySources({ userAgent, requestDelayMs = 700, perSourceLimit = 8 }) {
  const details = [];
  const activeSources = companySourcesSeed.filter((s) => s.active);

  for (const source of activeSources) {
    try {
      const rows = await fetchRowsByStrategy(source, userAgent, perSourceLimit);
      const result = await persistRows(rows, {
        query: `${source.company_slug}:${source.source_type}`,
        sourceSite: source.company_slug,
        sourceType: source.source_type,
        userAgent,
        requestDelayMs
      });
      details.push({ source: `${source.company_slug}/${source.source_type}`, strategy: source.crawl_strategy, ...result });
    } catch (error) {
      details.push({ source: `${source.company_slug}/${source.source_type}`, strategy: source.crawl_strategy, scanned: 0, rawSaved: 0, factsSaved: 0, eventsMerged: 0, error: error.message });
    }
  }

  return { sources: activeSources.length, details };
}

export async function crawlCompanySources({ userAgent, perSourceLimit = 6, requestDelayMs = 700 }) {
  const details = [];
  for (const company of companySeeds) {
    const q = `${company.name} robot deployment permit city robotaxi delivery operations`;
    const s = await crawlSearch({ query: q, limit: perSourceLimit, userAgent, requestDelayMs });
    details.push({ company: company.name, robotType: company.robotType, ...s });
  }
  return { companies: details.length, details };
}
