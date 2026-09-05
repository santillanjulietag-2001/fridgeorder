# El mejor instructivo del mundo

Guía para arrancar el entorno de desarrollo en local: MongoDB, API (backend) y web (frontend).

**Puertos**


| Servicio               | URL                                                                  |
| ---------------------- | -------------------------------------------------------------------- |
| Frontend (Vue / Vite)  | [http://localhost:5180](http://localhost:5180)                       |
| Backend (API Express)  | [http://localhost:4200](http://localhost:4200)                       |
| Health check de la API | [http://localhost:4200/api/health](http://localhost:4200/api/health) |
| MongoDB                | `localhost:27017`                                                    |


La web reenvía `/api` al backend (`vite` proxy → `http://localhost:4200`). Con los tres servicios arriba, abre solo el frontend.

Necesitas **dos terminales** (más Docker o Mongo local). El frontend y el backend se quedan en ejecución; no cierres esas ventanas.

---



## Requisitos

- **Node.js** 18 o superior y **npm**
- **Docker Desktop** (recomendado para MongoDB) **o** MongoDB instalado en el Mac
- El código del repo `fridgeorder`

Comprueba Node:

```bash
node -v
npm -v
```

---



## 1. Ir a la raíz del proyecto

```bash
cd "/Users/julietasantillan/Documents/PROYECTOS CURSOR/FridgeOrder/fridgeorder"
```

Todos los `npm run …` de esta guía se ejecutan **desde esta carpeta**, no desde `apps/web` ni `apps/api`.

---



## 2. Variables de entorno (solo la primera vez)

```bash
cp .env.example .env
```

El archivo `.env` en la raíz lo lee la API. Con los valores de ejemplo basta para desarrollar:

- `MONGODB_URI=mongodb://localhost:27017/fridgeorder`
- `PORT=4200`
- `WEB_ORIGIN=http://localhost:5180`

`OPENAI_API_KEY` puede quedar vacío: la app usa heurísticas locales. Si más adelante quieres IA (voz, precios, menú), pega tu clave ahí.

---



## 3. Arrancar MongoDB



### Opción A — Docker (recomendada)

Con Docker Desktop abierto:

```bash
docker compose up -d mongo
```

Comprueba que el contenedor está en marcha:

```bash
docker compose ps
```

Para pararlo más tarde: `docker compose stop mongo`.

### Opción B — MongoDB local

Si ya tienes Mongo instalado y escuchando en el puerto `27017`, no hace falta Docker. La URI del `.env` apunta a `localhost:27017`.

---



## 4. Instalar dependencias y compilar `shared` (primera vez o tras un `git pull`)

```bash
npm install
npm run build:shared
```

`packages/shared` (categorías, schemas Zod, helpers) debe estar compilado **antes** de levantar la API o la web. Si cambias código en `packages/shared`, vuelve a ejecutar `npm run build:shared` (o déjalo en watch: `npm run dev -w @fridgeorder/shared`).

---



## 5. Levantar el backend (API)

**Terminal 1**, en la raíz del repo:

```bash
npm run dev:api
```

Deberías ver algo como:

```text
MongoDB connected
API listening on http://localhost:4200
```

La primera vez también puede aparecer:

```text
Usuario demo creado: demo@fridgeorder.local / secret123
```

Comprueba el health:

```bash
curl http://localhost:4200/api/health
```

Respuesta esperada: `{"ok":true,"name":"FridgeOrder API"}`.

Si falla con error de conexión a Mongo, vuelve al paso 3. No arranques el frontend hasta que la API esté escuchando.

Deja esta terminal abierta.

---



## 6. Levantar el frontend (web)

**Terminal 2**, también en la raíz:

```bash
npm run dev:web
```

Deberías ver:

```text
VITE v6.x.x  ready in …
➜  Local:   http://localhost:5180/
```

Abre **[http://localhost:5180](http://localhost:5180)** en el navegador.

**Login de prueba**

- Email: `demo@fridgeorder.local`
- Contraseña: `secret123`

(También puedes crear una cuenta nueva en la misma pantalla.)

Deja esta terminal abierta.

---



## Orden resumido (día a día)

Cuando ya hiciste el setup una vez:

```bash
# Terminal 0 (si usas Docker y Mongo no está arriba)
docker compose up -d mongo

# Terminal 1
cd "/Users/julietasantillan/Documents/PROYECTOS CURSOR/FridgeOrder/fridgeorder"
npm run dev:api

# Terminal 2
cd "/Users/julietasantillan/Documents/PROYECTOS CURSOR/FridgeOrder/fridgeorder"
npm run dev:web
```

Luego entra en [http://localhost:5180](http://localhost:5180).

---



## Cómo parar

En cada terminal de `dev:api` / `dev:web`: **Ctrl+C**.

Mongo (Docker):

```bash
docker compose stop mongo
```

---



## Si algo no arranca


| Síntoma                                    | Qué revisar                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `ECONNREFUSED` / no conecta a Mongo        | Docker Desktop abierto y `docker compose up -d mongo`. Puerto 27017 libre.           |
| Puerto 4200 o 5180 ocupado                 | Ya hay otro `npm run dev` en marcha. Cierra esa terminal o mata el proceso.          |
| La web carga pero login falla / red        | La API no está arriba. Mira la terminal 1 y `curl http://localhost:4200/api/health`. |
| Errores de import de `@fridgeorder/shared` | Ejecuta `npm run build:shared` desde la raíz.                                        |
| Cambios en `.env` no se aplican            | Reinicia `npm run dev:api` (dotenv se lee al arrancar).                              |


---



## Extra (no hace falta para desarrollar)

**Extensión Chrome:** `chrome://extensions` → modo desarrollador → “Cargar descomprimida” → carpeta `apps/extension`. Login con el mismo usuario. Atajo: `Cmd+Shift+Y`.

**Todo con Docker** (API + web + Mongo, sin `npm run dev`):

```bash
docker compose up --build
```

La web queda en [http://localhost:8080](http://localhost:8080) (no en 5180). Para el día a día, usa los `npm run dev:*` de arriba.