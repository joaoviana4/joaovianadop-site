// Números públicos, lidos das próprias páginas (o que qualquer pessoa vê sem entrar numa conta):
// YouTube (subscritores; views, likes e comentários de cada vídeo), TikTok (seguidores; views, likes, comentários,
// partilhas e guardados) e Spotify (ouvintes mensais e seguidores do artista; reproduções de cada faixa).
// Não usa chaves nem contas. Se uma plataforma não deixar ler naquele momento, devolve null e fica para a próxima.
// O Instagram não deixa ler nada a partir de servidores sem sessão iniciada: fica com a ligação da Meta ou à mão.
type Row = Record<string, any>;
const BUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function page(url: string, headers: Row = {}, method = 'GET', body: string | undefined = undefined) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { method, body, redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': BUA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9', ...headers } });
    const text = await r.text();
    return { status: r.status, url: r.url, text };
  } catch {
    return { status: 0, url, text: '' };
  } finally { clearTimeout(t); }
}

const ent = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
export function metaTag(html: string, prop: string) {
  const p = prop.replace(/[.:]/g, (c) => '\\' + c);
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${p}["'][^>]*?content=["']([^"']*)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*?(?:property|name|itemprop)=["']${p}["']`, 'i'));
  return m ? ent(m[1]) : null;
}
// "1.23M", "12,345", "1.2K", "987" → número
export function compact(s: unknown): number | null {
  if (s == null) return null;
  if (typeof s === 'number') return Number.isFinite(s) ? Math.round(s) : null;
  const m = String(s).replace(/[\s\u00a0\u202f]/g, '').match(/(\d[\d.,]*)([KMB])?/i); if (!m) return null;
  const k = (m[2] || '').toUpperCase();
  if (!k) { const v = Number(m[1].replace(/\D/g, '')); return Number.isFinite(v) ? v : null; }
  const v = parseFloat(m[1].replace(/,/g, '.')); if (!Number.isFinite(v)) return null;
  return Math.round(v * ({ K: 1e3, M: 1e6, B: 1e9 } as Row)[k]);
}
const n = (v: unknown) => (v == null || v === '' ? null : compact(v));
const day = (v: unknown) => { if (!v) return null; const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v)); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); };
const clean = (o: Row) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''));

