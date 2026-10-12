// Scrapers de toutes les sources. Chaque source renvoie une liste d'annonces normalisées :
// { site, siteName, id, key, title, price, priceNum, currency, url, photos[], description, category, added, rank }
import { parse as parsePuhlmann } from './watch.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { json = false, retries = 2, ...opts } = {}) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, {
        headers: { 'user-agent': UA, accept: json ? 'application/json' : 'text/html,*/*', ...opts.headers },
        signal: AbortSignal.timeout(40000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return { res: r, body: json ? await r.json() : await r.text() };
    } catch (e) {
      if (i >= retries) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

const decode = (s = '') => s
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#0?39;|&apos;|&#8217;/g, "'").replace(/&#8211;/g, '–').replace(/&#8243;|&#8221;/g, '"').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const clean = (s = '') => decode(s.replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '))
  .replace(/[ \t\r\f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim();
const money = (n, cur) => (n == null ? null : `${Math.round(n).toLocaleString('en-US').replace(/,/g, ' ')} ${cur === 'EUR' ? '€' : cur === 'USD' ? '$' : cur}`);

// Annonce vendue / indisponible (statut du site, titre ou description)
const SOLD_TITLE = /\b(sold|sold out|not available|unavailable|no longer available|sale pending|pending sale|sale in progress|reserved|on hold|vendu)\b/i;
const SOLD_TITLE_OK = /\bsold (as|with|separately|in|by|only)\b/i; // « sold as is »… ne veut pas dire vendu
const SOLD_DESC = /(client\s+successfully\s+sold|\b(item|this (item|lens|camera|set|unit|package|kit)) (has been|was|is) (successfully )?sold\b(?! (as|with|separately|by|in)\b)|\bsold out\b|no longer available|currently (not available|unavailable)|sale pending|pending sale|sale in progress|no longer for sale|\bvendu\b)/i;
export const isSold = (it) => (SOLD_TITLE.test(it.title || '') && !SOLD_TITLE_OK.test(it.title || '')) || SOLD_DESC.test(it.description || '') || /\b(sold|sold out)\b/i.test(it.price || '');

function finish(site, siteName, items) {
  items = items.filter((it) => !isSold(it));
  // rang = ordre de fraîcheur dans la source (date d'ajout si connue, sinon ordre du site)
  const withDates = items.some((i) => i.added);
  if (withDates) items.sort((a, b) => (b.added || '').localeCompare(a.added || ''));
  return items.map((it, rank) => ({
    site, siteName, key: `${site}:${it.id}`, price: null, priceNum: null, currency: null,
    photos: [], description: '', category: '', added: null, ...it, photos: [...new Set(it.photos)].slice(0, 12), rank,
  }));
}

// ---------- Puhlmann (toutes les rubriques « pre-owned ») ----------
const PUHLMANN_PAGES = [
  ['cameras/arri/', 'Cameras › ARRI'], ['cameras/sony/', 'Cameras › Sony'], ['cameras/red/', 'Cameras › RED'], ['cameras/various/', 'Cameras › Various'],
  ['cameras/camera-components/', 'Camera components'],
  ['lenses/single-prime-lenses/', 'Lenses › Single primes'], ['lenses/prime-lens-sets-1/', 'Lenses › Prime sets'], ['lenses/prime-lenses-2/', 'Lenses › Prime sets'],
  ['lenses/prime-lens-sets-3/', 'Lenses › Prime sets'], ['lenses/rehoused-prime-lens-sets/', 'Lenses › Rehoused primes'], ['lenses/zoom/', 'Lenses › Zoom'],
  ['lenses/lens-for-special-applications/', 'Lenses › Special applications'],
  ['electronic-accessories/', 'Electronic accessories'], ['mechanical-accessories/', 'Mechanical accessories'],
  ['lighting/', 'Lighting'], ['support/', 'Support'], ['grip/', 'Grip'],
];
async function puhlmann() {
  const seen = new Set(), items = [];
  for (const [path, category] of PUHLMANN_PAGES) {
    const url = `https://www.puhlmann.tv/pre-owned/${path}`;
    let parsed;
    try { parsed = parsePuhlmann((await get(url)).body); } catch (e) { console.warn('puhlmann', path, e.message); continue; }
    for (const it of parsed) {
      const text = it.lines.join('\n');
      // chez Puhlmann, une annonce vendue porte « successfully sold » (ou « - sold - »)
      if (/succe?s+fully\s+sold|[-–]\s*sold\s*[-–]|^\W*sold\W*$/im.test(text)) continue;
      // identifiant : référence PC.xx.xxxx où qu'elle soit dans le texte, sinon titre + empreinte du contenu
      const ref = it.ref || text.match(/PC\.\d+\.\d+/)?.[0];
      const id = ref || `${it.title}#${[...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7).toString(36)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const current = (it.price || '').replace(/\(avant[^)]*\)/g, '');
      const m = current.match(/(\d{1,3}(?:\.\d{3})*),\d{2}/);
      const priceNum = m ? +m[1].replace(/\./g, '') : null;
      items.push({
        id, title: it.title, url, photos: it.photos.map((p) => p.replace('1280x1280', '800x800')),
        price: priceNum ? money(priceNum, 'EUR') + (/MwSt|ex VAT|HT/i.test(it.price) ? ' HT' : '') : null,
        priceNum, currency: 'EUR', description: it.lines.join('\n'), category,
      });
    }
    await sleep(400);
  }
  return finish('puhlmann', 'Puhlmann Cine', items);
}

// ---------- WooCommerce (Store API publique) ----------
async function woo(site, siteName, host, { filter = () => true, categoryOf } = {}) {
  const all = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const { res, body } = await get(`https://${host}/wp-json/wc/store/v1/products?per_page=100&page=${page}&orderby=date&order=desc`, { json: true });
    pages = +res.headers.get('x-wp-totalpages') || 1;
    all.push(...body);
    await sleep(300);
  }
  const items = all.filter((p) => p.is_in_stock !== false && filter(p)).map((p) => {
    const minor = p.prices?.currency_minor_unit ?? 2;
    const num = +p.prices?.price / 10 ** minor;
    const cur = p.prices?.currency_code || 'USD';
    return {
      id: String(p.id), title: clean(p.name), url: p.permalink,
      photos: p.images.map((i) => i.src),
      price: num > 0 ? money(num, cur) : 'Prix sur demande', priceNum: num > 0 ? num : null, currency: cur,
      description: clean(p.short_description) || clean(p.description).slice(0, 700),
      category: categoryOf ? categoryOf(p) : p.categories.map((c) => decode(c.name)).join(' › '),
    };
  });
  return finish(site, siteName, items);
}

const alanGordon = () => woo('alangordon', 'Alan Gordon', 'www.alangordon.com', {
  // uniquement le matériel d'occasion (sales/used/*)
  filter: (p) => /\/used\//i.test(p.permalink) || p.categories.some((c) => /\/used\//i.test(c.link)),
  categoryOf: (p) => {
    const c = p.categories.find((c) => /\/used\//i.test(c.link)) || p.categories[0];
    const seg = (c?.link || '').split('/product-category/used/')[1]?.split('/').filter(Boolean)[0];
    return seg ? decode(seg.replace(/-used$/, '').replace(/-/g, ' ')).replace(/^\w/, (x) => x.toUpperCase()) : decode(c?.name || '');
  },
});
const newLifeCine = () => woo('newlifecine', 'New Life Cine', 'newlifecine.com', {
  categoryOf: (p) => decode((p.categories.find((c) => !/^(lenses|cameras)$/i.test(c.slug)) || p.categories[0])?.name || ''),
});
const broadcastSolutions = () => woo('broadcastsolutions', 'Broadcast Solutions', 'broadcastsolutions.com', {
  categoryOf: (p) => p.categories.map((c) => decode(c.name)).join(' › '),
});

// ---------- AW Gear (GoDaddy / mysimplestore) ----------
async function awGear() {
  const base = 'https://87b0067c-185e-4190-a36b-f3a75c66948b.mysimplestore.com';
  const out = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const { body } = await get(`${base}/api/v2/products?page=${page}&per_page=100&q%5Bdescend_by_created_at%5D=true`, { json: true });
    pages = body.pages || 1;
    out.push(...body.products);
  }
  const items = out.filter((p) => p.available !== false && p.in_stock !== false).map((p) => ({
    id: p.id, title: clean(p.name), url: `https://theawgear.com/products${p.relative_url}`,
    photos: (p.assets?.length ? p.assets.map((a) => a.large_url || a.url) : (p.image_list || []).map((i) => i.url)).filter(Boolean),
    price: p.price?.numeric ? money(p.sale_price?.numeric || p.price.numeric, p.currency || 'USD') : 'Prix sur demande',
    priceNum: p.price?.numeric ? (p.sale_price?.numeric || p.price.numeric) : null, currency: p.currency || 'USD',
    description: clean(p.description_raw || ''), category: '', added: p.created_at,
  }));
  return finish('awgear', 'AW Gear', items);
}

// ---------- New Pro Video ----------
async function newProVideo() {
  const root = 'https://newprovideo.com';
  const links = new Set();
  for (const cat of ['all-listings']) {
    const { body } = await get(`${root}/equipment/category/${cat}`);
    for (const m of body.matchAll(/class="product__link"\s+href="([^"]+)"/g)) links.add(m[1]);
  }
  const items = (await pool([...links], 5, async (url) => {
    try {
      const { body: h } = await get(url);
      const title = clean((h.match(/<h1[^>]*product__title[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
      const priceTxt = clean((h.match(/<p class="product__price"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '');
      const num = parseFloat(priceTxt.replace(/[^0-9.]/g, ''));
      const photos = [...h.matchAll(/<a href="(https:\/\/newprovideo\.com\/user_files\/[^"]+)"/g)].map((m) => m[1]);
      const desc = [(h.match(/<p class="product__desc">([\s\S]*?)<\/li>/) || [])[1], (h.match(/<div class="product__row\s+product__full-description">([\s\S]*?)<\/div>\s*<\/div>/) || [])[1]]
        .filter(Boolean).map(clean).join('\n');
      const crumbs = [...h.matchAll(/class="breadcrumbs__link" href="[^"]*category\/[^"]*">([^<]*)</g)].map((m) => decode(m[1]).trim());
      return {
        id: url.split('/equipment/product/')[1], title, url, photos, description: desc.slice(0, 1500),
        price: num > 0 ? money(num, 'USD') : 'Prix sur demande', priceNum: num > 0 ? num : null, currency: 'USD',
        category: crumbs.join(' › ') || decode(url.split('/equipment/product/')[1].split('/')[0].replace(/-/g, ' ')),
      };
    } catch (e) { console.warn('newprovideo', url, e.message); return null; }
  })).filter((i) => i && i.title);
  return finish('newprovideo', 'New Pro Video', items);
}

// ---------- CineLenses (API interne du site) ----------
async function cineLenses() {
  const api = 'https://api.cinelenses.com/app/productmarketplace/page';
  const out = [];
  for (let page = 0, total = Infinity; out.length < total && page < 40; page++) {
    const { body } = await get(`${api}/${page}/100`, { json: true, headers: { 'content-type': 'application/json' } });
    total = body.total ?? out.length;
    if (!body.data?.length) break;
    out.push(...body.data);
  }
  const COND = { E: 'Excellent', G: 'Good', F: 'Fair', N: 'New', M: 'Mint' };
  const items = out.filter((p) => (!p.state || p.state === 'ACTIVE') && !p.soldDate).map((p) => {
    const usd = p.pricedollar > 0 ? p.pricedollar : null;
    const eur = p.price > 0 ? p.price : null;
    const prices = [eur && money(eur, 'EUR'), usd && money(usd, 'USD')].filter(Boolean);
    const seller = [p.user?.name, p.user?.country?.name].filter(Boolean).join(' – ');
    return {
      id: String(p.id), title: clean(p.title), url: 'https://cinelenses.com/marketplace',
      photos: ['image', 'image1', 'image2', 'image3', 'image4', 'image5'].map((k) => p[k]).filter(Boolean).map((n) => `https://cinelenses.com/image/${n}`),
      price: prices.length ? prices.join(' · ') : 'Prix sur demande',
      priceNum: eur ?? usd, currency: eur ? 'EUR' : 'USD',
      description: [p.conditionProduct && `Condition : ${COND[p.conditionProduct] || p.conditionProduct}`, seller && `Vendeur : ${seller}`, clean(p.description)].filter(Boolean).join('\n'),
      category: p.productType ? p.productType[0] + p.productType.slice(1).toLowerCase() : '', added: p.createDate,
    };
  });
  return finish('cinelenses', 'CineLenses', items);
}

// ---------- CinemaCameras.com (Shopify) ----------
async function cinemaCameras() {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const { body } = await get(`https://cinemacameras.com/products.json?limit=250&page=${page}`, { json: true });
    if (!body.products?.length) break;
    out.push(...body.products);
  }
  const items = out.filter((p) => p.variants.some((v) => v.available)).map((p) => {
    const prices = p.variants.filter((v) => v.available).map((v) => +v.price).filter((n) => n > 0);
    const num = prices.length ? Math.min(...prices) : null;
    return {
      id: String(p.id), title: clean(p.title), url: `https://cinemacameras.com/products/${p.handle}`,
      photos: p.images.map((i) => i.src),
      price: num ? money(num, 'USD') : 'Prix sur demande', priceNum: num, currency: 'USD',
      description: clean(p.body_html || ''), category: p.product_type || '', added: p.published_at || p.created_at,
    };
  });
  return finish('cinemacameras', 'CinemaCameras', items);
}

export const SOURCES = [
  { id: 'puhlmann', name: 'Puhlmann Cine', run: puhlmann },
  { id: 'alangordon', name: 'Alan Gordon', run: alanGordon },
  { id: 'awgear', name: 'AW Gear', run: awGear },
  { id: 'newlifecine', name: 'New Life Cine', run: newLifeCine },
  { id: 'newprovideo', name: 'New Pro Video', run: newProVideo },
  { id: 'cinelenses', name: 'CineLenses', run: cineLenses },
  { id: 'broadcastsolutions', name: 'Broadcast Solutions', run: broadcastSolutions },
  { id: 'cinemacameras', name: 'CinemaCameras', run: cinemaCameras },
];
