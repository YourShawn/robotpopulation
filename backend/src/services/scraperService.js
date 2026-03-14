import axios from 'axios';
import * as cheerio from 'cheerio';
import { RawItem } from '../models/RawItem.js';
import { geocodeCity } from './geocodeService.js';
import { hashContent, normalizeUrl } from '../utils/dedupe.js';

const CITY_REGEX = /\b(Toronto|Vancouver|Montreal|Calgary|Ottawa|New York|London|Paris|Tokyo|Beijing|Shanghai|Shenzhen|Singapore|Sydney|Berlin)\b/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferCity(text = '') {
  const m = text.match(CITY_REGEX);
  return m?.[1] ?? 'Unknown';
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

  const stats = { inserted: 0, duplicateUrl: 0, duplicateContent: 0, failed: 0 };

  for (const row of rows) {
    const normalizedUrl = normalizeUrl(row.sourceUrl);
    const contentHash = hashContent(row);
    const city = inferCity(`${row.title} ${row.snippet}`);
    const location = await geocodeCity(city, userAgent);

    try {
      await RawItem.create({
        query,
        source: 'duckduckgo',
        sourceUrl: row.sourceUrl,
        normalizedUrl,
        title: row.title,
        snippet: row.snippet,
        contentHash,
        city,
        country: 'Unknown',
        location
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

    await sleep(requestDelayMs);
  }

  return { query, scanned: rows.length, ...stats };
}
