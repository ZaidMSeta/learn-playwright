/**
 * errors.ts
 * 
 * Centralizes error detection
 * - extracting <error> messages
 * - detecting stale token responses for t/e
 * - detecting session expiry
 */

// gets first error message from XML result and returns null if no <error> tag exists
export function extractFirstXmlError(xml: string): string | null {
    const m = xml.match(/<error>([\s\S]*?)<\/error>/i);
    return m ? m[1].trim() : null;
  }
  
// detects specific error when t/e tokens dont work
// when true, template is refreshed to get tokens again
  export function isTimeTokenError(xml: string): boolean {
    return /timezone and time/i.test(xml);
  }
// detects session expiry / auth failue
// when true, the scraper will abort (need to rerun auth.setup )
  export function isNotAuthorized(xml: string): boolean {
    return /Error\s*7133:\s*Not Authorized/i.test(xml);
  }
  