# Turnera — Sistema de Turnos para Peluquería

App de gestión de turnos construida para **The King Black Barber**, con PWA para clientes, panel del personal y pago de seña por MercadoPago.


---

## Funcionalidades

- **PWA para clientes** — se instala desde el navegador; los clientes consultan disponibilidad y reservan turno
- **Panel del personal** — dashboard con login, agenda diaria y semanal
- **Gestión de turnos** — crear, reprogramar y cancelar turnos en tiempo real
- **Seña con MercadoPago** — el cliente paga una seña al reservar (OAuth + webhooks)
- **Dos apps instalables** — experiencias separadas para el cliente y la peluquería
- **Identidad visual propia** — diseñada para The King Black Barber

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14 (App Router) |
| Lenguaje | TypeScript |
| Base de datos | PostgreSQL |
| Contenedores | Docker |
| Pagos | MercadoPago (OAuth, Webhooks) |
| Deploy | Vercel |

## Correr en local

```bash
cp .env.example .env.local   # completar DATABASE_URL, credenciales MP y AUTH_SECRET
docker compose up -d db      # levantar Postgres
npm install
npm run dev                  # http://localhost:3000
```

> Si ya tenías la base de una versión anterior, reseteala:
> ```bash
> docker compose down -v && docker compose up -d db
> ```

## Estructura del proyecto

```
app/              Páginas (Next.js App Router)
components/       Componentes compartidos
db/               Schema y migraciones
lib/              Acceso a datos y helpers de auth
public/           Assets estáticos y manifest PWA
scripts/          Scripts de seed y utilidades
types/            Tipos TypeScript compartidos
middleware.ts     Middleware de autenticación
docker-compose.yml
```

## Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL |
| `AUTH_SECRET` | Clave para tokens de sesión (`openssl rand -base64 32`) |
| `MP_CLIENT_ID` | Client ID de la app de MercadoPago |
| `MP_CLIENT_SECRET` | Client Secret de MercadoPago |
| `MP_WEBHOOK_SECRET` | Clave de firma del webhook |
| `NEXT_PUBLIC_URL` | URL pública de la app |

---

Desarrollado por [Diego Pistorio](https://github.com/DiegoPistorio)
