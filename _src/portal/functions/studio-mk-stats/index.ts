import { createClient } from 'npm:@supabase/supabase-js@2';

// PØRTAL Studio — estatísticas do marketing.
// · meta    {url}               → plataforma, id, título, imagem e autor de um link (YouTube, TikTok, Instagram, Spotify)
// · refresh {project_ids, force} → lê já os números automáticos destes projetos (quem tem acesso a eles)
// · cron                        → todos os dias, pelo relógio da base de dados (cabeçalho x-cron-key)
// · status                      → que ligações estão feitas (YouTube / Instagram)
// · config  {youtube_key, ig_user_id, ig_token} → guarda as chaves (só administradores de uma comunidade)
// Números automáticos: YouTube (chave da Google, dados públicos) e Instagram (Business Discovery, com a conta
// profissional da equipa). TikTok e Spotify não dão números públicos sem o artista autorizar: metem-se à mão.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const UA = 'Mozilla/5.0 (compatible; PortalStudio/1.0; +https://joaovianadop.com)';
const IG_API = 'https://graph.facebook.com/v24.0';

type Row = Record<string, any>;

// ---------- reconhecer links ----------
export function parseUrl(raw: string) {
  let u: URL; try { u = new URL(raw.trim()); } catch { return null; }
  const h = u.hostname.replace(/^www\.|^m\./, '');
  if (h === 'youtu.be') return { platform: 'youtube', kind: 'post', ext_id: u.pathname.slice(1).split('/')[0] };
  if (h.endsWith('youtube.com')) {
    const v = u.searchParams.get('v'); if (v) return { platform: 'youtube', kind: 'post', ext_id: v };
    const m = u.pathname.match(/^\/(shorts|live|embed)\/([\w-]{6,})/); if (m) return { platform: 'youtube', kind: 'post', ext_id: m[2] };
    const c = u.pathname.match(/^\/channel\/(UC[\w-]+)/); if (c) return { platform: 'youtube', kind: 'account', ext_id: c[1], handle: c[1] };
    const at = u.pathname.match(/^\/(@[\w.-]+)/); if (at) return { platform: 'youtube', kind: 'account', handle: at[1] };
    return { platform: 'youtube', kind: 'account', handle: u.pathname.split('/').filter(Boolean).pop() || '' };
  }
  if (h.endsWith('tiktok.com')) {
    const m = u.pathname.match(/\/(@[\w.-]+)\/(?:video|photo)\/(\d+)/); if (m) return { platform: 'tiktok', kind: 'post', ext_id: m[2], handle: m[1] };
    if (/^(vm|vt)\./.test(u.hostname) || u.pathname.startsWith('/t/')) return { platform: 'tiktok', kind: 'short' };
    const a = u.pathname.match(/^\/(@[\w.-]+)/); if (a) return { platform: 'tiktok', kind: 'account', handle: a[1] };
  }
  if (h.endsWith('instagram.com')) {
    const m = u.pathname.match(/^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/); if (m) return { platform: 'instagram', kind: 'post', ext_id: m[2] };
    const a = u.pathname.split('/').filter(Boolean)[0]; if (a) return { platform: 'instagram', kind: 'account', handle: '@' + a };
  }
  if (h.endsWith('spotify.com')) {
    const m = u.pathname.match(/\/(track|album|artist|playlist|episode)\/(\w+)/);
    if (m) return { platform: 'spotify', kind: m[1] === 'artist' ? 'account' : 'post', ext_id: m[2], handle: m[1] === 'artist' ? m[2] : undefined };
  }
  if (h.endsWith('facebook.com') || h === 'fb.watch') return { platform: 'facebook', kind: 'post' };
  if (h === 'x.com' || h.endsWith('twitter.com')) return { platform: 'x', kind: 'post' };
  return { platform: 'outro', kind: 'post' };
}

async function getJson(url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) } });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* não é json */ }
  return { ok: r.ok, status: r.status, j };
}

