import { guessCategory, normalizeWeekday, type Category } from '@fridgeorder/shared';
import { config } from '../config.js';

async function chatJson(
  system: string,
  user: string,
  opts?: { temperature?: number }
): Promise<unknown | null> {
  if (!config.openaiApiKey) return null;
  try {
    const res = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.openaiModel,
        temperature: opts?.temperature ?? 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) {
      console.warn('AI error', await res.text());
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch (err) {
    console.warn('AI request failed', err);
    return null;
  }
}

async function chatVisionJson(
  system: string,
  prompt: string,
  imageDataUrl: string | string[],
  opts?: { temperature?: number; maxTokens?: number }
): Promise<unknown | null> {
  if (!config.openaiApiKey) {
    console.warn('[chatVisionJson] OPENAI_API_KEY vacía');
    return null;
  }
  const urls = (Array.isArray(imageDataUrl) ? imageDataUrl : [imageDataUrl]).filter(Boolean);
  try {
    const res = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.openaiModel,
        temperature: opts?.temperature ?? 0,
        max_tokens: opts?.maxTokens ?? 200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...urls.map((url) => ({
                type: 'image_url' as const,
                image_url: { url, detail: 'auto' as const },
              })),
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.warn('[chatVisionJson] HTTP', res.status, errText.slice(0, 500));
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.warn('[chatVisionJson] respuesta sin content');
      return null;
    }
    try {
      return JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      console.warn('[chatVisionJson] JSON inválido', content.slice(0, 200));
      return null;
    }
  } catch (err) {
    console.warn('[chatVisionJson] request failed', err);
    return null;
  }
}

function normalizeSpeechText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stopwords / fillers that must not become product queries. */
const SPOKEN_REJECT_RE =
  /^(eso|esto|aquel|aquello|nada|todo|algo|no|si|ya|ok|vale|bueno|pues|eh|este|mira|oye|hola|gracias|pero|aunque)?(\s+(no|me|te|le|nos|les|gusta|gustan|quiero|quieres|falta|necesito|comprar|compra|lista|producto|productos|supermercado|pero|aunque))*$/i;

const SPOKEN_OPINION_PATTERN =
  String.raw`\b(?:no\s+me\s+gustan?|me\s+disgusta|odio\s+eso|mejor\s+no|quita\s+eso|borra\s+eso|no\s+quiero\s+(?:eso|esto)|eso\s+no\s+me\s+gusta|esto\s+no\s+me\s+gusta|eso\s+no|esto\s+no)\b`;

