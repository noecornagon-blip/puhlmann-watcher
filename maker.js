/* Visuels Instagram — éditeur partagé par le mur (mur.html) et la Veille matos (index.html).
   Utilise le moteur de rendu du Studio TrouveTonMatos (render-core.js + modèle de story),
   chargé à la première utilisation : les visuels sont identiques à ceux du Studio.
   Les photos sont chargées en CORS ; les sites qui ne l'autorisent pas passent par le
   relais d'images public wsrv.nl, faute de quoi le navigateur interdirait l'export PNG.

   Utilisation : <script src="maker.js"></script> en fin de <body>, puis TTMMaker.open(annonce).
   Toutes les classes sont préfixées « mk- » pour ne pas hériter des styles de la page hôte ;
   les couleurs reprennent les variables de la page (--surf, --ink, --rose…) quand elles existent. */
(() => {
  'use strict';
  const STUDIO = 'https://trouvetonmatos-studio.vercel.app/studio/';
  const PREFS = 'mur-marge-eur';

  const css = `
#mkdlg{--mk-surf:var(--surf,#fff);--mk-surf2:var(--surf2,var(--soft,#f4f4f4));--mk-line:var(--line,#ddd);
  --mk-ink:var(--ink,#222);--mk-mute:var(--mute,#717171);--mk-rose:var(--rose,#ff385c);
  border:1px solid var(--mk-line);background:var(--mk-surf);color:var(--mk-ink);border-radius:18px;padding:0;margin:auto;
  width:min(1100px,96vw);max-width:96vw;max-height:94vh;overflow:hidden;font-size:15px;line-height:1.4;box-shadow:0 30px 90px #000b}
#mkdlg::backdrop{background:#000a;backdrop-filter:blur(3px)}
#mkdlg[open]{display:flex;flex-direction:column}
#mkdlg *{box-sizing:border-box}
#mkdlg .mk-hd{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--mk-line);font-weight:800;flex:none}
#mkdlg .mk-src{color:var(--mk-mute);font-weight:600;font-size:13px}
#mkdlg .mk-x{margin-left:auto;border:0;background:none;color:var(--mk-mute);font-size:20px;cursor:pointer;padding:4px 8px}
#mkdlg .mk-bd{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:18px;padding:16px 18px;overflow:auto;
  flex:1 1 auto;min-height:0;max-height:calc(94vh - 130px)}
#mkdlg .mk-pv{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:start}
#mkdlg .mk-pv canvas{border-radius:12px;background:#000;width:100%;height:auto;display:block}
#mkdlg .mk-ph{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
#mkdlg .mk-ph label{position:relative;cursor:pointer}
#mkdlg .mk-ph img{width:64px;height:64px;object-fit:cover;border-radius:10px;border:2px solid transparent;display:block;opacity:.55}
#mkdlg .mk-ph input{position:absolute;opacity:0}
#mkdlg .mk-ph input:checked+img{border-color:var(--mk-rose);opacity:1}
#mkdlg .mk-ph .bad img{filter:grayscale(1);opacity:.25}
#mkdlg form{display:grid;gap:12px;align-content:start;margin:0}
#mkdlg .mk-f{display:grid;gap:5px;font-size:12px;font-weight:700;color:var(--mk-mute)}
#mkdlg input[type=text],#mkdlg input[type=number],#mkdlg select{background:var(--mk-surf2);border:1px solid var(--mk-line);border-radius:10px;
  color:var(--mk-ink);font:inherit;font-size:15px;font-weight:400;padding:9px 11px;width:100%;min-width:0}
#mkdlg input:focus,#mkdlg select:focus{outline:0;border-color:var(--mk-rose)}
#mkdlg input[type=range]{width:100%;accent-color:var(--mk-rose)}
#mkdlg .mk-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
#mkdlg .mk-seg{display:flex;gap:6px;flex-wrap:wrap}
#mkdlg .mk-seg label{display:flex;align-items:center;gap:6px;border:1px solid var(--mk-line);border-radius:999px;padding:6px 12px;cursor:pointer;font-size:13px;font-weight:600;color:var(--mk-ink)}
#mkdlg .mk-seg input{accent-color:var(--mk-rose)}
#mkdlg .mk-sale{background:var(--mk-surf2);border-radius:12px;padding:10px 12px;display:flex;justify-content:space-between;align-items:baseline;gap:8px}
#mkdlg .mk-sale b{font-size:22px}
#mkdlg .mk-sale small{color:var(--mk-mute);font-size:12px}
#mkdlg .mk-ft{display:flex;align-items:center;gap:10px;padding:12px 18px;border-top:1px solid var(--mk-line);flex-wrap:wrap;flex:none}
#mkdlg .mk-msg{color:var(--mk-mute);font-size:13px;margin-right:auto}
#mkdlg .mk-go{border:0;border-radius:12px;padding:11px 18px;font-family:inherit;font-weight:700;font-size:15px;line-height:1.2;cursor:pointer;background:var(--mk-rose);color:#fff}
#mkdlg .mk-go.alt{background:var(--mk-surf2);color:var(--mk-ink);border:1px solid var(--mk-line)}
#mkdlg .mk-go:disabled{opacity:.5;cursor:default}
#mkdlg .mk-lnk{color:var(--mk-mute);font-size:13px}
#mkdlg textarea{background:var(--mk-surf2);border:1px solid var(--mk-line);border-radius:10px;color:var(--mk-ink);
  font-family:inherit;font-size:14px;line-height:1.45;padding:10px 11px;width:100%;min-width:0;resize:vertical;min-height:190px}
#mkdlg textarea:focus{outline:0;border-color:var(--mk-rose)}
#mkdlg .mk-cap{border-top:1px solid var(--mk-line);padding-top:12px}
#mkdlg .mk-caprow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
#mkdlg .mk-caprow select{width:auto;flex:1;min-width:120px}
#mkdlg .mk-sm{padding:8px 13px;font-size:13px;border-radius:10px}
@media (max-width:800px){#mkdlg .mk-bd{grid-template-columns:1fr}#mkdlg .mk-lnk{display:none}#mkdlg .mk-msg{flex-basis:100%}#mkdlg .mk-go{flex:1}}`;

  const html = `
  <div class="mk-hd"><span id="mkTitle">📸 Visuels Instagram</span><span class="mk-src" id="mkSrc"></span><button type="button" class="mk-x" id="mkClose" aria-label="Fermer">✕</button></div>
  <div class="mk-bd">
    <div>
      <div class="mk-pv"><canvas id="pvStory" aria-label="Aperçu story"></canvas><canvas id="pvPost" aria-label="Aperçu post"></canvas></div>
      <div class="mk-ph" id="mkPhotos"></div>
    </div>
    <form id="mkForm" autocomplete="off">
      <label class="mk-f">Titre<input type="text" name="title" maxlength="90"></label>
      <label class="mk-f">Prix d'achat HT (€)<input type="number" name="buy" min="0" step="1" inputmode="decimal"></label>
      <div class="mk-row">
        <label class="mk-f">Marge HT (€)<input type="number" name="margin" step="10" inputmode="decimal"></label>
        <label class="mk-f">Prix final HT (€)<input type="number" name="sale" min="0" step="10" inputmode="decimal"></label>
      </div>
      <div class="mk-sale"><span>Sur le visuel</span><span><b id="mkSale">—</b> <small id="mkMarge"></small></span></div>
      <div class="mk-f"><span>Formats</span>
        <div class="mk-seg"><label><input type="checkbox" name="story" checked> Story 9:16</label><label><input type="checkbox" name="post" checked> Post carré</label></div></div>
      <div class="mk-row">
        <label class="mk-f">Résolution<select name="scale"><option value="2">Haute — 2160 px</option><option value="1">Standard — 1080 px</option></select></label>
        <label class="mk-f">Cadrage<select name="mode"><option value="cover">Remplir le cadre</option><option value="contain">Photo entière</option></select></label>
      </div>
      <label class="mk-f">Zoom <input type="range" name="zoom" min="1" max="2.5" step="0.05" value="1"></label>
      <div class="mk-f mk-cap"><span>Description Instagram</span>
        <textarea id="mkCap" rows="10" spellcheck="true" aria-label="Description Instagram"></textarea>
        <div class="mk-caprow">
          <select name="capStyle" aria-label="Style de description"><option value="full">Complète (avec le contenu du lot)</option><option value="short">Courte</option></select>
          <button type="button" class="mk-go alt mk-sm" id="mkCapNew" title="Proposer une autre accroche">↻ Autre accroche</button>
          <button type="button" class="mk-go mk-sm" id="mkCapCopy">Copier</button>
        </div>
      </div>
    </form>
  </div>
  <div class="mk-ft">
    <span class="mk-msg" id="mkMsg"></span>
    <a class="mk-lnk" href="${STUDIO}" target="_blank" rel="noopener">Ouvrir le Studio complet ↗</a>
    <button type="button" class="mk-go alt" id="mkShare" hidden disabled>Partager</button>
    <button type="button" class="mk-go" id="mkGo" disabled>Télécharger le ZIP</button>
  </div>`;

  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const dlg = document.createElement('dialog'); dlg.id = 'mkdlg'; dlg.setAttribute('aria-labelledby', 'mkTitle'); dlg.innerHTML = html;
  document.body.appendChild(dlg);

  const $ = (s) => dlg.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const MK = { engine: null, item: null, photos: [], busy: false, preview: null, capVariant: 0, capDirty: false };

  /* ---------- moteur du Studio ---------- */
  const loadScript = (src) => new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok;
    s.onerror = () => ko(new Error('Studio injoignable (' + src.split('/').pop() + ')'));
    document.head.appendChild(s);
  });
  const newCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  function loadEngine() {
    if (!MK.engine) MK.engine = (async () => {
      if (!window.TTMRender) await loadScript(STUDIO + 'render-core.js');
      if (!window.TTM_TEMPLATES?.story) await loadScript(STUDIO + 'assets/template-story.js');
      const R = window.TTMRender, T = R.TEMPLATES;
      const img = new Image(); img.src = window.TTM_TEMPLATES.story; await img.decode();
      T.story.image = img;
      if (T.story.autodetect) { const f = R.detectSlot(img, newCanvas); if (f) T.story.slot = f; }  // comme le Studio
      T.post.image = R.buildPostTemplate(img, newCanvas);
      return R;
    })().catch((e) => { MK.engine = null; throw e; });
    return MK.engine;
  }
  function loadPhoto(url) {
    const tryLoad = (src) => new Promise((ok, ko) => {
      const im = new Image(); im.crossOrigin = 'anonymous'; im.referrerPolicy = 'no-referrer';
      im.onload = () => ok(im); im.onerror = ko; im.src = src;
    });
    return tryLoad(url).catch(() => tryLoad('https://wsrv.nl/?url=' + encodeURIComponent(url)));
  }
  const slug = (t) => String(t || 'visuel').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'visuel';
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };

  /* ---------- prix : marge et prix final liés (prix final = prix d'achat + marge, HT, en euros) ---------- */
  const r2 = (x) => Math.round(x * 100) / 100;
  const salePrice = () => num($('#mkForm').sale.value);
  function linkPrices(changed) {
    const f = $('#mkForm'), buy = num(f.buy.value), m = num(f.margin.value), sale = num(f.sale.value);
    if (changed === 'sale') f.margin.value = buy != null && sale != null ? r2(sale - buy) : '';
    else if (buy != null && m != null) f.sale.value = r2(buy + m);   // marge ou prix d'achat modifiés
  }
  const selectedPhotos = () => MK.photos.filter((p) => p.ok && p.checked);

  /* ---------- description Instagram (générée dans la page, sans service externe) ----------
     Ne mentionne jamais le vendeur d'origine ni le prix d'achat : seulement l'article et le prix final. */
  const HOOKS = {
    cameras: ['Une caméra prête pour votre prochain tournage.', 'Le corps caméra qu’il vous faut pour passer au niveau supérieur.', 'Prête à tourner, contrôlée, disponible tout de suite.'],
    lenses: ['Une série d’optiques prête à tourner.', 'Du verre de cinéma pour donner du caractère à vos images.', 'Des optiques cinéma, contrôlées et prêtes à partir.'],
    monitors: ['Un retour image fiable pour le plateau.', 'Gardez l’œil sur chaque plan.', 'Le moniteur qu’il manque à votre configuration.'],
    lights: ['De la lumière pour sculpter vos plans.', 'Un éclairage pro, prêt pour le plateau.', 'Éclairez vos tournages comme il se doit.'],
    support: ['Machinerie et supports pour des mouvements maîtrisés.', 'De la stabilité pour vos plans.', 'Le support qu’il faut pour tourner sereinement.'],
    audio: ['Un son propre pour vos tournages.', 'L’audio pro, prêt pour le plateau.', 'Pour un son à la hauteur de vos images.'],
    accessories: ['L’accessoire qui complète votre configuration.', 'Le petit plus qui change tout sur le plateau.', 'Complétez votre kit de tournage.'],
    other: ['Du matériel cinéma pro, prêt à tourner.', 'Une belle pièce pour votre parc matériel.', 'Disponible dès maintenant.'],
  };
  const GROUP_TAGS = {
    cameras: ['#camera', '#cinemacamera'], lenses: ['#cinelens', '#objectif', '#cinemalenses'], monitors: ['#moniteur', '#monitoring'],
    lights: ['#eclairage', '#lighting'], support: ['#machinerie', '#grip'], audio: ['#audio', '#prisedeson'], accessories: ['#accessoires', '#cameragear'], other: ['#cameragear'],
  };
  const BRANDS = ['ARRI', 'RED', 'Sony', 'Canon', 'Blackmagic', 'Panasonic', 'Kinefinity', 'Z CAM', 'Cooke', 'Zeiss', 'Leica', 'Angenieux', 'Angénieux', 'Sigma', 'Fujinon', 'Tokina', 'Laowa', 'DZOFilm', 'Atlas', 'Vazen', 'Sirui', 'Panavision', 'Hawk', 'Kowa', 'Schneider', 'Xeen', 'Samyang', 'Rokinon', 'IronGlass', 'P+S Technik', 'Ultra Prime', 'Master Prime', 'Supreme', 'Tilta', 'Wooden Camera', 'Bright Tangerine', 'SmallHD', 'Atomos', 'Teradek', 'Aputure', 'Nanlite', 'Astera', 'Kino Flo', 'Litepanels', 'Creamsource', 'Sachtler', 'OConnor', "O'Connor", 'Ronin', 'DJI', 'Easyrig', 'Movi', 'Freefly', 'Sennheiser', 'Sound Devices', 'Rode'];
  const tagOf = (b) => '#' + b.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const eurTxt = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n).replace(/[  ]/g, ' ') + ' € HT';
  function lotLines(it) {
    const title = (it.title || '').trim().toLowerCase(), out = [];
    for (let l of String(it.description || '').split(/\n+/)) {
      l = l.replace(/ /g, ' ').trim();
      if (!l || l.toLowerCase() === title || /^(includes?|including|inklusive|contents?|lieferumfang|set includes?)\s*:?$/i.test(l)) continue;
      if (/https?:|www\.|€|\$|£|price|preis|prix|shipping|versand|vat|mwst|warranty|garantie|contact|e-?mail|phone|tel\.|call us|order|bestell/i.test(l)) continue;
      if (/on behalf|client|customer|available|se(p|pe)arately|condition|\bused\b|\bsold\b|\bnote\b|^\*|please|ask us|on request|auf anfrage/i.test(l)) continue;   // remarques du vendeur
      l = l.replace(/^[-•*·–]\s*/, '');
      const q = l.match(/^(\d+)\s*x\s*/i); if (q) l = l.slice(q[0].length);
      l = l.replace(/^(K\d[.\w-]*|[A-Z]{1,3}\d[\w.-]{3,})\s+/, '');                    // référence fabricant
      l = ((q ? q[1] + ' × ' : '') + l).trim();
      if (l.length < 3) continue;
      const words = l.toLowerCase().match(/[a-z0-9]+/g) || [];
      if (words.length && words.every((w) => title.includes(w))) continue;   // simple rappel du titre
      out.push(l.length > 70 ? l.slice(0, 68).trimEnd() + '…' : l);
    }
    return out;
  }
  function caption() {
    const it = MK.item; if (!it) return '';
    const f = $('#mkForm'), sale = salePrice(), title = f.title.value.trim() || it.title || '';
    const g = HOOKS[it.group] ? it.group : 'other', hooks = HOOKS[g];
    const hook = hooks[MK.capVariant % hooks.length];
    const hay = (title + ' ' + (it.category || '')).toLowerCase();
    const brands = BRANDS.filter((b) => new RegExp('(^|[^a-z0-9])' + b.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(hay));
    const tags = [...new Set([...brands.map(tagOf), ...GROUP_TAGS[g], '#trouvetonmatos', '#materielcinema', '#cinema', '#filmmaking', '#tournage', '#occasion'])].slice(0, 14);
    const price = sale != null ? `💰 ${eurTxt(sale)}` : '💰 Prix sur demande';
    const cta = '📩 Intéressé·e ? Écrivez-nous en DM ou rendez-vous sur trouvetonmatos.fr';
    if (f.capStyle.value === 'short') return [`🎬 ${title}`, hook, '', price, cta, '', tags.join(' ')].join('\n');
    const lines = lotLines(it), shown = lines.slice(0, 8);
    const lot = shown.length ? ['', '📦 Le lot comprend :', ...shown.map((l) => '• ' + l), ...(lines.length > shown.length ? ['• … et plus encore (détails en DM)'] : [])] : [];
    return [`🎬 ${title}`, '', hook, ...lot, '', price, cta, '', tags.join(' ')].join('\n');
  }
  function updateCaption(force) {
    if (MK.capDirty && !force) return;
    if (force) MK.capDirty = false;
    $('#mkCap').value = caption();
  }
  async function copyCaption() {
    const t = $('#mkCap').value;
    try { await navigator.clipboard.writeText(t); return true; }
    catch {
      const ta = $('#mkCap'); ta.focus(); ta.select();
      try { return document.execCommand('copy'); } catch { return false; }
    }
  }

  /* ---------- aperçu ---------- */
  function drawPreview() {
    const R = window.TTMRender; if (!R || !MK.item) return;
    const f = $('#mkForm'), sale = salePrice(), buy = num(f.buy.value);
    $('#mkSale').textContent = sale == null ? 'saisissez la marge ou le prix final' : R.formatPrice(String(sale)) + ' HT';
    $('#mkMarge').textContent = sale != null && buy != null ? `dont marge ${R.formatPrice(String(Math.round(sale - buy)))}` : '';
    const p = (MK.preview != null && MK.photos[MK.preview]?.ok && MK.photos[MK.preview].checked ? MK.photos[MK.preview] : null) || selectedPhotos()[0];
    for (const key of ['story', 'post']) {
      const cv = $(key === 'story' ? '#pvStory' : '#pvPost'), T = R.TEMPLATES[key], k = .5;
      cv.width = T.w * k; cv.height = T.h * k; cv.style.display = f[key].checked ? '' : 'none';
      R.compose(cv.getContext('2d'), { template: T.image, geom: T, scale: k, placeholder: !p,
        photo: p ? { source: p.img, naturalWidth: p.img.naturalWidth, naturalHeight: p.img.naturalHeight, zoom: Number(f.zoom.value), dx: 0, dy: 0, mode: f.mode.value, bg: '#000' } : null,
        text: { title: f.title.value, price: sale == null ? '' : String(sale), tax: 'HT' } });
    }
    const n = selectedPhotos().length * ((f.story.checked ? 1 : 0) + (f.post.checked ? 1 : 0));
    $('#mkGo').textContent = n ? `Télécharger le ZIP (${n} PNG)` : 'Télécharger le ZIP';
    $('#mkGo').disabled = !n || sale == null || MK.busy;
    $('#mkShare').disabled = $('#mkGo').disabled;
  }

  /* ---------- rendu haute résolution ---------- */
  async function renderAll() {
    const R = await loadEngine(), f = $('#mkForm'), sale = salePrice(), k = Number(f.scale.value);
    const out = [], base = slug(f.title.value);
    const photos = selectedPhotos();
    for (const [i, p] of photos.entries()) for (const key of ['story', 'post']) {
      if (!f[key].checked) continue;
      const T = R.TEMPLATES[key], cv = newCanvas(T.w * k, T.h * k);
      R.compose(cv.getContext('2d'), { template: T.image, geom: T, scale: k,
        photo: { source: p.img, naturalWidth: p.img.naturalWidth, naturalHeight: p.img.naturalHeight, zoom: Number(f.zoom.value), dx: 0, dy: 0, mode: f.mode.value, bg: '#000' },
        text: { title: f.title.value, price: String(sale), tax: 'HT' } });
      const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
      out.push(new File([blob], `${base}-${key}${photos.length > 1 ? '-' + (i + 1) : ''}.png`, { type: 'image/png' }));
    }
    return out;
  }

  /* ---------- ZIP sans compression (les PNG sont déjà compressés) — aucune dépendance ---------- */
  const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  async function makeZip(files) {
    const enc = new TextEncoder(), parts = [], central = [], d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let off = 0;
    for (const f of files) {
      const data = new Uint8Array(await f.arrayBuffer()), name = enc.encode(f.name), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
      c.setUint32(42, off, true);
      parts.push(h, name, data); central.push(c, name);
      off += 30 + name.length + data.length;
    }
    const size = central.reduce((s, x) => s + x.byteLength, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, size, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...central, e], { type: 'application/zip' });
  }

  /* ---------- ouverture ---------- */
  async function open(it) {
    if (!it) return;
    MK.item = it; MK.photos = []; MK.preview = null;
    const f = $('#mkForm'), saved = store.get(PREFS, { margin: 500, scale: 2, mode: 'cover' });
    f.title.value = it.title || '';
    f.buy.value = it.priceEUR != null ? Math.round(it.priceEUR) : '';
    f.margin.value = saved.margin; f.scale.value = saved.scale; f.mode.value = saved.mode;
    f.zoom.value = 1; f.sale.value = ''; linkPrices('margin');
    MK.capVariant = 0; updateCaption(true);
    $('#mkSrc').textContent = `${it.siteName || it.site || ''}${it.currency === 'USD' ? ' · prix converti en €' : ''}`;
    $('#mkMsg').textContent = 'Chargement du Studio et des photos…';
    $('#mkPhotos').innerHTML = '';
    $('#mkGo').disabled = $('#mkShare').disabled = true;
    $('#mkShare').hidden = !(navigator.canShare && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] }));
    if (!dlg.open) dlg.showModal();
    try { await loadEngine(); } catch (e) { $('#mkMsg').textContent = e.message; return; }
    // toutes les photos de l'annonce sont exportées par défaut (décochez celles à écarter)
    const list = [...new Set(it.photos || [])].slice(0, 30);
    $('#mkPhotos').innerHTML = list.map((u, i) => `<label data-i="${i}" title="Photo ${i + 1}"><input type="checkbox" checked><img src="${esc(u)}" alt="" referrerpolicy="no-referrer"></label>`).join('');
    MK.photos = list.map((u) => ({ url: u, ok: false, checked: true, img: null }));
    await Promise.all(MK.photos.map(async (p, i) => {
      try { p.img = await loadPhoto(p.url); p.ok = true; }
      catch { p.ok = false; const l = $(`#mkPhotos [data-i="${i}"]`); l?.classList.add('bad'); if (l) l.querySelector('input').checked = false; }
    }));
    if (MK.item !== it) return;
    const bad = MK.photos.filter((p) => !p.ok).length, okN = MK.photos.length - bad;
    $('#mkMsg').textContent = !list.length ? 'Cette annonce n’a pas de photo.'
      : `${okN} photo${okN > 1 ? 's' : ''} prête${okN > 1 ? 's' : ''}${bad ? ` · ${bad} inaccessible${bad > 1 ? 's' : ''} (grisée${bad > 1 ? 's' : ''})` : ''}. Décochez celles à écarter.`;
    drawPreview();
  }

  /* ---------- export ---------- */
  async function exportPngs(share) {
    const copied = share ? copyCaption() : null;   // pendant le clic : le presse-papiers l'exige
    MK.busy = true; drawPreview(); $('#mkMsg').textContent = 'Création des images…';
    try {
      const files = await renderAll();
      const cap = $('#mkCap').value.trim();
      if (share) {
        await navigator.share({ files, title: $('#mkForm').title.value });
        $('#mkMsg').textContent = (await copied) ? 'Partagé. La description est copiée : collez-la dans Instagram.' : 'Partagé.';
      } else {
        const zip = await makeZip(cap ? [...files, new File([cap + '\n'], 'description.txt', { type: 'text/plain' })] : files), name = `${slug($('#mkForm').title.value)}.zip`;
        const a = document.createElement('a'); a.href = URL.createObjectURL(zip); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        $('#mkMsg').textContent = `✔ ${name} téléchargé : ${files.length} PNG (${$('#mkForm').scale.value === '2' ? '2160' : '1080'} px de large)${cap ? ' + description.txt' : ''}.`;
      }
    } catch (e) {
      $('#mkMsg').textContent = e.name === 'AbortError' ? 'Partage annulé.' : `Échec : ${e.message}`;
    } finally { MK.busy = false; drawPreview(); }
  }

  /* ---------- événements ---------- */
  $('#mkPhotos').addEventListener('change', (e) => {
    const l = e.target.closest('label'); if (!l) return;
    const p = MK.photos[Number(l.dataset.i)]; if (p) p.checked = e.target.checked;
    MK.preview = e.target.checked ? Number(l.dataset.i) : null; drawPreview();
  });
  $('#mkForm').addEventListener('input', (e) => {
    if (e.target.id === 'mkCap') { MK.capDirty = true; return; }   // texte retouché à la main : on n'y touche plus
    if (['buy', 'margin', 'sale'].includes(e.target.name)) linkPrices(e.target.name);
    if (['title', 'buy', 'margin', 'sale'].includes(e.target.name)) updateCaption();
    if (e.target.name === 'capStyle') { updateCaption(true); return; }
    const f = $('#mkForm');
    store.set(PREFS, { margin: num(f.margin.value) ?? 0, scale: Number(f.scale.value), mode: f.mode.value });
    drawPreview();
  });
  $('#mkForm').addEventListener('submit', (e) => e.preventDefault());
  $('#mkClose').onclick = () => dlg.close();
  dlg.addEventListener('close', () => { MK.item = null; });
  dlg.addEventListener('keydown', (e) => e.stopPropagation());   // les raccourcis de la page ne réagissent pas pendant la saisie
  $('#mkCapNew').onclick = () => { MK.capVariant++; updateCaption(true); };
  $('#mkCapCopy').onclick = async () => {
    const ok = await copyCaption();
    $('#mkCapCopy').textContent = ok ? '✔ Copiée' : 'Copie impossible';
    setTimeout(() => { $('#mkCapCopy').textContent = 'Copier'; }, 1800);
  };
  $('#mkGo').onclick = () => exportPngs(false);
  $('#mkShare').onclick = () => exportPngs(true);

  window.TTMMaker = { open, isOpen: () => dlg.open };
})();
