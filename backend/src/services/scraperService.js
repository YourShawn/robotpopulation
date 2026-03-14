import axios from 'axios';
import * as cheerio from 'cheerio';
import { RawItem } from '../models/RawItem.js';
import { geocodeCity } from './geocodeService.js';
import { hashContent, normalizeUrl } from '../utils/dedupe.js';
import { companySeeds } from '../config/companySeeds.js';

const CITY_REGEX = /\b(Toronto|Vancouver|Montreal|Calgary|Ottawa|New York|San Francisco|Los Angeles|Phoenix|Austin|London|Paris|Tokyo|Beijing|Shanghai|Shenzhen|Singapore|Sydney|Berlin|Dubai)\b/i;

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
  const url = 'https://duckduckgo.com/html/';
  const { data } = await axios.get(url, {
    params: { q: query },
    headers: { 'User-Agent': userAgent }
  });

  const $ = cheerio.load(data);
  const rows = [];

  $('.result').each((_, el) => {
    if (rows.length >= limit) return;
    const title = $(el).find('.result__a').text().trim();
    const sourceUrl = $(el).find('.result__a').attr('href')?.trim();
    const snippet = $(el).find('.result__snippet').text().trim();
    if (title && sourceUrl) rows.push({ title, sourceUrl, snippet });
  });

  const stats = await upsertItems(rows, {
    query,
    source: 'duckduckgo',
    sourceType: 'search-news',
    userAgent,
    requestDelayMs
  });

  return { query, scanned: rows.length, ...stats };
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