function stripSpokenNoise(chunk: string): string {
  return chunk
    .replace(new RegExp(SPOKEN_OPINION_PATTERN, 'gi'), ' ')
    .replace(/\b(por\s+favor|gracias|vale|bueno|pues|eh|este|mira|oye)\b/gi, ' ')
    .replace(/\b(necesito|falta|quiero|compra|comprar|añade|añadir|lista)\b/gi, ' ')
    .replace(/\b(pero|aunque|porque|entonces)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRejectableSpokenChunk(chunk: string): boolean {
  const stripped = stripSpokenNoise(chunk);
  const n = normalizeSpeechText(stripped);
  if (n.length < 2) return true;
  if (SPOKEN_REJECT_RE.test(n)) return true;
  return false;
}

/** Only keep items whose meaningful words appear in the original transcript (no invention).
 * Allows typos leves (zanahora→zanahoria) so la IA pueda corregir sin inventar productos nuevos. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + cost);
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

function wordGroundedInTranscript(word: string, transcriptNorm: string): boolean {
  if (transcriptNorm.includes(word)) return true;
  const tokens = transcriptNorm.split(' ').filter((t) => t.length > 2);
  const maxDist = word.length <= 4 ? 1 : word.length <= 7 ? 2 : 3;
  return tokens.some((t) => Math.abs(t.length - word.length) <= maxDist && editDistance(t, word) <= maxDist);
}

function groundedInTranscript(item: string, transcript: string): boolean {
  const t = normalizeSpeechText(transcript);
  const words = normalizeSpeechText(item)
    .split(' ')
    .filter((w) => w.length > 2)
    .filter(
      (w) =>
        !/^(los|las|una|unos|unas|del|con|para|por|que|como|mas|muy|bien|mal)$/i.test(w)
    );
  if (!words.length) {
    const short = normalizeSpeechText(item);
    return short.length >= 2 && wordGroundedInTranscript(short, t);
  }
  return words.every((w) => wordGroundedInTranscript(w, t));
}

const PRODUCT_GLUE_RE = /^(de|del|con|en|al|la|el|los|las|un|una)$/i;
const PRODUCT_MODIFIER_RE =
  /^(natural|entera?|desnatad[oa]|semidesnatad[oa]|integral|fresca?|congelad[oa]|virgen|extra|light|zero|eco|bio|organica?|sin|con)$/i;

/** "tomate zanahora lechuga" → 3 ítems; "yogur natural" / "aceite de oliva" se mantienen. */
function expandSpaceSeparatedProducts(parts: string[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    const tokens = part.split(/\s+/).filter(Boolean);
    if (tokens.length <= 1 || tokens.some((tok) => PRODUCT_GLUE_RE.test(tok))) {
      out.push(part);
      continue;
    }
    const grouped: string[] = [];
    let buf = tokens[0]!;
    for (let i = 1; i < tokens.length; i++) {
      const tok = tokens[i]!;
      if (PRODUCT_MODIFIER_RE.test(tok)) {
        buf += ` ${tok}`;
      } else {
        grouped.push(buf);
        buf = tok;
      }
    }
    grouped.push(buf);
    out.push(...grouped);
  }
  return out;
}

function sanitizeSpokenItems(items: string[], transcript: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const item = stripSpokenNoise(String(raw)).replace(/\s+/g, ' ');
    if (!item || isRejectableSpokenChunk(item)) continue;
    if (!groundedInTranscript(item, transcript)) continue;
    const key = normalizeSpeechText(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function heuristicSpokenItems(transcript: string): string[] {
  const cleaned = stripSpokenNoise(transcript);
  if (!cleaned || isRejectableSpokenChunk(cleaned)) return [];
  const parts = cleaned
    .split(/\s*(?:,|;|\.| y | también | luego | después | más | e )\s*/i)
    .map((p) => stripSpokenNoise(p.replace(/^\d+[\).\-\s]+/, '')).trim())
    .filter((p) => p.length > 1 && !isRejectableSpokenChunk(p));
  const expanded = expandSpaceSeparatedProducts(parts.length ? parts : [cleaned]);
  return sanitizeSpokenItems(expanded, transcript);
}

const FALLBACK_AVG: Record<Category, number> = {
  carne: 6.5,
  lacteos: 1.8,
  frutas: 2.2,
  verduras: 1.6,
  panaderia: 1.2,
  bebidas: 1.5,
  limpieza: 3.5,
  higiene: 2.8,
  congelados: 3.2,
  despensa: 2.0,
  otros: 2.5,
};

export async function estimatePrices(
  items: { name: string; category: Category; preferredStore?: string }[]
): Promise<{ name: string; estimatedPrice: number }[]> {
  const ai = (await chatJson(
    'Eres un asistente de precios de supermercado en España (EUR). Responde JSON: {"prices":[{"name":"...","estimatedPrice":number}]} con precios medios aproximados actuales.',
    JSON.stringify(items)
  )) as { prices?: { name: string; estimatedPrice: number }[] } | null;

  if (ai?.prices?.length) {
    return items.map((item) => {
      const found = ai.prices!.find((p) => p.name.toLowerCase() === item.name.toLowerCase());
      return {
        name: item.name,
        estimatedPrice: found?.estimatedPrice ?? FALLBACK_AVG[item.category] ?? 2.5,
      };
    });
  }

  return items.map((item) => ({
    name: item.name,
    estimatedPrice: Number((FALLBACK_AVG[item.category] * (0.85 + Math.random() * 0.3)).toFixed(2)),
  }));
}

export async function structureProductFromPage(input: {
  store: string;
  storeUrl: string;
  title?: string;
  brand?: string;
  price?: number;
  rawText?: string;
}): Promise<{
  title: string;
  brand: string;
  price?: number;
  category: Category;
  unitPrice?: string;
}> {
  const ai = (await chatJson(
    'Extraes productos de páginas de supermercado España. Devuelve JSON: {"title":string,"brand":string,"price":number|null,"category":"carne|lacteos|frutas|verduras|panaderia|bebidas|limpieza|higiene|congelados|despensa|otros","unitPrice":string}',
    JSON.stringify(input)
  )) as {
    title?: string;
    brand?: string;
    price?: number | null;
    category?: Category;
    unitPrice?: string;
  } | null;

  const title = ai?.title || input.title || 'Producto';
  return {
    title,
    brand: ai?.brand || input.brand || '',
    price: ai?.price ?? input.price,
    category: ai?.category || guessCategory(title),
    unitPrice: ai?.unitPrice,
  };
}

export async function parseVoicePurchase(transcript: string, itemNames: string[]) {
  const ai = (await chatJson(
    'Parseas frases de compra en súper (español). Ej: "yogur ok precio 2,30". JSON: {"matchedName":string|null,"purchased":boolean,"actualPrice":number|null,"actualQty":number|null}. matchedName debe ser uno de la lista o null.',
    JSON.stringify({ transcript, itemNames })
  )) as {
    matchedName?: string | null;
    purchased?: boolean;
    actualPrice?: number | null;
    actualQty?: number | null;
  } | null;

  if (ai?.matchedName) return ai;

  // Heuristic fallback
  const lower = transcript.toLowerCase();
  const matchedName =
    itemNames.find((n) => lower.includes(n.toLowerCase().split(' ')[0]!)) || null;
  const priceMatch = lower.match(/precio\s*(\d+[.,]\d{1,2}|\d+)/);
  const qtyMatch = lower.match(/(\d+)\s*(ud|unidades|pack)?/);
  const price = priceMatch ? Number(priceMatch[1]!.replace(',', '.')) : null;
  return {
    matchedName,
    purchased: /ok|listo|comprado|hecho/.test(lower) || Boolean(matchedName && price != null),
    actualPrice: price,
    actualQty: qtyMatch ? Number(qtyMatch[1]) : 1,
  };
}

export async function generateMealPlan(input: {
  pantry: { id: string; name: string; quantityOnHand: number; category: string }[];
  peopleCount: number;
  dietaryNotes: string;
  weekStart: string;
  prefs?: Record<string, unknown>;
  likedDishes?: string[];
  blockedDishes?: string[];
}) {
  const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  const slots = ['desayuno', 'almuerzo', 'merienda', 'cena'] as const;

  const ai = (await chatJson(
    `Planificador de comidas semanal en España. El batch cooking existe PARA que haya comida los 7 días.
Reglas:
1) Siempre 28 comidas: 4 por día (desayuno, almuerzo, merienda, cena) de lunes a domingo. Nunca dejes un día vacío.
2) Usa day sin tildes: lunes, martes, miercoles, jueves, viernes, sabado, domingo.
3) Primero diseña preps de batch (bases: proteína, verdura, salsa, grano) que cubran el máximo de almuerzos y cenas de la semana.
4) Cada comida tiene source: "batch" si se monta/recalienta con una prep, o "same_day" si hay que cocinarla ese día. Si el batch no cubre ese plato, source DEBE ser same_day.
5) cookDays son los días con más cocina del natural; el resto de días igual tienen 4 comidas, preferentemente de batch. Desayunos y meriendas pueden ser same_day rápidos.
6) Si source es batch, pon fromPrepTitle con el título exacto de la prep y di en nutritionNote que se recalienta o se monta.
JSON: {"meals":[{"day":"lunes","slot":"desayuno|almuerzo|merienda|cena","title":string,"ingredients":string[],"usesPantryNames":string[],"source":"batch|same_day","fromPrepTitle":string,"nutritionNote":{"summary":string,"protein":string,"vegetables":string,"carbs":string}}],"preps":[{"title":string,"whenLabel":string,"durationMinutes":number,"ingredients":string[],"freezable":boolean,"storageNotes":string,"forMeals":string[]}]}
Respeta preferencias, no sugieras platos bloqueados, prioriza liked y despensa.
Si prefs.otherGoal está definido, trátalo como objetivo personalizado del usuario.
Las meriendas deben ser ligeras.`,
    JSON.stringify(input)
  )) as {
    meals?: {
      day: string;
      slot: 'desayuno' | 'almuerzo' | 'merienda' | 'cena' | 'comida';
      title: string;
      ingredients: string[];
      usesPantryNames?: string[];
      source?: 'batch' | 'same_day';
      fromPrepTitle?: string;
      nutritionNote?: {
        summary: string;
        protein?: string;
        vegetables?: string;
        carbs?: string;
        fats?: string;
        fiber?: string;
      };
    }[];
    preps?: {
      title: string;
      whenLabel: string;
      durationMinutes?: number;
      ingredients: string[];
      freezable?: boolean;
      storageNotes?: string;
      forMeals?: string[];
    }[];
  } | null;

  const normalizeSlot = (slot: string): (typeof slots)[number] => {
    const s = slot.toLowerCase();
    if (s === 'desayuno' || s === 'breakfast') return 'desayuno';
    if (s === 'merienda' || s === 'snack') return 'merienda';
    if (s === 'cena' || s === 'dinner') return 'cena';
    return 'almuerzo';
  };

  const names = input.pantry.map((p) => p.name);
  const liked = input.likedDishes || [];

  const fallbackMeal = (day: string, slot: (typeof slots)[number], i: number) => {
    const base =
      liked[i % Math.max(liked.length, 1)] ||
      names[i % Math.max(names.length, 1)] ||
      'ingredientes varios';
    const title =
      slot === 'desayuno'
        ? `Desayuno con ${base}`
        : slot === 'almuerzo'
          ? `Almuerzo: ${base}`
          : slot === 'merienda'
            ? `Merienda: ${base}`
            : `Cena: ${base}`;
    return {
      day,
      slot,
      title,
      ingredients: names.slice(0, 4).length ? names.slice(0, 4) : [base, 'verdura', 'aceite'],
      usesPantryIds: input.pantry.slice(0, 3).map((p) => p.id),
      source: 'same_day' as const,
      fromPrepTitle: '',
      nutritionNote: {
        summary:
          slot === 'desayuno'
            ? 'Fuente de energía y algo de proteína para empezar el día.'
            : slot === 'merienda'
              ? 'Tentempié ligero para media tarde.'
              : 'Incluye proteína, vegetales y una porción moderada de carbohidratos.',
        protein: slot === 'merienda' ? 'opcional' : '1 porción',
        vegetables: slot === 'desayuno' || slot === 'merienda' ? 'opcional' : '2 porciones',
        carbs: '1 porción moderada',
      },
    };
  };

  const fillWeek = (
    incoming: {
      day: string;
      slot: string;
      title: string;
      ingredients: string[];
      usesPantryIds: string[];
      source?: 'batch' | 'same_day';
      fromPrepTitle?: string;
      nutritionNote: {
        summary: string;
        protein?: string;
        vegetables?: string;
        carbs?: string;
      };
    }[]
  ) => {
    const byKey = new Map<string, (typeof incoming)[number]>();
    for (const m of incoming) {
      const day = normalizeWeekday(m.day);
      if (!day) continue;
      const slot = normalizeSlot(m.slot);
      const fromPrepTitle = (m.fromPrepTitle || '').trim();
      byKey.set(`${day}:${slot}`, {
        ...m,
        day,
        slot,
        source: m.source === 'batch' || fromPrepTitle ? 'batch' : 'same_day',
        fromPrepTitle,
      });
    }
    const meals = [];
    let i = 0;
    for (const day of days) {
      for (const slot of slots) {
        meals.push(byKey.get(`${day}:${slot}`) || fallbackMeal(day, slot, i));
        i++;
      }
    }
    return meals;
  };

  if (ai?.meals?.length) {
    const meals = fillWeek(
      ai.meals.map((m) => ({
        day: m.day,
        slot: normalizeSlot(m.slot),
        title: m.title,
        ingredients: m.ingredients || [],
        usesPantryIds: (m.usesPantryNames || [])
          .map((name) => input.pantry.find((p) => p.name.toLowerCase() === name.toLowerCase())?.id)
          .filter(Boolean) as string[],
        source: m.source === 'batch' || m.fromPrepTitle ? 'batch' : 'same_day',
        fromPrepTitle: (m.fromPrepTitle || '').trim(),
        nutritionNote: m.nutritionNote || {
          summary: 'Plato con equilibrio orientativo de proteína, vegetales y carbohidratos.',
        },
      }))
    );
    const pantryNames = input.pantry.map((p) => p.name);
    const preps = (ai.preps || []).length
      ? (ai.preps || []).map((p) => ({
          title: p.title,
          whenLabel: p.whenLabel || 'Día de batch',
          durationMinutes: p.durationMinutes || 30,
          ingredients: p.ingredients || [],
          freezable: Boolean(p.freezable),
          storageNotes: p.storageNotes || '',
          forMeals: p.forMeals || [],
        }))
      : [
          {
            title: 'Base de verduras cocidas',
            whenLabel: 'Día de batch',
            durationMinutes: 40,
            ingredients: pantryNames.slice(0, 3).length ? pantryNames.slice(0, 3) : ['verdura', 'aceite', 'sal'],
            freezable: true,
            storageNotes: 'Nevera 3-4 días o congelar en porciones.',
            forMeals: meals.filter((m) => m.slot === 'almuerzo' || m.slot === 'cena').slice(0, 3).map((m) => m.title),
          },
        ];
    return { meals, preps };
  }

  const meals = fillWeek([]);
  return {
    meals,
    preps: [
      {
        title: 'Base de verduras cocidas',
        whenLabel: 'Día de batch',
        durationMinutes: 40,
        ingredients: names.slice(0, 3).length ? names.slice(0, 3) : ['verdura', 'aceite', 'sal'],
        freezable: true,
        storageNotes: 'Nevera 3-4 días o congelar en porciones.',
        forMeals: meals.filter((m) => m.slot === 'almuerzo' || m.slot === 'cena').slice(0, 3).map((m) => m.title),
      },
      {
        title: 'Salsa de tomate casera',
        whenLabel: 'Día de batch',
        durationMinutes: 35,
        ingredients: ['tomate', 'cebolla', 'ajo', 'aceite'],
        freezable: true,
        storageNotes: 'Nevera 4 días; congelar hasta 2 meses.',
        forMeals: meals.filter((m) => /pasta|salsa|albóndig/i.test(m.title)).map((m) => m.title),
      },
    ],
  };
}

export async function suggestDishCards(input: {
  prefs?: Record<string, unknown>;
  pantryNames: string[];
  blockedKeys: string[];
  count?: number;
}) {
  const count = input.count || 8;
  const ai = (await chatJson(
    `Sugiere platos españoles/mediterráneos para swipe (Tinder de comidas).
JSON: {"dishes":[{"dishKey":"slug","title":string,"summary":string,"tags":string[]}]}
No repitas dishKey bloqueados.`,
    JSON.stringify(input)
  )) as { dishes?: { dishKey: string; title: string; summary: string; tags?: string[] }[] } | null;

  if (ai?.dishes?.length) {
    return ai.dishes.filter((d) => !input.blockedKeys.includes(d.dishKey)).slice(0, count);
  }

  const pool = [
    { dishKey: 'pollo-al-horno', title: 'Pollo al horno con patatas', summary: 'Clásico familiar', tags: ['proteína', 'horno'] },
    { dishKey: 'pasta-pesto', title: 'Pasta al pesto', summary: 'Rápida y vegetal', tags: ['rápida', 'pasta'] },
    { dishKey: 'lentejas-estofadas', title: 'Lentejas estofadas', summary: 'Guiso reconfortante', tags: ['legumbres'] },
    { dishKey: 'tortilla-patata', title: 'Tortilla de patatas', summary: 'Española de toda la vida', tags: ['tradicional'] },
    { dishKey: 'salmon-verduras', title: 'Salmón con verduras', summary: 'Ligero y proteico', tags: ['pescado'] },
    { dishKey: 'arroz-cubana', title: 'Arroz a la cubana', summary: 'Sencillo y económico', tags: ['económico'] },
    { dishKey: 'ensalada-completa', title: 'Ensalada completa', summary: 'Fresca con proteína', tags: ['ligera'] },
    { dishKey: 'crema-calabaza', title: 'Crema de calabaza', summary: 'Ideal para batch', tags: ['sopa'] },
    { dishKey: 'tacos-verduras', title: 'Tacos de verduras', summary: 'Novedoso y colorido', tags: ['novedoso'] },
    { dishKey: 'merluza-plancha', title: 'Merluza a la plancha', summary: 'Rápida y ligera', tags: ['pescado', 'rápida'] },
  ];
  return pool.filter((d) => !input.blockedKeys.includes(d.dishKey)).slice(0, count);
}

export async function generateRecipe(input: {
  title: string;
  ingredients: string[];
  pantryNames: string[];
  servings: number;
  prefs?: Record<string, unknown>;
  mode?: string;
  replaceIngredient?: { from: string; to: string };
}) {
  const ai = (await chatJson(
    `Genera receta completa en español (España). Modo: ${input.mode || 'full'}.
JSON: {"servings":number,"steps":string[],"prepMinutes":number,"cookMinutes":number,"totalMinutes":number,"difficulty":"facil|media|dificil","tools":string[],"substitutions":string[],"tips":string[],"fridgeDays":number,"freezable":boolean,"freezeNotes":string,"thawNotes":string,"reheatNotes":string,"pantryIngredientNames":string[],"missingIngredientNames":string[],"nutritionNote":{"summary":string,"protein":string,"vegetables":string,"carbs":string}}`,
    JSON.stringify(input)
  )) as Record<string, unknown> | null;

  if (ai) {
    return {
      servings: Number(ai.servings) || input.servings,
      steps: (ai.steps as string[]) || ['Preparar ingredientes', 'Cocinar', 'Servir'],
      prepMinutes: Number(ai.prepMinutes) || 15,
      cookMinutes: Number(ai.cookMinutes) || 25,
      totalMinutes: Number(ai.totalMinutes) || 40,
      difficulty: (ai.difficulty as 'facil' | 'media' | 'dificil') || 'media',
      tools: (ai.tools as string[]) || ['sartén', 'tabla'],
      substitutions: (ai.substitutions as string[]) || [],
      tips: (ai.tips as string[]) || [],
      fridgeDays: Number(ai.fridgeDays) || 2,
      freezable: Boolean(ai.freezable),
      freezeNotes: String(ai.freezeNotes || ''),
      thawNotes: String(ai.thawNotes || ''),
      reheatNotes: String(ai.reheatNotes || 'Calentar a fuego medio.'),
      imageUrl: '',
      pantryIngredientNames: (ai.pantryIngredientNames as string[]) || input.pantryNames.slice(0, 3),
      missingIngredientNames: (ai.missingIngredientNames as string[]) || [],
      nutritionNote: (ai.nutritionNote as {
        summary: string;
        protein?: string;
        vegetables?: string;
        carbs?: string;
      }) || {
        summary: 'Equilibrio orientativo de proteína, vegetales y carbohidratos.',
      },
    };
  }

  const pantrySet = new Set(input.pantryNames.map((n) => n.toLowerCase()));
  let ingredients = [...input.ingredients];
  if (input.replaceIngredient) {
    ingredients = ingredients.map((i) =>
      i.toLowerCase() === input.replaceIngredient!.from.toLowerCase()
        ? input.replaceIngredient!.to
        : i
    );
  }
  const pantryIngredientNames = ingredients.filter((i) => pantrySet.has(i.toLowerCase()));
  const missingIngredientNames = ingredients.filter((i) => !pantrySet.has(i.toLowerCase()));
  const faster = input.mode === 'faster';
  const cheaper = input.mode === 'cheaper';

  return {
    servings: input.servings,
    steps: [
      `Reúne: ${ingredients.join(', ') || input.title}`,
      faster ? 'Usa sartén o microondas para acortar tiempos.' : 'Sazona y cocina a fuego medio.',
      cheaper ? 'Prioriza ingredientes económicos de la despensa.' : 'Ajusta el punto de cocción.',
      'Emplata y sirve.',
    ],
    prepMinutes: faster ? 8 : 15,
    cookMinutes: faster ? 12 : 25,
    totalMinutes: faster ? 20 : 40,
    difficulty: faster ? ('facil' as const) : ('media' as const),
    tools: ['sartén', 'cuchillo', 'tabla'],
    substitutions: ['Puedes cambiar la proteína por legumbres', 'Usa verdura de temporada'],
    tips: ['Prueba la sal al final', 'Guarda sobras en recipiente hermético'],
    fridgeDays: 2,
    freezable: true,
    freezeNotes: 'Congela en porciones individuales hasta 2 meses.',
    thawNotes: 'Descongela en la nevera durante la noche.',
    reheatNotes: 'Recalienta en sartén o microondas hasta caliente.',
    imageUrl: '',
    pantryIngredientNames,
    missingIngredientNames,
    nutritionNote: {
      summary:
        'Esta comida contiene una fuente de proteína, vegetales y una porción moderada de carbohidratos.',
      protein: '1 porción',
      vegetables: '1-2 porciones',
      carbs: '1 porción moderada',
    },
  };
}

export async function generateBatchSession(input: {
  preps: { title: string; durationMinutes?: number; ingredients: string[] }[];
  meals: { title: string; day: string }[];
  cookDay?: string;
}) {
  const cookDay = input.cookDay || 'el día elegido';
  const ai = (await chatJson(
    `Organiza una sesión de batch cooking en español para ${cookDay}. El usuario cocina todas las preparaciones ese día para usarlas durante la semana.
JSON: {"totalMinutes":number,"steps":[{"order":number,"task":string,"parallelWith":number[],"minutes":number}],"containers":string[],"fridge":string[],"freezer":string[],"eatFirst":string[]}`,
    JSON.stringify(input)
  )) as {
    totalMinutes?: number;
    steps?: { order: number; task: string; parallelWith?: number[]; minutes?: number }[];
    containers?: string[];
    fridge?: string[];
    freezer?: string[];
    eatFirst?: string[];
  } | null;

  if (ai?.steps?.length) {
    return {
      totalMinutes: ai.totalMinutes || 120,
      steps: ai.steps,
      containers: ai.containers || ['táper', 'bandejas'],
      fridge: ai.fridge || [],
      freezer: ai.freezer || [],
      eatFirst: ai.eatFirst || [],
    };
  }

  const steps = [
    { order: 1, task: `Encender el horno y sacar ingredientes (${cookDay})`, parallelWith: [], minutes: 5 },
    { order: 2, task: 'Cortar todas las verduras', parallelWith: [1], minutes: 20 },
    { order: 3, task: 'Preparar bases (salsa / caldo / legumbres)', parallelWith: [], minutes: 35 },
    {
      order: 4,
      task: 'Cocinar proteínas mientras se hornean acompañamientos',
      parallelWith: [3],
      minutes: 40,
    },
    { order: 5, task: 'Separar porciones y etiquetar', parallelWith: [], minutes: 15 },
    { order: 6, task: 'Guardar en heladera o congelar', parallelWith: [], minutes: 10 },
  ];

  return {
    totalMinutes: steps.reduce((s, x) => s + (x.minutes || 0), 0),
    steps,
    containers: ['táperes', 'bolsas de congelación', 'bandejas'],
    fridge: input.preps.slice(0, 2).map((p) => p.title),
    freezer: input.preps.filter((_, i) => i >= 1).map((p) => p.title),
    eatFirst: input.meals.slice(0, 2).map((m) => `${m.day}: ${m.title}`),
  };
}

export async function suggestReplacementMeal(input: {
  currentTitle: string;
  day: string;
  slot: string;
  pantryNames: string[];
  prefs?: Record<string, unknown>;
  blocked?: string[];
}) {
  const ai = (await chatJson(
    'Sugiere UN plato alternativo. JSON: {"title":string,"ingredients":string[],"nutritionNote":{"summary":string}}',
    JSON.stringify(input)
  )) as {
    title?: string;
    ingredients?: string[];
    nutritionNote?: { summary: string };
  } | null;

  if (ai?.title) {
    return {
      title: ai.title,
      ingredients: ai.ingredients || input.pantryNames.slice(0, 4),
      nutritionNote: ai.nutritionNote || {
        summary: 'Alternativa equilibrada con proteína y vegetales.',
      },
    };
  }

  const alt =
    input.slot === 'desayuno'
      ? 'Tostadas con tomate y huevo'
      : input.slot === 'merienda'
        ? 'Yogur con fruta y frutos secos'
        : input.pantryNames[0]
          ? `${input.pantryNames[0]} salteado con verduras`
          : 'Pasta con verduras de temporada';
  return {
    title: alt,
    ingredients: input.pantryNames.slice(0, 4).length
      ? input.pantryNames.slice(0, 4)
      : ['pasta', 'tomate', 'aceite'],
    nutritionNote: {
      summary: 'Reemplazo con proteína o legumbre y vegetales.',
    },
  };
}

export async function parseSpokenShoppingList(
  transcript: string
): Promise<{ items: string[]; source: 'ai' | 'heuristic' }> {
  const text = transcript.trim();
  if (!text) return { items: [], source: 'heuristic' };

  if (!config.openaiApiKey) {
    console.warn('[parseSpokenShoppingList] OPENAI_API_KEY vacía: usando heurística local');
  }

  const ai = (await chatJson(
    `Eres un extractor literal de listas de la compra en español de España.
Reglas OBLIGATORIAS:
- Extrae CADA producto mencionado. Si dice varios seguidos sin coma ("tomate zanahoria lechuga"), son ítems separados.
- SOLO productos que el usuario haya DICHO para comprar. NUNCA inventes productos nuevos.
- Sí puedes corregir erratas obvias de una palabra dicha (zanahora→zanahoria, lechuaga→lechuga).
- Ignora muletillas (eh, este, necesito, falta, quiero, compra, por favor…).
- Ignora opiniones, quejas y negaciones (ej. "eso no me gusta", "no quiero eso").
- Si no hay ningún producto claro, {"items":[]}.
- Cada item: nombre corto y buscable.
JSON exacto: {"items":["..."]}`,
    text,
    { temperature: 0 }
  )) as { items?: string[] } | null;

  if (ai?.items && Array.isArray(ai.items)) {
    const cleaned = sanitizeSpokenItems(
      ai.items.map((i) => String(i)),
      text
    );
    if (cleaned.length) return { items: cleaned, source: 'ai' };
    if (isRejectableSpokenChunk(text)) return { items: [], source: 'ai' };
  }

  return { items: heuristicSpokenItems(text), source: 'heuristic' };
}

const FALLBACK_BASIC_NEEDS = [
  'huevos',
  'pechuga de pollo',
  'yogur natural',
  'leche semidesnatada',
  'pan integral',
  'arroz',
  'lentejas',
  'tomate',
  'lechuga',
  'plátano',
  'manzana',
  'aceite de oliva',
  'avena',
];

export async function suggestBasicNutritionalNeeds(input: {
  goals: string[];
  dietStyle: string;
  allergies: string[];
  restrictions: string[];
  dislikedIngredients: string[];
  forbiddenIngredients: string[];
  favoriteIngredients: string[];
  adults: number;
  children: number;
  pantryNames: string[];
  alreadyNeeded: string[];
  count?: number;
}): Promise<{ items: string[]; source: 'ai' | 'heuristic' }> {
  const count = Math.min(Math.max(input.count ?? 10, 4), 16);

  const ai = (await chatJson(
    `Eres un nutricionista práctico de supermercado en España.
Sugiere una lista CORTA de productos básicos de la compra para cubrir necesidades nutricionales básicas (proteína, verdura, fruta, lácteos o alternativa, carbohidratos, grasas saludables).
JSON exacto: {"items":["nombre corto y buscable", ...]}
Reglas:
- ${count} ítems máximo, nombres cortos tipo "yogur natural", "pechuga de pollo".
- Respeta dietStyle, allergies, restrictions, forbiddenIngredients y dislikedIngredients (no los incluyas).
- No repitas lo que ya está en pantryNames ni alreadyNeeded.
- Prioriza goals del usuario (ej. gain_muscle → más proteína; lose_weight → menos ultraprocesados).
- No inventes marcas ni packs raros. Solo productos de súper habituales.
- No añadas opiniones ni platos cocinados; solo ingredientes/productos comprables.`,
    JSON.stringify({
      goals: input.goals,
      dietStyle: input.dietStyle,
      allergies: input.allergies,
      restrictions: input.restrictions,
      dislikedIngredients: input.dislikedIngredients,
      forbiddenIngredients: input.forbiddenIngredients,
      favoriteIngredients: input.favoriteIngredients.slice(0, 12),
      adults: input.adults,
      children: input.children,
      pantryNames: input.pantryNames.slice(0, 40),
      alreadyNeeded: input.alreadyNeeded.slice(0, 40),
      count,
    }),
    { temperature: 0.3 }
  )) as { items?: string[] } | null;

  const blocked = new Set(
    [...input.pantryNames, ...input.alreadyNeeded, ...input.forbiddenIngredients, ...input.dislikedIngredients]
      .map((n) => n.toLowerCase().trim())
      .filter(Boolean)
  );

  const clean = (list: string[]) => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of list) {
      const item = String(raw || '')
        .trim()
        .replace(/\s+/g, ' ');
      if (item.length < 2) continue;
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      if ([...blocked].some((b) => key.includes(b) || b.includes(key))) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= count) break;
    }
    return out;
  };

  if (ai?.items?.length) {
    const items = clean(ai.items);
    if (items.length) return { items, source: 'ai' };
  }

  let fallback = [...FALLBACK_BASIC_NEEDS];
  if (input.dietStyle === 'vegan' || input.dietStyle === 'vegetarian') {
    fallback = fallback.filter((i) => !/pollo|leche|yogur|huevos/i.test(i));
    fallback.push('tofu', 'garbanzos', 'bebida de avena', 'frutos secos');
  }
  if (input.goals.includes('gain_muscle')) {
    fallback = ['pechuga de pollo', 'huevos', 'yogur natural', 'avena', ...fallback];
  }
  if (input.goals.includes('lose_weight')) {
    fallback = ['Pechuga de pavo', 'yogur natural', 'verduras variadas', 'fruta de temporada', ...fallback];
  }

  return { items: clean(fallback), source: 'heuristic' };
}

