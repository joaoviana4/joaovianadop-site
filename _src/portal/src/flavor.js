// O mesmo código serve duas apps:
//   npx vite build                 → byGrain Studio (joaovianadop.com/bygrain), Supabase "byGrain"
//   npx vite build --mode studio   → PØRTAL Studio (joaovianadop.com/studio), Supabase BlackCat, esquema "studio"
// As diferenças ficam todas aqui (e no tema studio-theme.css). Muda-se no byGrain; o Studio segue ao reconstruir.
export const IS_STUDIO = import.meta.env.MODE === 'studio';

export const FLAVOR = IS_STUDIO
  ? {
      url: 'https://cwdjpcebyhwcdwwwazev.supabase.co',
      anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3ZGpwY2VieWh3Y2R3d3dhemV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyOTY2OTAsImV4cCI6MjEwNjg3MjY5MH0.DFbKb-gldkWnOwSsZZGosMBHMkws7WJEcj_bZLEA7iY',
      schema: 'studio',
      bucket: 'studio-files',
      storageKey: 'portal-studio-auth',
      base: '/studio/',
      pwPrefix: '', // contas BlackCat reais: a palavra-passe vai tal e qual (é a do Viewfinder)
      minPw: 6,
      fn: (n) => `studio-${n}`,
      vapid: 'BJASUftc0VUBChXaah39_dpqpSZfMWKvJcUbQYRK0u7qOv1WCfqYBar5owRtZpIYKnPKFzHHn1VOOMeD-kfm_u4',
      brand: 'PØRTAL',
      app: 'PØRTAL Studio',
      team: 'equipa',
    }
  : {
      url: 'https://ppovjdyrhdfedjcdnnol.supabase.co',
      anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwb3ZqZHlyaGRmZWRqY2Rubm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5OTI5MzAsImV4cCI6MjEwNzU2ODkzMH0.kPXLy8d8J0RoiRrXbihP17BU264RWbnsJ1Mokvkcf_8',
      schema: 'public',
      bucket: 'files',
      storageKey: 'bygrain-auth',
      base: '/bygrain/',
      pwPrefix: 'bygrain:',
      minPw: 4,
      fn: (n) => n,
      vapid: null, // fica o de lib.js
      brand: 'byGrain',
      app: 'byGrain Studio',
      team: 'Grain',
    };
