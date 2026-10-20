import { createClient } from 'npm:@supabase/supabase-js@2';

// byGrain — links curtos com contagem de clicks (joaovianadop.com/g/?<nome> → aqui → destino).
// Conta o click (sem guardar nada da pessoa: só a hora e o site de onde veio) e reencaminha.
// Pré-visualizações automáticas (WhatsApp, Instagram, robôs) seguem o link mas não contam.
const BOTS = /bot|crawl|spider|preview|facebookexternalhit|meta-externalagent|slackbot|whatsapp|telegram|discord|twitter|linkedin|embedly|pinterest|skype|headless|curl|wget|python|go-http/i;
const HOME = 'https://joaovianadop.com/';

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const slug = (u.searchParams.get('s') || u.pathname.split('/').filter(Boolean).pop() || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug || slug === 'go') return Response.redirect(HOME, 302);
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false }, db: { schema: 'public' } });
    const { data: link } = await admin.from('mk_links').select('id, target').eq('slug', slug).maybeSingle();
    if (!link) return Response.redirect(HOME, 302);
    const ua = req.headers.get('user-agent') || '';
    if (!BOTS.test(ua) && req.method === 'GET') {
      let ref: string | null = u.searchParams.get('r') || null;
      if (!ref) { try { const r = req.headers.get('referer'); ref = r ? new URL(r).hostname : null; } catch { ref = null; } }
      await admin.from('mk_clicks').insert({ link_id: link.id, ref: ref ? ref.slice(0, 80) : null });
    }
    return new Response(null, { status: 302, headers: { Location: link.target, 'Cache-Control': 'no-store' } });
  } catch {
    return Response.redirect(HOME, 302);
  }
});