export async function suggestShoppingFromContext(input: {
  context: string;
  pantryNames: string[];
  alreadyNeeded: string[];
  allergies?: string[];
  count?: number;
}): Promise<{ items: string[]; source: 'ai' | 'heuristic' }> {
  const count = Math.min(Math.max(input.count ?? 12, 4), 20);
  const context = input.context.trim();
  if (!context) return { items: [], source: 'heuristic' };

  const ai = (await chatJson(
    `Eres un asistente de lista de la compra en España.
A partir del contexto/ocasión del usuario, propone productos de supermercado concretos y buscables.
JSON exacto: {"items":["nombre corto", ...]}
Reglas:
- Máximo ${count} ítems.
- Solo productos comprables (ingredientes, bebidas, básicos), no platos terminados.
- Respeta allergies si hay.
- No repitas pantryNames ni alreadyNeeded.
- Cubre lo esencial para la ocasión descrita (ej. cena romántica + torta + carne y pastas).
- Nombres cortos tipo "harina", "nata líquida", "espaguetis", "solomillo".`,
    JSON.stringify({
      context,
      pantryNames: input.pantryNames.slice(0, 40),
      alreadyNeeded: input.alreadyNeeded.slice(0, 40),
      allergies: input.allergies || [],
      count,
    }),
    { temperature: 0.35 }
  )) as { items?: string[] } | null;

  const blocked = new Set(
    [...input.pantryNames, ...input.alreadyNeeded, ...(input.allergies || [])]
      .map((n) => n.toLowerCase().trim())
      .filter(Boolean)
  );

  const clean = (list: string[]) => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of list) {
      const item = String(raw || '')
        .trim()
        .replace(/\s+/g, ' ');
      if (item.length < 2) continue;
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      if ([...blocked].some((b) => key.includes(b) || b.includes(key))) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= count) break;
    }
    return out;
  };

  if (ai?.items?.length) {
    const items = clean(ai.items);
    if (items.length) return { items, source: 'ai' };
  }

  const lower = context.toLowerCase();
  const fallback: string[] = [];
  if (/torta|pastel|postre|cumple/i.test(lower)) {
    fallback.push('harina', 'azúcar', 'huevos', 'mantequilla', 'nata líquida', 'chocolate');
  }
  if (/pasta|espagueti|macarrón/i.test(lower)) {
    fallback.push('espaguetis', 'tomate frito', 'queso parmesano', 'albahaca');
  }
  if (/carne|solomillo|ternera|cerdo/i.test(lower)) {
    fallback.push('solomillo', 'patatas', 'cebolla', 'vino tinto');
  }
  if (/romántic|cena|especial/i.test(lower)) {
    fallback.push('ensalada mixta', 'pan', 'aceite de oliva', 'velas');
  }
  if (!fallback.length) {
    fallback.push('pan', 'huevos', 'leche', 'tomate', 'pasta', 'aceite de oliva');
  }
  return { items: clean(fallback), source: 'heuristic' };
}

