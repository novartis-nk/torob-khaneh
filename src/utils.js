export const fa = (value) =>
  new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(value);
export const money = (value) => `${fa(value / 1e6)} میلیون`;
export const timeAgo = (value) => {
  const h = Math.max(0, Math.floor((Date.now() - value) / 3600000));
  return h < 1
    ? 'کمتر از یک ساعت پیش'
    : h < 24
      ? `${fa(h)} ساعت پیش`
      : `${fa(Math.floor(h / 24))} روز پیش`;
};
export const readSaved = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
};
export const persist = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};
export function searchParams(query, filters, sort) {
  const p = new URLSearchParams();
  if (query) p.set('q', query);
  for (const [k, v] of Object.entries(filters)) {
    if (v !== '' && v !== false && v != null && (!Array.isArray(v) || v.length))
      p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  if (sort !== 'recommended') p.set('sort', sort);
  return p;
}
export const initialParams = () => {
  const p = new URLSearchParams(location.search),
    filters = {};
  for (const key of ['maxDeposit', 'maxRent', 'minArea', 'bedrooms', 'maxMetro', 'rate'])
    if (p.has(key)) filters[key] = p.get(key);
  for (const key of ['parking', 'elevator', 'balcony'])
    if (p.get(key) === 'true') filters[key] = true;
  if (p.get('districts')) filters.districts = p.get('districts').split(',');
  return { q: p.get('q') || '', sort: p.get('sort') || 'recommended', filters };
};
