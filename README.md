# FridgeOrder

Sistema personal de listas de supermercado (España): app Vue PWA + API Node/MongoDB + extensión Chrome.

## Arranque rápido

```bash
# 1) Variables
copy .env.example .env

# 2) Mongo (Docker) o usa tu Mongo local
docker compose up -d mongo

# 3) Dependencias y shared
npm install
npm run build:shared

# 4) API y web
npm run dev:api
npm run dev:web
```

- Web: http://localhost:5180  
- API: http://localhost:4200/api/health  

### Extensión Chrome

1. Abre `chrome://extensions`
2. Activa “Modo de desarrollador”
3. “Cargar descomprimida” → carpeta `apps/extension`
4. En el popup: login con tu usuario FridgeOrder y captura productos en Mercadona / BonÀrea / Lidl

Atajo: `Ctrl+Shift+Y` (Mac: `Cmd+Shift+Y`)

### IA (opcional)

Sin `OPENAI_API_KEY` el sistema usa heurísticas locales (precios medios, parseo de voz, menú básico).  
Con clave OpenAI-compatible mejora estimación de precios, extracción y plan de comidas.

## Stack

- `apps/web` — Vue 3 + Pinia + PWA
- `apps/api` — Express + MongoDB + JWT
- `apps/extension` — Chrome MV3
- `packages/shared` — categorías, Zod schemas, helpers

## Roadmap Meal Plan

Implementado en `/meals`: cuestionario, Tinder de platos, calendario flexible, recetas, preparaciones, batch cooking y enlace despensa/lista. Detalle en [`docs/future-meal-plan.md`](docs/future-meal-plan.md).