export async function identifyProductFromImage(
  imageDataUrl: string
): Promise<{ items: string[]; source: 'ai' | 'heuristic' } | null> {
  if (!imageDataUrl.startsWith('data:image/')) {
    console.warn('[identifyProduct] no es data URL de imagen');
    return null;
  }

  console.info('[identifyProduct] imagen', imageDataUrl.slice(0, 32), 'len=', imageDataUrl.length);

  const ai = (await chatVisionJson(
    `Eres un asistente de compra en supermercados de España.
Mira la foto y lista TODOS los productos de la compra que se vean (comida, bebida, higiene, limpieza, etc.).
Responde SOLO JSON: {"items":[{"query":"...","brand":"..."}, ...]}
Reglas:
- Un elemento por producto distinto visible (máx. 12).
- query: nombre corto buscable en súper (2-6 palabras). Ej: "leche semidesnatada", "yogur natural", "aceite de oliva".
- brand: marca si se lee; si no, "".
- Si solo hay un producto, items tendrá 1 elemento.
- Si la foto es borrosa pero se intuyen productos, inclúyelos con tu mejor estimación.
- Si no hay ningún producto reconocible: {"items":[]}.`,
    'Lista todos los productos de la compra visibles en esta foto.',
    imageDataUrl,
    { temperature: 0.2, maxTokens: 700 }
  )) as { items?: unknown; query?: unknown; product?: unknown; name?: unknown } | null;

  if (!ai) {
    console.warn('[identifyProduct] visión sin respuesta (API/key/modelo)');
    return null;
  }

  const seen = new Set<string>();
  const items: string[] = [];

  const pushQuery = (raw: unknown) => {
    const q = String(raw || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 80);
    if (!q) return;
    const key = q.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push(q);
  };

  if (Array.isArray(ai.items)) {
    for (const row of ai.items) {
      if (typeof row === 'string') pushQuery(row);
      else if (row && typeof row === 'object') {
        const o = row as Record<string, unknown>;
        pushQuery(o.query ?? o.name ?? o.product ?? o.producto ?? o.label ?? o.title);
      }
    }
  }

  // Compat: respuesta antigua de un solo producto
  if (!items.length) {
    pushQuery(ai.query ?? ai.product ?? ai.name);
  }

  if (!items.length) {
    console.warn('[identifyProduct] AI sin items', JSON.stringify(ai).slice(0, 300));
    return null;
  }

  return { items: items.slice(0, 12), source: 'ai' };
}