async function meta(raw: string) {
  let url = raw.trim();
  let p = parseUrl(url);
  if (!p) throw new Error('Isso não parece um link.');
  // links curtos do TikTok (vm.tiktok.com/…): segue o redirecionamento para saber o vídeo
  if (p.kind === 'short') {
    try { const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA } }); url = r.url || url; await r.body?.cancel(); } catch { /* fica o link curto */ }
    p = parseUrl(url) || { platform: 'tiktok', kind: 'post' };
  }
  const out: Row = { ...p, url, title: null, thumb: null, author: null, published_on: null };
  const oembed = { youtube: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, tiktok: `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, spotify: `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}` } as Row;
  if (out.kind === 'post' && oembed[out.platform]) {
    try { const { ok, j } = await getJson(oembed[out.platform]); if (ok && j) { out.title = j.title || null; out.thumb = j.thumbnail_url || null; out.author = j.author_name || null; } } catch { /* sem dados */ }
    if (out.platform === 'tiktok' && !out.handle && out.author) out.handle = out.author;
  }
  return out;
}

// ---------- números automáticos ----------
async function config(admin: any) {
  const { data } = await admin.from('mk_config').select('key, value');
  return Object.fromEntries((data || []).map((r: Row) => [r.key, r.value]));
}

async function youtube(admin: any, key: string, posts: Row[], accounts: Row[]) {
  const rows: Row[] = []; let n = 0;
  const vids = posts.filter((x) => x.platform === 'youtube' && x.ext_id);
  for (let i = 0; i < vids.length; i += 50) {
    const part = vids.slice(i, i + 50);
    const { ok, j } = await getJson(`https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${part.map((x) => x.ext_id).join(',')}&key=${key}`);
    if (!ok) throw new Error(j?.error?.message || 'O YouTube recusou o pedido.');
    for (const it of j.items || []) {
      const post = part.find((x) => x.ext_id === it.id); if (!post) continue;
      const s = it.statistics || {};
      rows.push({ project_id: post.project_id, post_id: post.id, views: num(s.viewCount), likes: num(s.likeCount), comments: num(s.commentCount), source: 'auto' });
      const patch: Row = {};
      if (!post.title && it.snippet?.title) patch.title = it.snippet.title;
      if (!post.thumb && it.snippet?.thumbnails) patch.thumb = (it.snippet.thumbnails.medium || it.snippet.thumbnails.default)?.url;
      if (!post.published_on && it.snippet?.publishedAt) patch.published_on = it.snippet.publishedAt.slice(0, 10);
      if (Object.keys(patch).length) await admin.from('mk_posts').update(patch).eq('id', post.id);
      n++;
    }
  }
  for (const a of accounts.filter((x) => x.platform === 'youtube')) {
    const q = a.ext_id ? `id=${a.ext_id}` : `forHandle=${encodeURIComponent(a.handle.startsWith('@') ? a.handle : '@' + a.handle)}`;
    const { ok, j } = await getJson(`https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&${q}&key=${key}`);
    if (!ok) throw new Error(j?.error?.message || 'O YouTube recusou o pedido.');
    const c = j.items?.[0]; if (!c) continue;
    const s = c.statistics || {};
    rows.push({ project_id: a.project_id, account_id: a.id, followers: s.hiddenSubscriberCount ? null : num(s.subscriberCount), views: num(s.viewCount), extra: { videos: num(s.videoCount) }, source: 'auto' });
    const patch: Row = {};
    if (!a.ext_id) patch.ext_id = c.id;
    if (!a.title && c.snippet?.title) patch.title = c.snippet.title;
    if (!a.thumb && c.snippet?.thumbnails) patch.thumb = (c.snippet.thumbnails.default || c.snippet.thumbnails.medium)?.url;
    if (Object.keys(patch).length) await admin.from('mk_accounts').update(patch).eq('id', a.id);
    n++;
  }
  return { rows, n };
}

async function instagram(admin: any, cfg: Row, posts: Row[], accounts: Row[]) {
  const rows: Row[] = []; let n = 0;
  const igPosts = posts.filter((x) => x.platform === 'instagram' && x.ext_id);
  const handles = new Set([...accounts.filter((x) => x.platform === 'instagram').map((x) => x.handle.replace(/^@/, '')), ...igPosts.map((x) => (x.author || '').replace(/^@/, '')).filter(Boolean)]);
  for (const h of handles) {
    const fields = `business_discovery.username(${h}){followers_count,media_count,media.limit(60){permalink,like_count,comments_count,view_count,timestamp,thumbnail_url,media_url,caption}}`;
    const { ok, j } = await getJson(`${IG_API}/${cfg.ig_user_id}?fields=${encodeURIComponent(fields)}&access_token=${cfg.ig_token}`);
    if (!ok) continue; // conta pessoal, nome errado ou chave caducada: fica para a próxima
    const bd = j.business_discovery || {};
    for (const a of accounts.filter((x) => x.platform === 'instagram' && x.handle.replace(/^@/, '') === h)) { rows.push({ project_id: a.project_id, account_id: a.id, followers: num(bd.followers_count), extra: { posts: num(bd.media_count) }, source: 'auto' }); n++; }
    for (const m of bd.media?.data || []) {
      const code = (m.permalink || '').match(/\/(?:p|reel|tv)\/([\w-]+)/)?.[1]; if (!code) continue;
      for (const post of igPosts.filter((x) => x.ext_id === code)) {
        rows.push({ project_id: post.project_id, post_id: post.id, views: num(m.view_count), likes: num(m.like_count), comments: num(m.comments_count), source: 'auto' });
        const patch: Row = {};
        if (!post.thumb && (m.thumbnail_url || m.media_url)) patch.thumb = m.thumbnail_url || m.media_url;
        if (!post.title && m.caption) patch.title = String(m.caption).slice(0, 120);
        if (!post.published_on && m.timestamp) patch.published_on = String(m.timestamp).slice(0, 10);
        if (Object.keys(patch).length) await admin.from('mk_posts').update(patch).eq('id', post.id);
        n++;
      }
    }
  }
  return { rows, n };
}
const num = (v: unknown) => (v == null || v === '' ? null : Number(v));

async function refresh(admin: any, projectIds: string[] | null, force = false) {
  const cfg = await config(admin);
  const pq = admin.from('mk_posts').select('*'); const aq = admin.from('mk_accounts').select('*');
  const [{ data: posts0 }, { data: accounts0 }] = await Promise.all(projectIds ? [pq.in('project_id', projectIds), aq.in('project_id', projectIds)] : [pq, aq]);
  let posts = posts0 || [], accounts = accounts0 || [];
  // não repetir leituras automáticas com menos de 3 horas (poupa a quota do YouTube)
  if (!force) {
    const since = new Date(Date.now() - 3 * 3600e3).toISOString();
    const { data: recent } = await admin.from('mk_stats').select('post_id, account_id').eq('source', 'auto').gte('taken_at', since);
    const done = new Set((recent || []).map((r: Row) => r.post_id || r.account_id));
    posts = posts.filter((x: Row) => !done.has(x.id)); accounts = accounts.filter((x: Row) => !done.has(x.id));
  }
  const out = { youtube: !!cfg.youtube_key, instagram: !!(cfg.ig_user_id && cfg.ig_token), updated: 0, errors: [] as string[] };
  const rows: Row[] = [];
  if (cfg.youtube_key) { try { const r = await youtube(admin, cfg.youtube_key, posts, accounts); rows.push(...r.rows); out.updated += r.n; } catch (e) { out.errors.push('YouTube: ' + (e as Error).message); } }
  if (out.instagram) { try { const r = await instagram(admin, cfg, posts, accounts); rows.push(...r.rows); out.updated += r.n; } catch (e) { out.errors.push('Instagram: ' + (e as Error).message); } }
  if (rows.length) { const { error } = await admin.from('mk_stats').insert(rows); if (error) out.errors.push(error.message); }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false }, db: { schema: 'studio' } });
    const body = await req.json().catch(() => ({}));

    // relógio diário (pg_cron): só com a chave guardada na base de dados
    if (body.action === 'cron') {
      const cfg = await config(admin);
      if (!cfg.cron_key || req.headers.get('x-cron-key') !== cfg.cron_key) return json({ error: 'Sem autorização.' }, 401);
      return json(await refresh(admin, null, true));
    }

    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who } = await admin.auth.getUser(token);
    if (!who?.user) return json({ error: 'Sessão inválida.' }, 401);
    // o cliente com a sessão da pessoa: só vê os projetos a que tem acesso
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } }, db: { schema: 'studio' } });

    if (body.action === 'meta') return json(await meta(String(body.url || '')));

    if (body.action === 'status') { const cfg = await config(admin); return json({ youtube: !!cfg.youtube_key, instagram: !!(cfg.ig_user_id && cfg.ig_token) }); }

    if (body.action === 'refresh') {
      const ids = (Array.isArray(body.project_ids) ? body.project_ids : []).filter((x: unknown) => typeof x === 'string').slice(0, 50);
      if (!ids.length) return json({ error: 'Faltam os projetos.' }, 400);
      const { data: ok } = await asUser.from('projects').select('id').in('id', ids);
      const allowed = (ok || []).map((r: Row) => r.id);
      if (!allowed.length) return json({ error: 'Sem acesso a estes projetos.' }, 403);
      return json(await refresh(admin, allowed, !!body.force));
    }

    if (body.action === 'config') {
      const { data: me } = await admin.from('community_members').select('role').eq('user_id', who.user.id).eq('role', 'admin').limit(1);
      const { data: prof } = await admin.from('profiles').select('role').eq('id', who.user.id).maybeSingle();
      if (!me?.length && prof?.role !== 'admin') return json({ error: 'Só administradores podem ligar contas.' }, 403);
      const set: Row[] = [];
      if (typeof body.youtube_key === 'string') {
        const k = body.youtube_key.trim();
        if (k) {
          const { ok, j } = await getJson(`https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key=${encodeURIComponent(k)}`);
          if (!ok) return json({ error: 'A Google não aceitou esta chave: ' + (j?.error?.message || 'verifica se ativaste a "YouTube Data API v3".') }, 400);
        }
        set.push({ key: 'youtube_key', value: k || null });
      }
      if (typeof body.ig_user_id === 'string') set.push({ key: 'ig_user_id', value: body.ig_user_id.trim() || null });
      if (typeof body.ig_token === 'string') set.push({ key: 'ig_token', value: body.ig_token.trim() || null });
      for (const r of set) await admin.from('mk_config').upsert({ ...r, updated_at: new Date().toISOString() });
      const cfg = await config(admin);
      return json({ ok: true, youtube: !!cfg.youtube_key, instagram: !!(cfg.ig_user_id && cfg.ig_token) });
    }

    return json({ error: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
