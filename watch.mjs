// Surveille puhlmann.tv (pre-owned / electronic accessories) et notifie via Telegram
// chaque nouvelle annonce : titre, description, prix, photos.
// Usage : node watch.mjs [--dry]   (--dry : affiche au lieu d'envoyer, ne modifie pas seen.json)
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';

// Charge .env (RESEND_API_KEY=..., MAIL_TO=...) s'il existe
try { process.loadEnvFile(new URL('./.env', import.meta.url)); } catch {}

const URL_PAGE = process.env.PAGE_URL || 'https://www.puhlmann.tv/pre-owned/electronic-accessories/';
const SEEN_FILE = new URL('./seen.json', import.meta.url);
const { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: CHAT } = process.env;
const { RESEND_API_KEY: MAIL_KEY, MAIL_TO } = process.env;
const { TWILIO_ACCOUNT_SID: TW_SID, TWILIO_AUTH_TOKEN: TW_TOKEN, WHATSAPP_TO: WA_TO,
  WHATSAPP_FROM: WA_FROM = 'whatsapp:+14155238886' } = process.env; // numéro sandbox Twilio par défaut
const NTFY_TOPIC = process.env.NTFY_TOPIC;
const DRY = process.argv.includes('--dry');

const decode = (s) => s
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const text = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/[ \t\r\n]+/g, ' ').trim();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function parse(html) {
  const parts = html.split(/(?=<div id="cc-m-\d+" class="j-module n j-(?:text|gallery) )/);
  const items = [];
  let cur = null;
  for (const part of parts) {
    if (part.startsWith('<div id="cc-m-') && /class="j-module n j-text /.test(part.slice(0, 80))) {
      const h2 = part.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
      if (!h2) { cur = null; continue; }
      const body = part.slice(part.indexOf('</h2>') + 5);
      const h3 = body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
      const paras = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1])).filter(Boolean);
      const ref = paras.find((p) => /^PC\.\d+\.\d+$/.test(p));
      cur = {
        id: ref || text(h2[1]),
        ref: ref || null,
        title: text(h2[1]),
        lines: paras.filter((p) => p !== ref),
        price: h3 ? text(h3[1].replace(/<s>([\s\S]*?)<\/s>/g, '(avant $1)'))
          .replace(/^Euro\s*/, '').replace(/\(?zzgl\. MwSt\.?\s*\/\s*ex VAT\)?/, 'HT').replace(/(\d)\s*(?=\(avant)/, '$1 ') : null,
        photos: [],
      };
      items.push(cur);
    } else if (cur && /class="j-module n j-gallery /.test(part.slice(0, 80))) {
      for (const m of part.matchAll(/data-href="(https:\/\/image\.jimcdn\.com[^"]+)"/g)) {
        // version redimensionnée (Telegram refuse les très grosses images)
        const u = m[1].replace(/transf\/[^/]*\/path/, 'transf/dimension=1280x1280:format=jpg/path');
        if (!cur.photos.includes(u)) cur.photos.push(u);
      }
      cur = null;
    }
  }
  return items;
}

const caption = (it) => [
  `<b>🆕 ${esc(it.title)}</b>`,
  it.price ? `💶 <b>${esc(it.price)}</b>` : null,
  it.ref ? `Réf. ${esc(it.ref)}` : null,
  it.lines.length ? '\n' + it.lines.map((l) => '• ' + esc(l)).join('\n') : null,
  `\n<a href="${URL_PAGE}">Voir la page</a>`,
].filter(Boolean).join('\n').slice(0, 1020);

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: CHAT, ...body }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description}`);
}

async function mail(it) {
  const html = `<div style="font:15px system-ui;max-width:640px"><h2>🆕 ${esc(it.title)}</h2>
<p style="font-size:18px"><b>💶 ${esc(it.price || 'prix non indiqué')}</b>${it.ref ? ' · Réf. ' + esc(it.ref) : ''}</p>
<ul>${it.lines.map((l) => '<li>' + esc(l) + '</li>').join('')}</ul>
${it.photos.map((p) => `<img src="${p}" style="width:100%;margin:4px 0;border-radius:6px">`).join('')}
<p><a href="${URL_PAGE}">Voir la page</a></p></div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: 'Bearer ' + MAIL_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ from: 'Puhlmann Watcher <onboarding@resend.dev>', to: MAIL_TO.split(','), subject: `🆕 ${it.title} – ${it.price || ''}`, html }),
  });
  if (!r.ok) throw new Error('Resend: ' + await r.text());
}

