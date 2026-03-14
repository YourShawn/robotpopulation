import cron from 'node-cron';
import { crawlFeedSources, crawlCompanyRegistrySources } from './scraperService.js';

export function startScheduler() {
  const schedule = process.env.CRAWL_CRON || '0 3 * * *'; // daily 03:00
  const userAgent = process.env.USER_AGENT || 'MapIntelBot/0.1';
  const delay = Number(process.env.REQUEST_DELAY_MS || 800);

  cron.schedule(schedule, async () => {
    try {
      console.log('[scheduler] daily crawl started');
      const feedResult = await crawlFeedSources({ userAgent, perFeedLimit: 20, requestDelayMs: delay });
      const companyResult = await crawlCompanyRegistrySources({ userAgent, perSourceLimit: 10, requestDelayMs: delay });
      console.log('[scheduler] daily crawl done', {
        feedSources: feedResult.feeds,
        companySources: companyResult.sources
      });
    } catch (e) {
      console.error('[scheduler] crawl failed:', e.message);
    }
  });

  if (String(process.env.CRAWL_RUN_ON_STARTUP || 'true') === 'true') {
    setTimeout(async () => {
      try {
        console.log('[scheduler] startup crawl started');
        await crawlFeedSources({ userAgent, perFeedLimit: 8, requestDelayMs: delay });
        await crawlCompanyRegistrySources({ userAgent, perSourceLimit: 4, requestDelayMs: delay });
        console.log('[scheduler] startup crawl done');
      } catch (e) {
        console.error('[scheduler] startup crawl failed:', e.message);
      }
    }, 4000);
  }

  console.log(`[scheduler] enabled with cron: ${schedule}`);
}
