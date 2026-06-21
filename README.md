# ms-alertas — Microservicio de Alertas a la Comunidad

> Microservicio para la gestión, geolocalización y ciclo de vida de alertas tempranas de incendios forestales y otros riesgos ambientales. Parte del ecosistema **FocoCero**.

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)]()
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)]()
[![License](https://img.shields.io/badge/license-ISC-blue.svg)]()

---

## Descripción

**ms-alertas** recibe, almacena y sirve alertas georreferenciadas. Los ciudadanos reportan incidentes (fuego, microbasurales, vegetación seca, etc.), los brigadistas verifican y actualizan el estado en terreno, y los administradores gestionan el ciclo de vida completo.

Cada alerta nace como un punto en el mapa y atraviesa estados —`REPORTADA → EN_REVISION → DERIVADA → RESUELTA / DESCARTADA`— con validación en terreno.

**Funcionalidades clave:**
- Reportes en formato GeoJSON Point con coordenadas exactas.
- Búsqueda espacial PostGIS (`ST_DWithin`) para alertas cercanas.
- Verificación táctica: brigadistas confirman o descartan en terreno.
- Visibilidad pública selectiva: solo alertas derivadas (verificadas) se exponen.
- Borrado lógico con soft delete para auditoría.

**Audiencia:**
| Rol | Acceso |
|-----|--------|
| Ciudadano (usuario) | Crear alertas, ver las propias, consultar públicas y cercanas |
| Brigadista | Panel completo + verificar + cambiar estado |
| Administrador | CRUD completo + borrado lógico |

---

## Stack

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Node.js | ≥ 20.0.0 | Entorno de ejecución |
| Express | ^5.2.1 | Framework HTTP |
| PostgreSQL + PostGIS | 15 + 3.3 | Base de datos espacial |
| Firebase Admin SDK | ^13.8.0 | Verificación de tokens JWT |
| Zod | ^4.3.6 | Validación de schemas |
| Swagger UI Express | ^5.0.1 | Documentación interactiva |
| Helmet | ^8.1.0 | Seguridad HTTP |
| express-rate-limit | ^8.3.1 | Rate limiting por IP |
| Pino | ^10.3.1 | Logging estructurado |
| prom-client | ^15.1.3 | Métricas Prometheus |
| Eureka JS Client | ^4.5.0 | Service discovery |

---

## Requisitos

- Node.js ≥ 20.0.0, npm ≥ 9.x
- PostgreSQL 15+ con PostGIS
- Credenciales Firebase Admin SDK
- Eureka Server (opcional, fallback `localhost:8761`)

---

## Variables de entorno

Validación **fail-fast** con `env-var`: si falta una variable obligatoria, el proceso termina.

| Variable | Tipo | Obligatoria | Default | Descripción |
|----------|------|-------------|---------|-------------|
| `PORT` | `number` | ✅ | — | Puerto HTTP (3003 en Docker) |
| `NODE_ENV` | `string` | ❌ | `development` | Entorno de ejecución |
| `DB_USER` | `string` | ✅ | — | Usuario PostgreSQL |
| `DB_PASSWORD` | `string` | ✅ | — | Contraseña PostgreSQL |
| `DB_HOST` | `string` | ✅ | — | Host PostgreSQL |
| `DB_PORT` | `number` | ✅ | — | Puerto PostgreSQL (5432) |
| `DB_NAME` | `string` | ✅ | — | BD (`fococero_alertas`) |
| `EUREKA_HOST` | `string` | ❌ | `localhost` | Host Eureka Server |
| `API_GATEWAY_URL` | `string` | ❌ | `http://localhost:3000` | Origen para CORS |
| `MULTIMEDIA_SERVICE_URL` | `string` | ✅ | — | URL ms-multimedia |
| `INTERNAL_SECRET_TOKEN` | `string` | ✅ | — | Token Inter-Service |
| `FIREBASE_PROJECT_ID` | `string` | ✅ | — | Proyecto Firebase |
| `FIREBASE_CLIENT_EMAIL` | `string` | ✅ | — | Cuenta de servicio Firebase |
| `FIREBASE_PRIVATE_KEY` | `string` | ✅ | — | Llave privada RSA (con `\n` escapados) |

> `FIREBASE_PRIVATE_KEY` debe incluir saltos de línea literales (`\n`). El código aplica `.replace(/\\n/g, '\n')` automáticamente.

---

## Instalación

```bash
# 1. Instalar dependencias
cd fococero-backend/ms-alertas && npm install

# 2. Crear .env (ver tabla de variables arriba)
# 3. Inicializar la base de datos
psql -U fococero -d fococero_alertas -f database/init.sql

# 4. Ejecutar en desarrollo
npm run dev
```

Servidor en `http://localhost:3003`. Swagger en `http://localhost:3003/api/docs`.

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Hot-reload con `ts-node-dev` |
| `npm run build` | Compila a `dist/` |
| `npm start` | Producción desde `dist/` |
| `npm test` | Tests con Jest |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

---

## Endpoints

Rutas montadas bajo `/api/alertas` a través del API Gateway.

### 🔓 Públicos (sin autenticación)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/alertas/publicas` | Alertas verificadas visibles al público (estado `DERIVADA`) |

### 🔒 Autenticados (token Firebase requerido)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/alertas` | Crear una alerta geolocalizada |
| `GET` | `/api/alertas/mis-alertas` | Historial de alertas del usuario autenticado |
| `GET` | `/api/alertas/cercanas?lng=&lat=&radio=` | Alertas en un radio (m). Default: 5000, máx: 50000 |
| `GET` | `/api/alertas/:id` | Detalle de alerta por UUID |

### 🟠 Operativos (roles: `admin`, `brigadista`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/alertas` | Panel general de todas las alertas |
| `POST` | `/api/alertas/:id/verificar` | Confirmar (`esFuegoConfirmado: true/false`) en terreno |
| `PATCH` | `/api/alertas/:id/estado` | Cambiar estado (`EN_REVISION`, `DERIVADA`, `RESUELTA`, `DESCARTADA`) |

### 🔴 Administrativos (rol `admin`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `DELETE` | `/api/alertas/:id` | Borrado lógico |

### 🩺 Monitoreo

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/metrics` | Métricas Prometheus |

### Ejemplo: crear alerta

```json
POST /api/alertas
Authorization: Bearer <firebase-token>
Content-Type: application/json

{
  "descripcion": "Humo denso visible desde ruta 68, km 15.",
  "ubicacion": { "type": "Point", "coordinates": [-71.53, -33.04] }
}
```

Respuesta `201`:
```json
{ "ok": true, "msg": "Alerta registrada con éxito.", "data": { "id": "uuid", "estado": "REPORTADA" } }
```

### Estados del ciclo de vida

```
REPORTADA → EN_REVISION → DERIVADA → RESUELTA
                                ↘ DESCARTADA
```

---

## Swagger (`/api/docs`)

```
http://localhost:3003/api/docs
```

La especificación OpenAPI 3.0 incluye esquemas de entrada/salida, ejemplos de request body, parámetros de consulta (`lng`, `lat`, `radio`) y el esquema de seguridad `bearerAuth`.

Para probar endpoints protegidos: obtén un Firebase ID Token, haz clic en **Authorize** e ingrésalo (sin la palabra "Bearer").

---

## Seguridad

El microservicio implementa defensa en profundidad:

### 1. Perímetro HTTP
- **Helmet**: cabeceras de seguridad (CSP, X-Frame-Options, etc.).
- **CORS**: restringido al origen del API Gateway.
- **Rate Limiting**: 100 peticiones/IP cada 15 minutos.

### 2. Autenticación Inter-Service
Toda ruta (excepto `/health`, `/metrics`, `/api/health`) exige el header `x-internal-token` con el valor de `INTERNAL_SECRET_TOKEN`. Solo el API Gateway y microservicios autorizados pueden alcanzar estos endpoints.

### 3. Autenticación de usuarios (Firebase JWT)
El middleware `validateFirebaseToken` verifica criptográficamente el token `Authorization: Bearer <token>` y lo inyecta en `req.user` con `uid`, `email` y `rol`.

### 4. RBAC — Control de acceso por roles

| Rol | Permisos |
|-----|----------|
| `usuario` | Crear alertas, consultar propias, públicas y cercanas |
| `brigadista` | Todo lo anterior + panel general, verificar, cambiar estado |
| `admin` | Todo lo anterior + borrado lógico |
| `invitado` | Solo consulta de alertas públicas |

### 5. Validación Zod
- `crearAlertaSchema`: `descripcion` (10–500 chars), `ubicacion` GeoJSON Point con coordenadas en rango.
- `cambiarEstadoSchema`: `id` UUID, `estado` miembro del enum `EstadoAlerta`.

### 6. Soft Delete
Las alertas no se destruyen. Se marca `eliminado_en` con la fecha actual y se filtran con `WHERE eliminado_en IS NULL`.

---

## Eureka

El microservicio se registra automáticamente en Eureka al iniciar mediante `eureka-js-client`.

```typescript
// Configuración (eureka.client.ts)
const client = new Eureka({
  instance: {
    app: 'MS-ALERTAS',
    hostName: 'ms-alertas',
    statusPageUrl: 'http://ms-alertas:3003/health',
    port: { '$': 3003, '@enabled': true },
    vipAddress: 'ms-alertas',
    dataCenterInfo: { '@class': '...', name: 'MyOwn' },
  },
  eureka: {
    host: process.env.EUREKA_HOST || 'localhost',
    port: 8761,
    servicePath: '/eureka/apps/',
    maxRetries: 10,
    requestRetryDelay: 2000,
  },
});
```

**Beneficios:**
- El API Gateway descubre `ms-alertas` dinámicamente sin URLs fijas.
- Escalabilidad horizontal: múltiples instancias contra el mismo `vipAddress`.
- Health checks automáticos: Eureka da de baja instancias caídas.

**Verificar registro:**
```bash
curl http://localhost:8761/eureka/apps/MS-ALERTAS
```

Respuesta exitosa devuelve metadatos con estado `UP`.

---

## Apéndice: Comandos útiles

```bash
npm run dev                                    # Desarrollo con hot-reload
npm run build && npm start                     # Producción
curl http://localhost:3003/api/health          # Health check
curl http://localhost:3003/metrics             # Métricas Prometheus
curl http://localhost:3003/api/alertas/publicas # Endpoint público
docker compose logs -f ms-alertas              # Logs Docker
```
