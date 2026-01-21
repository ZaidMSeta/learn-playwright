/**
 * Config.ts
 * Config for scraping, with term specific settings
 */

import path from 'node:path';
import type { Paths, ScrapeConfig } from './types';

// returns current scrape settings for current term
// TBA: auto update to new term
export function getDefaultConfig(): ScrapeConfig {
  return {
    termId: '3202610',          // replace later with auto-detect
    termLinkText: 'Winter',     // replace later with auto-detect
    cams: 'MCMSTiOFF_MCMSTiMCMST_MCMSTiMHK_MCMSTiSNPOL_MCMSTiCON',
    delayMs: 250,
  };
}
// Computes abs path derived from config
// Writes XML to out/xml/<TERM_ID>/ and logs results to out/results_<TERM_ID>.ndjson
export function getPaths(cfg: ScrapeConfig): Paths {
  const coursesPath = path.join(process.cwd(), 'courses.txt');
  const outDir = path.join(process.cwd(), 'out');
  const xmlDir = path.join(outDir, 'xml', cfg.termId);
  const resultsPath = path.join(outDir, `results_${cfg.termId}.ndjson`);
  return { coursesPath, outDir, xmlDir, resultsPath };
}
