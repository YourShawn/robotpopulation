import axios from 'axios';
import * as cheerio from 'cheerio';
import { RawItem } from '../models/RawItem.js';
import { geocodeCity } from './geocodeService.js';
import { hashContent, normalizeUrl } from '../utils/dedupe.js';
import { companySeeds } from '../config/companySeeds.js';
import { cityDictionary } from '../config/cityDictionary.js';

const CITY_REGEX = new RegExp(`\\b(${cityDictionary.join('|')})\\b`, 'i');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferCity(text = '') {
  const m = text.match(CITY_REGEX);
  return m?.[1] ?? 'Unknown';
}

function inferRobotType(text = '') {
  const t = text.toLowerCase();
  if (t.includes('robotaxi') || t.includes('autonomous vehicle') || t.includes('self-driving')) return 'robotaxi';
  if (t.includes('delivery robot') || t.includes('sidewalk')) return 'delivery';
  if (t.includes('warehouse')) return 'warehouse';
  return 'unknown';
}

function inferDeploymentStatus(text = '') {
  const t = text.toLowerCase();
  if (t.includes('launch') || t.includes('live') || t.includes('operat')) return 'live';
  if (t.includes('pilot') || t.includes('trial')) return 'pilot';
  if (t.includes('plan') || t.includes('announce')) return 'announced';
  return 'unknown';
}

