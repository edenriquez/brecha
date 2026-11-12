# brecha

Comunidad para descubrir rutas de hiking populares en la región y convocar salidas en grupo.

La infraestructura (Vercel, Supabase) vive en [edenriquez/infra](https://github.com/edenriquez/infra/tree/main/projects/brecha).

## Estructura

```
apps/web/     Next.js (App Router, Tailwind v4, MapLibre); Vercel lo despliega desde aquí
supabase/     config local, migraciones (rutas, salidas, inscritos, RLS, buckets)
.github/      ci.yml (lint + build) y supabase.yml (lint de migraciones en PR, db push en main)
```

## Desarrollo local

Requiere Node 22, pnpm 10, Docker y el CLI de Supabase.

```sh
pnpm install
pnpm db:start            # Supabase local en :54371 (studio en :54373)
supabase status -o env   # copia API_URL y ANON_KEY a apps/web/.env.local
pnpm dev                 # http://localhost:3000
```

`apps/web/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54371
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Los correos del enlace mágico llegan a Inbucket: http://127.0.0.1:54374.

## Migraciones

Crea una con `supabase migration new <nombre>` y pruébala con `pnpm db:reset`. Al hacer merge a `main`, `supabase.yml` la aplica al proyecto de producción.

## Rutas trazadas en AllTrails

En el [planificador de AllTrails](https://www.alltrails.com/explore/custom-routes/new) marca el inicio y el final; en DevTools › Network copia la respuesta que trae `routes` y `costings`. Luego:

```sh
pbpaste | pnpm rutas nueva cascada-de-la-burbuja   # crea supabase/rutas/<slug>.json y su vista previa .geojson
pnpm rutas revisar cascada-de-la-burbuja           # después de editar nombre, zona, descripción, tipo y etiquetas
pnpm rutas migrar cascada-de-la-burbuja            # escribe la migración (sin slugs: todas las de supabase/rutas)
```

Para una brecha usa `"activity": "offroad"` y llena `difficulty` y `duration_min` (manejando): las que se sugieren son a pie.

El trazo de AllTrails es solo la ida: con `"route_type": "ida_vuelta"` se completa con el regreso. La altitud sale del MDE de 5 m del Izta-Popo (bucket `capas` de `NEXT_PUBLIC_SUPABASE_URL`) o de Terrarium fuera de él. Si la ruta ya existe, la migración solo le cambia el trazo.
