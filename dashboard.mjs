// Tableau de bord : scrape toutes les sources et produit une page web (+ data.json).
// Usage : node dashboard.mjs                 scrape tout (~2 min) → dashboard.html + data.json
//         node dashboard.mjs --cached        régénère la page depuis data.json sans rescraper
//         node dashboard.mjs --out site      écrit site/index.html + site/data.json (publication GitHub Pages)
// Variable PREV_DATA_URL : URL du data.json précédemment publié, utilisée si une source tombe en panne.
// N'envoie aucune notification et ne touche pas à seen.json.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { SOURCES, isSold } from './scrapers.mjs';

const here = (f) => new URL(f, import.meta.url);
const read = async (f, fallback) => { try { return JSON.parse(await readFile(here(f), 'utf8')); } catch { return fallback; } };
const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : (process.argv[i + 1] ?? true); };
const now = new Date().toISOString();
const outDir = arg('--out');

// données de la publication précédente (repli si une source échoue)
async function previous() {
  const local = await read('data.json');
  if (local) return local;
  if (process.env.PREV_DATA_URL) {
    try { return await (await fetch(process.env.PREV_DATA_URL, { signal: AbortSignal.timeout(30000) })).json(); } catch (e) { console.warn('données précédentes indisponibles :', e.message); }
  }
  return null;
}

let data, prevFx = null;
if (arg('--cached')) {
  data = await read('data.json');
  if (!data) throw new Error('data.json introuvable : lancez d\'abord node dashboard.mjs');
} else {
  const prev = await previous();
  prevFx = prev?.fx || (prev?.usdEur ? { date: prev.usdEur.date, toEUR: { USD: prev.usdEur.rate } } : null);
  const prevBySite = {};
  for (const it of prev?.items || []) (prevBySite[it.site] ||= []).push(it);

  const results = await Promise.all(SOURCES.map(async (s) => {
    const t = Date.now(), old = prevBySite[s.id] || [];
    try {
      const items = await s.run();
      // une source qui renvoie soudain bien moins d'annonces est probablement partielle (blocage, page cassée)
      if (old.length >= 20 && items.length < old.length * 0.6) throw new Error(`résultat suspect : ${items.length} annonces au lieu de ${old.length}`);
      console.log(`✔ ${s.name.padEnd(20)} ${String(items.length).padStart(5)} annonces (${((Date.now() - t) / 1000).toFixed(1)}s)`);
      return { id: s.id, name: s.name, ok: true, items };
    } catch (e) {
      console.log(`✘ ${s.name.padEnd(20)} ${e.message}${old.length ? ` → ${old.length} annonces conservées de la mise à jour précédente` : ''}`);
      return { id: s.id, name: s.name, ok: !!old.length, stale: !!old.length, error: e.message, items: old };
    }
  }));

  // « première vue » : les annonces déjà présentes à la 1ʳᵉ exécution ne sont pas marquées nouvelles
  const state = await read('dashboard-state.json', { baseline: now, firstSeen: {} });
  const first = !Object.keys(state.firstSeen).length;
  for (const r of results) for (const it of r.items) {
    if (!(it.key in state.firstSeen)) state.firstSeen[it.key] = first ? null : now;
    it.firstSeen = state.firstSeen[it.key];
  }

  // ---- suivi des prix ----
  // On compare dans la DEVISE D'ORIGINE. Comparer des euros ferait apparaître de
  // fausses baisses au gré du taux : une annonce en dollars « baisserait » chaque
  // fois que l'euro monte, alors que le vendeur n'a rien changé.
  // Par clé : c = prix courant, h = plus haut constaté, u = devise,
  //           d = date du dernier changement, v = jour de la dernière vue.
  state.prices ||= {};
  const jour = Math.floor(Date.now() / 864e5);
  for (const r of results) for (const it of r.items) {
    if (it.priceNum == null) continue;            // « prix sur demande » : rien à suivre
    const p = state.prices[it.key];
    if (!p || p.u !== it.currency) {
      // annonce inconnue, ou devise changée : on repart d'une référence neuve
      state.prices[it.key] = { c: it.priceNum, h: it.priceNum, u: it.currency, d: null, v: jour };
    } else {
      if (it.priceNum !== p.c) { p.c = it.priceNum; p.h = Math.max(p.h, it.priceNum); p.d = now; }
      p.v = jour;
    }
    const q = state.prices[it.key];
    it.priceHigh = q.h > q.c ? q.h : null;        // prix barré à afficher, dans la devise de l'annonce
    it.priceDrop = q.h > q.c ? Math.round((1 - q.c / q.h) * 100) : 0;
    it.priceChangedAt = q.d;
  }
  // purge des annonces disparues depuis plus de 60 jours, pour borner le fichier d'état
  for (const k of Object.keys(state.prices)) if (jour - (state.prices[k].v || 0) > 60) delete state.prices[k];

  await writeFile(here('dashboard-state.json'), JSON.stringify(state));
  data = { generatedAt: now, sources: results.map(({ id, name, ok, stale, error, items }) => ({ id, name, ok, stale, error, count: items.length })), items: results.flatMap((r) => r.items) };
}