async function twilio(it) {
  const send = async (Body, media) => {
    const form = new URLSearchParams({ From: WA_FROM, To: 'whatsapp:' + WA_TO.replace(/^whatsapp:/, ''), Body });
    if (media) form.set('MediaUrl', media);
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, {
      method: 'POST', body: form,
      headers: { authorization: 'Basic ' + Buffer.from(`${TW_SID}:${TW_TOKEN}`).toString('base64') },
    });
    if (!r.ok) throw new Error('Twilio: ' + await r.text());
  };
  const body = [`🆕 *${it.title}*`, it.price && `💶 *${it.price}*`, it.ref && `Réf. ${it.ref}`,
    it.lines.length && '\n' + it.lines.map((l) => '• ' + l).join('\n'), '\n' + URL_PAGE].filter(Boolean).join('\n').slice(0, 1500);
  const [first, ...rest] = it.photos;
  await send(body, first);
  for (const p of rest.slice(0, 3)) { await new Promise((r) => setTimeout(r, 1000)); await send('', p); }
}

// Notification push (app ntfy sur iPhone/Android) : titre, prix, 1ʳᵉ photo, clic = ouvrir la page
async function ntfy(it) {
  const r = await fetch('https://ntfy.sh/', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      topic: NTFY_TOPIC, title: '🆕 ' + it.title, priority: 4, tags: ['new'],
      message: [it.price, it.ref, ...it.lines.slice(0, 12)].filter(Boolean).join('\n'),
      click: URL_PAGE, ...(it.photos[0] ? { attach: it.photos[0] } : {}),
    }),
  });
  if (!r.ok) console.warn('ntfy:', r.status, await r.text());
}

// Notification macOS (aucun compte requis, sans photos)
function mac(it) {
  if (process.platform !== 'darwin') return;
  const q = (x) => x.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  execFile('osascript', ['-e', `display notification "${q([it.price, it.ref].filter(Boolean).join(' · '))}" with title "🆕 ${q(it.title)}" sound name "Glass"`], () => {});
}

async function notify(it) {
  if (DRY) { console.log(caption(it).replace(/<[^>]+>/g, ''), '\n', it.photos.length, 'photo(s)\n'); return; }
  mac(it);
  if (NTFY_TOPIC) await ntfy(it);
  if (TW_SID && TW_TOKEN && WA_TO) return twilio(it);
  if (MAIL_KEY && MAIL_TO) return mail(it);
  if (!TOKEN || !CHAT) return; // pas d'autre canal configuré : notification macOS seule
  const photos = it.photos.slice(0, 10);
  if (!photos.length) return tg('sendMessage', { text: caption(it), parse_mode: 'HTML' });
  try {
    await tg('sendMediaGroup', {
      media: photos.map((p, i) => ({ type: 'photo', media: p, ...(i === 0 ? { caption: caption(it), parse_mode: 'HTML' } : {}) })),
    });
  } catch (e) {
    console.warn(e.message, '→ repli sans photos');
    await tg('sendMessage', { text: caption(it) + '\n\n' + photos.join('\n'), parse_mode: 'HTML' });
  }
}

async function main() {
    const res = await fetch(URL_PAGE, { headers: { 'user-agent': 'Mozilla/5.0 (puhlmann-watcher)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = parse(await res.text());
  if (items.length < 5) throw new Error(`Seulement ${items.length} annonces trouvées : la page a sûrement changé`);

  let seen = null;
  try { seen = new Set(JSON.parse(await readFile(SEEN_FILE, 'utf8'))); } catch {}
  const fresh = seen ? items.filter((i) => !seen.has(i.id)) : [];
  console.log(`${items.length} annonces, ${seen ? fresh.length + ' nouvelle(s)' : 'première exécution (initialisation)'}`);

  for (const it of fresh.reverse()) { await notify(it); if (!DRY) await new Promise((r) => setTimeout(r, 1500)); }
  if (!DRY) await writeFile(SEEN_FILE, JSON.stringify([...new Set([...(seen || []), ...items.map((i) => i.id)])], null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
