/**
 * types.ts
 *
 * Shared TypeScript types used across the scraper modules.
 *
 */


export type ScrapeConfig = {
    termId: string;
    termLinkText: string;
    cams: string;
    delayMs: number;
  };
  
  export type Paths = {
    coursesPath: string;
    outDir: string;
    xmlDir: string;
    resultsPath: string;
  };
  
  export type Template = {
    baseUrl: string;
    params: Record<string, string>;
  };
  
  export type FetchResponse = {
    status: number;
    xml: string;
    url: string;
  };
  
  export type ResolveResult =
    | { ok: true; cnKey: string; va: string }
    | { ok: false; error: string };
  