export type NutritionLevel = 'bad' | 'warn' | 'ok';

export interface NutritionFactor {
  id: string;
  side: 'negative' | 'positive';
  label: string;
  hint: string;
  value: string;
  level: NutritionLevel;
  detail: string;
}

export interface NutritionProductCard {
  name: string;
  brand: string;
  score: number;
  scoreLabel: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  sugar: string;
  salt: string;
  fiber: string;
  verdict: string;
  betterOption: string;
  factors: NutritionFactor[];
}

const FACTOR_IDS = ['additives', 'salt', 'satFat', 'sugar', 'protein', 'calories', 'fiber'] as const;

function scoreLabelFrom(score: number) {
  if (score < 30) return 'Malo';
  if (score < 50) return 'Mediocre';
  if (score < 75) return 'Bueno';
  return 'Excelente';
}

function clampLevel(raw: unknown): NutritionLevel {
  const v = String(raw || '').toLowerCase();
  if (v === 'bad' || v === 'malo' || v === 'red') return 'bad';
  if (v === 'ok' || v === 'good' || v === 'green' || v === 'bueno') return 'ok';
  return 'warn';
}

function parseFactors(raw: unknown): NutritionFactor[] {
  if (!Array.isArray(raw)) return [];
  const out: NutritionFactor[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const id = String(o.id || o.key || '').slice(0, 24);
    if (!id) continue;
    const side = String(o.side || '') === 'positive' ? 'positive' : 'negative';
    out.push({
      id,
      side,
      label: String(o.label || id).slice(0, 40),
      hint: String(o.hint || o.description || '').slice(0, 80),
      value: String(o.value || 'n/d').slice(0, 32),
      level: clampLevel(o.level),
      detail: String(o.detail || '').slice(0, 320),
    });
  }
  return out;
}

