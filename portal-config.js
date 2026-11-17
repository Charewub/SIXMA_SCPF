/*
 * Central catalogue for the ALLSTAR assessment portal.
 * Add future modules here; the portal grid creates cards automatically.
 * Set the Talent Compass `url` when its public app URL is ready.
 */
window.SIXMA_PORTAL_MODULES = [
  { id: 'starmeter', title: 'StarMeter', subtitle: 'Assessment', icon: 'star', theme: 'black', status: 'comingSoon' },
  { id: 'sixma-self', title: 'SIXMA™', subtitle: 'Self Profile', icon: 'track_changes', theme: 'silver', status: 'comingSoon' },
  { id: 'sixma-success', title: 'SIXMA™', subtitle: 'Success Profile', icon: 'track_changes', theme: 'red', status: 'active', target: 'sixma' },
  { id: 'talent-compass', title: 'Talent Compass', subtitle: 'Assessment', icon: 'explore', theme: 'crimson', status: 'active', url: '' },
  { id: 'lg', title: 'L&G', subtitle: 'Assessment', icon: 'landscape', theme: 'white', status: 'comingSoon' }
];