// ---- on ne garde que les annonces disponibles (ni vendues ni indisponibles) ----
const before = data.items.length;
data.items = data.items.filter((it) => !isSold(it));
for (const s of data.sources) s.count = data.items.filter((it) => it.site === s.id).length;
if (before !== data.items.length) console.log(`${before - data.items.length} annonce(s) vendue(s)/indisponible(s) retirée(s)`);

// ---- conversion en euros (taux BCE via frankfurter.dev) ----
// Table de taux « 1 unité de devise = x € ». Une devise absente de la table donne
// priceEUR = null (« prix à vérifier ») : jamais de livre ou de franc suisse lus comme des euros.
const FX_SYMBOLS = ['USD', 'GBP', 'CHF'];
let fx = data.fx || (data.usdEur ? { date: data.usdEur.date, toEUR: { USD: data.usdEur.rate } } : null) || prevFx;
try {
  const r = await (await fetch(`https://api.frankfurter.dev/v1/latest?base=EUR&symbols=${FX_SYMBOLS.join(',')}`, { signal: AbortSignal.timeout(15000) })).json();
  const toEUR = {};
  for (const c of FX_SYMBOLS) if (r.rates?.[c] > 0) toEUR[c] = Math.round(1e5 / r.rates[c]) / 1e5;
  if (toEUR.USD) fx = { date: r.date, toEUR };
} catch (e) { console.warn('taux de change indisponible :', e.message); }
if (!fx?.toEUR?.USD) throw new Error('Aucun taux de change disponible');
data.fx = fx;
data.usdEur = { rate: fx.toEUR.USD, date: fx.date };   // champ historique, lu par les pages
const inconnues = new Set();

// ---- grandes catégories communes à tous les sites ----
const GROUPS = [
  ['lenses', /lens|objectif/], ['cameras', /camera|camcorder/], ['monitors', /monitor|viewfinder|projector|transmitter|receiver|wireless video/],
  ['lights', /light|led\b|hmi|tungsten|fluorescent|panel/], ['support', /grip|tripod|support|dolly|dollies|jib|crane|slider|gimbal|steadicam|stabiliz|fluid head|remote head|cart\b|robotic|truck|trailer|head\b/],
  ['audio', /audio|sound|microphone|recorder|mixer/], ['accessories', /accessor|\baks\b|batter|cage|case|filter|cable|misc|matte box|follow focus|slate|bag/],
];
const TITLE_RULES = [
  ['lenses', /\b(lens|lenses|primes?|zooms?|anamorphic|cabrio|optimo|optiomo|summilux|summicron|cooke|zeiss|angenieux|fujinon|leica|sigma|hawk|panavision|alura|hj\d+x?\d*[a-z]*|cn-e|cp\.?[23]|ultra prime|master prime)\b|\b\d{1,3}(-\d{1,3})?mm\b/], ['cameras', /camera|arri 416|arri 235|gopro|alexa|venice|komodo|raptor|\bred\b|burano|\bfx\d|\bc[1-7]\d{2}\b|ursa|amira|\bmini lf\b/],
  ['monitors', /monitor|viewfinder|small ?hd|transvideo|teradek|bolt/], ['lights', /light|\bled\b|hmi|tungsten|aputure|kino/], ['support', /tripod|dolly|crane|jib|gimbal|steadicam|slider|head\b|\bmovi\b|easyrig|ronin|techno ?jib/],
  ['audio', /audio|microphone|mixer|sound devices|recorder/], ['accessories', /battery|charger|cable|case|filter|cage|handle|strap|plate|matte box|follow focus|adapter/],
];
const groupOf = (it) => {
  const cat = (it.category || '').toLowerCase(), t = (it.title || '').toLowerCase();
  for (const [g, re] of GROUPS) if (re.test(cat)) return g;
  for (const [g, re] of TITLE_RULES) if (re.test(t)) return g;
  return 'other';
};
const enEuros = (n, cur) => {
  if (n == null) return null;
  if (cur === 'EUR') return Math.round(n);
  if (fx.toEUR[cur]) return Math.round(n * fx.toEUR[cur]);
  inconnues.add(cur || '(aucune)');
  return null;
};
for (const it of data.items) {
  it.priceEUR = enEuros(it.priceNum, it.currency);
  it.priceHighEUR = enEuros(it.priceHigh, it.currency);
  it.group = groupOf(it);
}
if (inconnues.size) console.warn(`devise(s) sans taux : ${[...inconnues].join(', ')} → prix en euros laissé vide`);
const baisses = data.items.filter((it) => it.priceDrop > 0);
if (baisses.length) console.log(`${baisses.length} baisse(s) de prix en cours`);

// ---- écriture : data.json (enrichi, relu par la page toutes les 5 min) + page autonome ----
const template = await readFile(here('ui/template.html'), 'utf8').catch(() => readFile(here('template.html'), 'utf8'));
const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16));
const html = template.replace('/*__DATA__*/null', () => json);
if (outDir) {
  const dir = new URL(`${String(outDir).replace(/\/?$/, '/')}`, import.meta.url);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL('index.html', dir), html);
  await writeFile(new URL('data.json', dir), JSON.stringify(data));
  console.log(`\n${outDir}/index.html généré : ${data.items.length} annonces`);
} else {
  await writeFile(here('data.json'), JSON.stringify(data));
  await writeFile(here('dashboard.html'), html);
  console.log(`\ndashboard.html généré : ${data.items.length} annonces`);
}