function fallbackFactors(p: Record<string, unknown>): NutritionFactor[] {
  return [
    {
      id: 'additives',
      side: 'negative',
      label: 'Aditivos',
      hint: 'Revisa la lista de ingredientes',
      value: String(p.additives || 'n/d'),
      level: 'warn',
      detail: 'Cuenta aditivos a evitar si se leen en el envase (colorantes, edulcorantes, conservantes).',
    },
    {
      id: 'salt',
      side: 'negative',
      label: 'Sal',
      hint: 'Según la etiqueta',
      value: String(p.salt || 'n/d'),
      level: 'warn',
      detail: 'Por 100 g. Más de 1,5 g de sal se considera alto.',
    },
    {
      id: 'satFat',
      side: 'negative',
      label: 'Grasas saturadas',
      hint: 'Según la etiqueta',
      value: String(p.fat || 'n/d'),
      level: 'warn',
      detail: 'Por 100 g. Más de 5 g de saturadas se considera alto.',
    },
    {
      id: 'sugar',
      side: 'negative',
      label: 'Azúcar',
      hint: 'Según la etiqueta',
      value: String(p.sugar || 'n/d'),
      level: 'warn',
      detail: 'Por 100 g. Más de 22,5 g de azúcares se considera alto.',
    },
    {
      id: 'protein',
      side: 'positive',
      label: 'Proteínas',
      hint: 'Según la etiqueta',
      value: String(p.protein || 'n/d'),
      level: 'ok',
      detail: 'Por 100 g. A partir de 12 g se considera una buena fuente.',
    },
    {
      id: 'calories',
      side: 'positive',
      label: 'Valor energético',
      hint: 'Según la etiqueta',
      value: String(p.calories || 'n/d'),
      level: 'ok',
      detail: 'kcal por 100 g o por ración, según lo que se lea en el envase.',
    },
  ];
}

