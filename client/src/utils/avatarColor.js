const COLORS = [
  { bg: 'rgba(79,142,247,0.15)',  text: '#7eb3fc' },
  { bg: 'rgba(29,179,136,0.15)',  text: '#4ade9a' },
  { bg: 'rgba(124,95,240,0.15)', text: '#a78bfa' },
  { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24' },
  { bg: 'rgba(216,90,48,0.15)',  text: '#fb8c6b' },
  { bg: 'rgba(236,72,153,0.15)', text: '#f472b6' },
];

export function getAvatarColor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash + name.charCodeAt(i)) % COLORS.length;
  }
  return COLORS[hash];
}

export function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0].toUpperCase())
    .slice(0, 2)
    .join('');
}