// ---------- YouTube ----------
const YT_COOKIE = { Cookie: 'SOCS=CAI; CONSENT=YES+cb' }; // sem isto, na Europa aparece a página das cookies
// o mesmo pedido que a página do YouTube faz para quem não tem sessão iniciada
const YT_CTX = { client: { clientName: 'WEB', clientVersion: '2.20241010.00.00', hl: 'en', gl: 'US' } };
async function yti(kind: string, body: Row) {
  return (await page(`https://www.youtube.com/youtubei/v1/${kind}?prettyPrint=false`, { 'Content-Type': 'application/json', Origin: 'https://www.youtube.com', Accept: '*/*', ...YT_COOKIE }, 'POST', JSON.stringify({ context: YT_CTX, ...body }))).text;
}
// os números do cabeçalho do canal: "46.5M subscribers" seguido de "1.6K videos" (a página também mostra outros
// canais, com os seus subscritores, por isso procura-se o par; ou "@nome • 46.5M subscribers")
function ytHead(h: string, handle = '') {
  const m = h.match(/([\d.,]+\s?[KMB]?) subscribers?"[\s\S]{0,600}?"content":"([\d.,]+\s?[KMB]?) videos?"/i);
  if (m) return { subs: m[1], vids: m[2] };
  const e = handle.replace(/^@/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const k = e ? h.match(new RegExp(`@${e}\\u2069?\\s*•\\s*\\u2068?([\\d.,]+\\s?[KMB]?) subscribers`, 'i')) : null;
  return k ? { subs: k[1], vids: null } : null;
}
export async function ytChannel(a: Row) {
  const hd = a.handle || '';
  const path = a.ext_id && /^UC/.test(a.ext_id) ? `channel/${a.ext_id}` : hd.startsWith('@') || hd.includes('/') ? hd : `@${hd}`;
  const { text: h } = await page(`https://www.youtube.com/${path}?hl=en`, YT_COOKIE);
  const id = h.match(/"externalId":"(UC[\w-]{22})"/)?.[1] || (a.ext_id && /^UC/.test(a.ext_id) ? a.ext_id : null);
  let r = ytHead(h, hd.startsWith('@') ? hd : '');
  // a página não respondeu como devia: o pedido interno do canal
  if (!r && id) r = ytHead(await yti('browse', { browseId: id }), hd.startsWith('@') ? hd : '');
  if (!r) return null;
  return clean({ followers: n(r.subs), extra: r.vids != null ? { videos: n(r.vids) } : null, ext_id: id, title: metaTag(h, 'og:title'), thumb: metaTag(h, 'og:image') });
}
export async function ytVideo(id: string) {
  const h = await yti('next', { videoId: id });
  let views = h.match(/"viewCount":\{"simpleText":"([\d.,]+) views?"/)?.[1] ?? h.match(/"viewCount":\{"runs":\[\{"text":"([\d.,]+)"/)?.[1] ?? null;
  if (views == null) { const pl = await yti('player', { videoId: id }); views = pl.match(/"viewCount":"(\d+)"/)?.[1] ?? null; }
  if (views == null) return null;
  const likes = h.match(/like this video along with ([\d.,]+) other/i)?.[1] ?? h.match(/"content":"([\d.,]+\s?[KMB]?) likes?"/i)?.[1];
  const comments = h.match(/"title":\{"runs":\[\{"text":"Comments"\}\]\},"contextualInfo":\{"runs":\[\{"text":"([\d.,]+\s?[KMB]?)"/)?.[1] ?? h.match(/"contextualInfo":\{"runs":\[\{"text":"([\d.,]+\s?[KMB]?)"/)?.[1];
  const date = h.match(/"dateText":\{"simpleText":"[^"]*?([A-Z][a-z]{2} \d{1,2}, \d{4})"/)?.[1];
  return clean({ views: n(views), likes: n(likes), comments: n(comments), thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, published_on: day(date) });
}

// ---------- TikTok ----------
function ttData(h: string) {
  const m = h.match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null; try { return JSON.parse(m[1])?.__DEFAULT_SCOPE__ || null; } catch { return null; }
}
export async function ttProfile(handle: string) {
  const { text: h } = await page(`https://www.tiktok.com/${handle.startsWith('@') ? handle : '@' + handle}?lang=en`);
  const ui = ttData(h)?.['webapp.user-detail']?.userInfo; if (!ui?.user) return null;
  const s = { ...(ui.stats || {}), ...(ui.statsV2 || {}) };
  return clean({ followers: n(s.followerCount), extra: { likes: n(s.heartCount ?? s.heart), videos: n(s.videoCount) }, title: ui.user.nickname || null, thumb: ui.user.avatarMedium || ui.user.avatarThumb || null });
}
export async function ttVideo(url: string) {
  const { text: h } = await page(url);
  const it = ttData(h)?.['webapp.video-detail']?.itemInfo?.itemStruct; if (!it) return null;
  const s = { ...(it.stats || {}), ...(it.statsV2 || {}) };
  return clean({ views: n(s.playCount), likes: n(s.diggCount), comments: n(s.commentCount), shares: n(s.shareCount), saves: n(s.collectCount), thumb: it.video?.cover || it.video?.originCover || null, title: (it.desc || '').slice(0, 120) || null, published_on: day(+it.createTime || null), author: it.author?.uniqueId ? '@' + it.author.uniqueId : null });
}

// ---------- Spotify ----------
export async function spArtist(id: string) {
  const { text: h } = await page(`https://open.spotify.com/artist/${encodeURIComponent(id)}`);
  if (!h) return null;
  const d = metaTag(h, 'og:description') || metaTag(h, 'description') || '';
  let listeners: number | null = n(d.match(/([\d.,]+\s?[KMB]?)\s+monthly listeners/i)?.[1]);
  let followers: number | null = null;
  // a página também traz os dados do artista (em base64): seguidores e ouvintes exatos
  const st = h.match(/<script[^>]+id="initial-?[sS]tate"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (st) {
    try {
      const raw = new TextDecoder().decode(Uint8Array.from(atob(st.trim()), (c) => c.charCodeAt(0)));
      // as estatísticas do próprio artista ({"followers":…,"monthlyListeners":…}); a página traz também outros artistas
      const m = raw.match(/"followers":(\d+),"monthlyListeners":(\d+)/);
      if (m) { followers = n(m[1]); listeners = n(m[2]); } else listeners = n(raw.match(/"monthlyListeners":(\d+)/)?.[1]) ?? listeners;
    } catch { /* fica o resumo */ }
  }
  if (listeners == null && followers == null) return null;
  return clean({ followers, views: listeners, title: metaTag(h, 'og:title'), thumb: metaTag(h, 'og:image') });
}
export async function spTrack(id: string) {
  const { text: h } = await page(`https://open.spotify.com/track/${encodeURIComponent(id)}`);
  const st = h.match(/<script[^>]+id="initial-?[sS]tate"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  let plays: number | null = null;
  if (st) { try { const raw = new TextDecoder().decode(Uint8Array.from(atob(st.trim()), (c) => c.charCodeAt(0))); plays = n((raw.match(new RegExp(`"id":"${id}"[\\s\\S]{0,600}?"playcount":"?(\\d+)`)) || raw.match(/"playcount":"?(\d+)/))?.[1]); } catch { /* sem números */ } }
  if (plays == null) return null;
  return clean({ views: plays, title: metaTag(h, 'og:title'), thumb: metaTag(h, 'og:image'), published_on: day(metaTag(h, 'music:release_date')) });
}

export const PUBLIC = new Set(['youtube', 'tiktok', 'spotify']);
