const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  desk: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  rooms: '<path d="M20 21V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16m-3 0h18M9 21V6l7 2v13m-4-8h.01"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"/>',
  settings: '<path d="M9 3h6l1 3 3 1 2 4-2 2v3l-3 3-3-1-3 2-4-2v-3l-3-2V9l3-2 1-3z"/><circle cx="12" cy="12" r="3"/>',
  building: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3"/>',
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', down: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pin: '<path d="M20 10c0 5-8 10-8 10S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  doc: '<path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 12h5m-5 4h5"/>',
  logout: '<path d="M11 4H5v16h6m-2-8h12m-4-4 4 4-4 4"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5zM3 12l9 5 9-5m-18 4 9 5 9-5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
};
export const icon = (name, size = 20) => '<svg aria-hidden="true" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] ?? paths.grid) + '</svg>';
export const logo = '<svg width="27" height="27" viewBox="0 0 32 32" aria-hidden="true" fill="none"><path d="M4 12.5 16 5l12 7.5L16 20 4 12.5Z" fill="#d9f5a5"/><path d="m4 18 12 7.5L28 18v3L16 28.5 4 21v-3Z" fill="#d9f5a5"/><path d="m10 12.5 6-3.75 6 3.75-6 3.75-6-3.75Z" fill="#143e32"/></svg>';