const sourceFeeds = [
  { name: 'Robot Report', url: 'https://www.therobotreport.com/feed/', robotType: 'unknown' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/category/robotics/feed/', robotType: 'unknown' },
  { name: 'Reuters Tech', url: 'https://www.reutersagency.com/feed/?best-topics=technology', robotType: 'unknown' },
  { name: 'Waymo Blog', url: 'https://waymo.com/blog/rss/', robotType: 'robotaxi' },
  { name: 'Starship News', url: 'https://www.starship.xyz/news/rss.xml', robotType: 'delivery' }
];

async function upsertItems(rows, base) {
  const stats = { inserted: 0, duplicateUrl: 0, duplicateContent: 0, failed: 0 };

  for (const row of rows) {
    const normalizedUrl = normalizeUrl(row.sourceUrl);
    const contentHash = hashContent(row);
    const city = inferCity(`${row.title} ${row.snippet}`);
    const location = await geocodeCity(city, base.userAgent);
    const robotType = row.robotType || inferRobotType(`${row.title} ${row.snippet}`);
    const deploymentStatus = inferDeploymentStatus(`${row.title} ${row.snippet}`);

    try {
      await RawItem.create({
        query: base.query,
        source: base.source || 'search',
        sourceType: base.sourceType || 'news',
        sourceUrl: row.sourceUrl,
        normalizedUrl,
        title: row.title,
        snippet: row.snippet,
        contentHash,
        city,
        country: 'Unknown',
        location,
        company: row.company || 'Unknown',
        robotType,
        deploymentStatus,
        publishedAt: row.publishedAt || null
      });
      stats.inserted += 1;
    } catch (err) {
      if (err?.code === 11000) {
        const isUrlDup = err?.keyPattern?.normalizedUrl;
        if (isUrlDup) stats.duplicateUrl += 1;
        else stats.duplicateContent += 1;
      } else {
        stats.failed += 1;
      }
    }

    await sleep(base.requestDelayMs || 1200);
  }

  return stats;
}

export async function crawlSearch({ query, limit = 20, userAgent, requestDelayMs = 1200 }) {
  const rows = [];

  try {
    const url = 'https://duckduckgo.com/html/';
    const { data } = await axios.get(url, {
      params: { q: query },
      headers: { 'User-Agent': userAgent }
    });

    const $ = cheerio.load(data);
    $('.result').each((_, el) => {
      if (rows.length >= limit) return;
      const title = $(el).find('.result__a').text().trim();
      const sourceUrl = $(el).find('.result__a').attr('href')?.trim();
      const snippet = $(el).find('.result__snippet').text().trim();
      if (title && sourceUrl) rows.push({ title, sourceUrl, snippet });
    });
  } catch {
    // ignore, fallback below
  }

  if (rows.length === 0) {
    const rssUrl = 'https://news.google.com/rss/search';
    const { data: xml } = await axios.get(rssUrl, {
      params: { q: query, hl: 'en-US', gl: 'US', ceid: 'US:en' },
      headers: { 'User-Agent': userAgent }
    });

    const $xml = cheerio.load(xml, { xmlMode: true });
    $xml('item').each((_, el) => {
      if (rows.length >= limit) return;
      const title = $xml(el).find('title').first().text().trim();
      const sourceUrl = $xml(el).find('link').first().text().trim();
      const snippet = $xml(el).find('description').first().text().replace(/<[^>]+>/g, ' ').trim();
      if (title && sourceUrl) rows.push({ title, sourceUrl, snippet });
    });
  }

  const stats = await upsertItems(rows, {
    query,
    source: rows.length ? 'search' : 'unknown',
    sourceType: 'search-news',
    userAgent,
    requestDelayMs
  });

  return { query, scanned: rows.length, ...stats };
}

export async function crawlFeedSources({ userAgent, perFeedLimit = 10, requestDelayMs = 800 }) {
  const details = [];

  for (const feed of sourceFeeds) {
    try {
      const { data: xml } = await axios.get(feed.url, { headers: { 'User-Agent': userAgent }, timeout: 15000 });
      const $xml = cheerio.load(xml, { xmlMode: true });
      const rows = [];

      $xml('item').each((_, el) => {
        if (rows.length >= perFeedLimit) return;
        const title = $xml(el).find('title').first().text().trim();
        const sourceUrl = $xml(el).find('link').first().text().trim();
        const snippet = $xml(el).find('description').first().text().replace(/<[^>]+>/g, ' ').trim();
        const publishedText = $xml(el).find('pubDate').first().text().trim();
        if (title && sourceUrl) {
          rows.push({
            title,
            sourceUrl,
            snippet,
            robotType: feed.robotType,
            company: feed.name,
            publishedAt: publishedText ? new Date(publishedText) : null
          });
        }
      });

      const stats = await upsertItems(rows, {
        query: `${feed.name} feed`,
        source: feed.name,
        sourceType: 'source-feed',
        userAgent,
        requestDelayMs
      });

      details.push({ source: feed.name, scanned: rows.length, ...stats });
    } catch (error) {
      details.push({ source: feed.name, scanned: 0, inserted: 0, duplicateUrl: 0, duplicateContent: 0, failed: 1, error: error.message });
    }
  }

  const summary = details.reduce(
    (acc, s) => {
      acc.inserted += s.inserted || 0;
      acc.duplicateUrl += s.duplicateUrl || 0;
      acc.duplicateContent += s.duplicateContent || 0;
      acc.failed += s.failed || 0;
      return acc;
    },
    { inserted: 0, duplicateUrl: 0, duplicateContent: 0, failed: 0 }
  );

  return { feeds: details.length, perFeedLimit, summary, details };
}

export async function crawlCompanySources({ userAgent, perSourceLimit = 8, requestDelayMs = 1200 }) {
  const allStats = [];

  for (const company of companySeeds) {
    const q = `${company.name} robot deployment city robotaxi delivery`;
    const result = await crawlSearch({ query: q, limit: perSourceLimit, userAgent, requestDelayMs });
    allStats.push({ company: company.name, robotType: company.robotType, ...result });
  }

  const summary = allStats.reduce(
    (acc, s) => {
      acc.inserted += s.inserted;
      acc.duplicateUrl += s.duplicateUrl;
      acc.duplicateContent += s.duplicateContent;
      acc.failed += s.failed;
      return acc;
    },
    { inserted: 0, duplicateUrl: 0, duplicateContent: 0, failed: 0 }
  );

  return { companies: allStats.length, perSourceLimit, summary, details: allStats };
}