export async function analyzeProductNutrition(images: string[]): Promise<{
  products: NutritionProductCard[];
  recommendation: string;
  winnerIndex: number | null;
} | null> {
  const urls = images.filter((u) => u.startsWith('data:image/')).slice(0, 2);
  if (!urls.length) return null;

  const dual = urls.length > 1;
  const ai = (await chatVisionJson(
    `Eres un dietista de supermercado en España, estilo ficha Yuka. Lees envase y tabla nutricional.
Responde SOLO JSON:
{"products":[{
  "name":string,"brand":string,"score":0-100,
  "calories":string,"protein":string,"carbs":string,"fat":string,"sugar":string,"salt":string,"fiber":string,
  "verdict":string,"betterOption":string,
  "factors":[{"id":"additives|salt|satFat|sugar|protein|calories|fiber","side":"negative|positive","label":string,"hint":string,"value":string,"level":"bad|warn|ok","detail":string}]
}],"recommendation":string,"winnerIndex":0}
Reglas:
- score 0-100 (menos azúcar/sal/aditivos y más proteína/fibra = más nota).
- factors OBLIGATORIOS: additives, salt, satFat, sugar (side negative) y protein, calories (side positive). Añade fiber en positivo si aporta.
- hint: frase corta tipo "Bastante dulce", "Demasiado salado", "Algunas proteínas", "Bajo en calorías".
- value: cifra con unidad (26 g, 1,2 g, 151 kcal, 9). Por 100 g si se lee.
- level: bad=rojo, warn=naranja, ok=verde.
- detail: 1-2 frases al abrir la fila (qué implica y umbral).
- Si no se lee un dato: value "n/d", hint "No se lee en la foto", level warn.
- betterOption: alternativa de súper español o "Cómpralo, es una opción sólida".
- Dos fotos: winnerIndex 0 o 1.`,
    dual
      ? 'Foto 1 = producto A. Foto 2 = producto B. Analiza cada uno con factors y di cuál conviene más.'
      : 'Analiza este producto con factors negativo/positivo, nota /100 y si conviene comprarlo.',
    urls,
    { temperature: 0.15, maxTokens: 1400 }
  )) as {
    products?: Record<string, unknown>[];
    recommendation?: string;
    winnerIndex?: number;
  } | null;

  if (!ai?.products?.length) return null;

  const products = ai.products.slice(0, 2).map((p) => {
    const score = Math.max(0, Math.min(100, Number(p.score) || 50));
    const factors = parseFactors(p.factors);
    const known = new Set(factors.map((f) => f.id));
    const merged = [
      ...factors.filter((f) => (FACTOR_IDS as readonly string[]).includes(f.id)),
      ...fallbackFactors(p).filter((f) => !known.has(f.id)),
    ];
    return {
      name: String(p.name || 'Producto').slice(0, 80),
      brand: String(p.brand || '').slice(0, 40),
      score,
      scoreLabel: scoreLabelFrom(score),
      calories: String(p.calories || 'n/d'),
      protein: String(p.protein || 'n/d'),
      carbs: String(p.carbs || 'n/d'),
      fat: String(p.fat || 'n/d'),
      sugar: String(p.sugar || 'n/d'),
      salt: String(p.salt || 'n/d'),
      fiber: String(p.fiber || 'n/d'),
      verdict: String(p.verdict || '').slice(0, 280),
      betterOption: String(p.betterOption || '').slice(0, 220),
      factors: merged,
    };
  });

  let winnerIndex: number | null = null;
  if (products.length > 1) {
    const w = Number(ai.winnerIndex);
    winnerIndex = w === 0 || w === 1 ? w : products[0]!.score >= products[1]!.score ? 0 : 1;
  }

  return {
    products,
    recommendation:
      String(ai.recommendation || '').slice(0, 400) ||
      (products.length > 1
        ? `Mejor opción: ${products[winnerIndex ?? 0]!.name}.`
        : products[0]!.betterOption || products[0]!.verdict),
    winnerIndex,
  };
}
