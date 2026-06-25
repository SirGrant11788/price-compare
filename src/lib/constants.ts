/** Color mapping for each store badge. Add new stores here. */
export const STORE_COLORS: Record<string, string> = {
  Checkers: '#16a34a',
  'Dis-Chem': '#2563eb',
  Clicks: '#9333ea',
  Woolworths: '#ea580c',
  'Pick n Pay': '#dc2626',
};

/** Ordered list of active stores (controls column order in comparison table). */
export const STORE_NAMES = ['Checkers', 'Dis-Chem', 'Clicks', 'Woolworths', 'Pick n Pay'];

/** Default color for unknown stores. */
export const DEFAULT_STORE_COLOR = '#6b7280';
