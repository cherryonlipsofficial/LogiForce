# LogiForce — Workforce Management Platform

Driver payroll, attendance, invoicing, and fleet operations for UAE/GCC logistics companies.

## Architecture

```
                    https://<company>.<APP_DOMAIN>     https://admin.<APP_DOMAIN>
                                 │                               │
┌──────────────────────────────────────────────┐                 │
│ React SPA (Vite) — one build for every company │◀────────────────┘  (platform console at /platform)
└──────────────────────────────────────────────┘
                     │  REST + JWT
┌──────────────────────────────────────────────┐     ┌─────────────────────────────────┐
│ Express API (Node 20) — one server             │────▶│ Platform DB (PLATFORM_MONGODB_URI) │
│   /api/platform/*  platform console API        │     │ companies, platform users/roles, │
│   /api/*           company API (by tenant key) │     │ role templates, audit log         │
└──────────────────────────────────────────────┘     └─────────────────────────────────┘
                     │
                     ▼
        One database per company, on MONGODB_BASE_URI's cluster
        (MONGODB_BASE_URI/<dbName>)
```

- **Client**: React 19, Vite, React Query, React Router 6, Recharts
- **Server**: Express 4, Mongoose 8, JWT auth, express-validator, Morgan, Winston
- **Databases**: the platform database, plus one MongoDB database per company (Users, Drivers, Clients, Suppliers, Attendance, Salary, Invoices, Advances, Ledger, Documents, AuditLog, and more — see `server/src/config/modelRegistry.js`)

In this README a **company** (or tenant) is a business that subscribes to LogiForce. It is not the *Clients* module (Amazon, Noon, …), which is business data inside a company.

### No built-in companies

There is no list of companies anywhere in the code, env vars or deploy config. A fresh install starts with **zero** companies. A company exists when the Platform Owner (or a platform user given `platform.tenants.create`) creates it in the platform console; it is served at once, without a restart or redeploy. Nothing that runs on startup or deploy creates companies, users, roles or business data.

### Multi-tenancy

Every `/api` request except `/api/health` and `/api/platform/*` is routed to one company's database, resolved by `server/src/middleware/tenant.js`:

- **Tenant key** — from the `x-tenant-id` header, or else the subdomain of the `Origin`/`Referer` when it is `<key>.<APP_DOMAIN>`.
- **Lookup** — in the platform database (`tenants`), cached per server for `TENANT_CACHE_TTL_MS` (default 60 s; unknown keys 10 s). A change made through the console clears the cache on the server that made it.
- **Responses before any route** — `400` no tenant key · `404` unknown company · `503 TENANT_PROVISIONING` while it is being set up · `403 TENANT_SUSPENDED` / `403 TENANT_ARCHIVED` · `503` if the platform database can't be read. A company that isn't active never has its database opened, and the scheduled jobs skip it.
- **The client sets the header itself** — `client/src/api/axiosInstance.js` sends the subdomain under `VITE_APP_DOMAIN`, or `VITE_DEV_TENANT` on localhost. There is no default company: with neither, no header is sent and the server answers 400.
- **Calling the API directly**:
  ```bash
  curl http://localhost:5000/api/drivers \
    -H "x-tenant-id: acme" \
    -H "Authorization: Bearer <token>"
  ```
- **Tokens are bound to one company** — a company token has `aud: 'tenant'` and `tid: <key>`; sent to another company it gets `401 Token is not valid for this company`.

### Platform level

Above the companies sits the platform: LogiForce's own staff, with their own users, roles, login (password + emailed code) and tokens (`PLATFORM_JWT_SECRET`, `aud: 'platform'`). Platform and company tokens are refused on each other's routes.

Platform permissions (`server/src/config/platformPermissions.js`) are separate from company permissions (`server/src/config/permissions.js`): a platform permission can never be granted inside a company, and a company permission can never be put in a platform role. The server checks a platform permission on every `/api/platform` route; the console only hides what the server already refuses.

| Permission | Allows |
|---|---|
| `platform.tenants.view` | See companies, their details and admins |
| `platform.tenants.create` | Create a company |
| `platform.tenants.edit` | Change a company's name, contact, user limit, self sign-up |
| `platform.tenants.manage_modules` | Change a company's modules and allowed roles; re-run its role sync |
| `platform.tenants.suspend` | Suspend, reactivate, archive |
| `platform.tenant_admins.invite` | Add a company admin (emailed a set-password link) |
| `platform.tenant_admins.resend_invite` | Resend a company admin's invite |
| `platform.tenant_admins.reset_password` | Email a company admin a reset link (nobody sees a password) |
| `platform.role_templates.view` / `.manage` | See / edit the role templates offered to companies |
| `platform.users.view` / `.manage` | See / invite, re-role, deactivate platform users |
| `platform.roles.manage` | Create, edit, delete platform roles |
| `platform.audit.view` | Read the platform audit log |

Platform roles:

- **Platform Owner** (`platform_owner`) — every permission. Locked: it can't be edited or deleted, and its list always follows the code. There is no hidden "if owner then allow"; the Owner's access is this list.
- **Client Support** (`platform_support`) — by default `tenants.view`, `tenant_admins.resend_invite`, `tenant_admins.reset_password`, `role_templates.view`, `audit.view`. Support can't create, suspend or archive companies, change modules or allowed roles, edit role templates, or manage platform users. An Owner can edit this role or create others.

Rules, enforced by the server: you can only give a role (or put permissions in a role) that you hold yourself; nobody can change their own role or permissions or deactivate themselves; only an Owner can make someone an Owner; there is always at least one active Owner.

Inside a company the rules are unchanged: a company admin manages their own users and grants access only within their own access, but can't create or edit roles (roles come from the platform's role templates).

## Prerequisites

- Node.js 20+
- MongoDB 7+
- Docker & Docker Compose (for the containerized setup)

## Setting up a new installation

1. **DNS** — a wildcard record `*.<APP_DOMAIN>` (e.g. `*.logiforce.app`) pointing at the frontend, plus the API host. Every company is `https://<key>.<APP_DOMAIN>`; the console is `https://admin.<APP_DOMAIN>`.
2. **Environment** — on the server: `PLATFORM_MONGODB_URI`, `MONGODB_BASE_URI`, `APP_DOMAIN`, `JWT_SECRET`, `PLATFORM_JWT_SECRET` (and email, see below). On the frontend build: `VITE_API_URL`, `VITE_APP_DOMAIN`. The server refuses to start without the required ones and says which is missing. See `server/.env.example`.
3. **Create the Platform Owner** (once):
   ```bash
   cd server
   npm run platform:create-owner -- --email you@example.com --name "Your Name"
   ```
   It refuses if an active Owner already exists. It first creates the platform roles and default role templates. The password is never an argument: on a terminal you are asked for it twice without echo; with `--link` (or without a terminal) it prints a one-time set-password link valid for 24 hours instead. If the only Owner is ever locked out: `npm run platform:create-owner -- --email you@example.com --reset-password [--link]`.
4. **Sign in** at `https://admin.<APP_DOMAIN>` (or `/platform` on any host) and create companies with **New company**. Each one gets its database, indexes, roles, default settings and an admin who is emailed a set-password link to `https://<key>.<APP_DOMAIN>`. If a step fails the company stays in `provisioning` with the error shown; fix the cause and create it again with the same key to resume. Companies are never deleted through the API: **Archive** blocks access and keeps the data.
5. **Add platform staff** under **Platform users** (e.g. Client Support).

### Registering companies that already have a database

For companies created before the platform console. Nothing is hardcoded; every value comes from the command line:

```bash
cd server
npm run platform:register-tenant -- --key acme --db acme_db --name "Acme Ltd"
npm run migrate:platform -- --source acme              # dry run: links its roles to the role templates
npm run migrate:platform -- --source acme --apply
npm run platform:sync-roles -- --tenant acme           # dry run, then add --apply
```

`register-tenant` only reads the company database (it must exist on `MONGODB_BASE_URI`'s cluster and hold data), refuses a key or database that is already registered, and records it `active` with every module on. `migrate:platform` needs `--source` (the company whose custom roles become shared templates) and only touches registered companies.

If you had platform users from before platform roles existed, run `npm run platform:migrate-users` (dry run; add `--apply`) once, after `npm run platform:seed`.

## Quick start (Docker)

```bash
git clone https://github.com/cherryonlipsofficial/LogiForce.git
cd LogiForce
cp .env.example .env        # set JWT_SECRET and PLATFORM_JWT_SECRET (openssl rand -hex 32)
docker-compose up --build
docker-compose exec server node src/platform/scripts/createPlatformOwner.js --email you@example.com --name "You" --link
```

`APP_DOMAIN` defaults to `localhost`, so the console is at `http://admin.localhost` and a company `acme` at `http://acme.localhost` (browsers resolve `*.localhost` to your machine). The API is at `http://localhost:5000/api`.

## Development setup (without Docker)

```bash
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

cp server/.env.example server/.env
# Set PLATFORM_MONGODB_URI, MONGODB_BASE_URI (e.g. mongodb://localhost:27017),
# APP_DOMAIN, JWT_SECRET, PLATFORM_JWT_SECRET.
# EMAIL_DEV_LOG=true logs sign-in codes and links to the console instead of sending email.

cd server && npm run platform:create-owner -- --email you@example.com --name "You" && cd ..
npm run dev            # server on :5000, client on :5173
```

Open `http://localhost:5173/platform`, create a company (say `acme`), then point the client at it for local work:

```bash
echo "VITE_DEV_TENANT=acme" >> client/.env.local
```

### Demo data

```bash
cd server
npm run seed:demo -- --tenant=acme
```

Fills one **existing, active** company with sample clients, suppliers, projects with contracts, drivers, and Feb–Apr 2026 attendance and salary data at different workflow stages, plus five demo users (one per business role) whose random passwords are printed once. It refuses to run with `NODE_ENV=production`, never creates the company or its roles (they come from provisioning), never deletes anything, and refuses a company that already has clients, suppliers, projects or drivers.

### Tests

```bash
cd server && npm test     # node:test, no database needed
```

## API documentation

All company endpoints are prefixed with `/api` and need a tenant key (see [Multi-tenancy](#multi-tenancy)); without one they return `400` before any auth or route logic runs. Protected routes also need `Authorization: Bearer <token>`.

### Auth (company)

| Method | Endpoint                | Description              | Auth     |
|--------|-------------------------|--------------------------|----------|
| POST   | /api/auth/register      | Register user            | Admin*   |
| POST   | /api/auth/login         | Login (rate limited)     | Public   |
| GET    | /api/auth/me            | Current user profile     | Required |
| PUT    | /api/auth/change-password | Change password        | Required |

### Platform (`/api/platform`, no tenant key)

Every route below the auth routes needs a platform token and the permission shown.

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| POST | /auth/login | Email + password → `challengeToken`; emails a 6-digit code | Public (rate limited) |
| POST | /auth/verify-otp | `challengeToken` + `code` → platform token and the user's permissions | Public (rate limited) |
| POST | /auth/resend-otp | New code (60 s apart, max 3) | Public (rate limited) |
| GET, POST | /auth/set-password[/:token] | Check / use a set-password link (works once, 24 h) | Public (rate limited) |
| GET | /auth/me | Current platform user, role and permissions | Platform token |
| GET | /tenants, /tenants/:key | Companies (`?status=&search=`), detail with admins | `platform.tenants.view` |
| POST | /tenants | Create: `{ key, name, contact?, adminName, adminEmail, enabledModules, roleTemplateKeys, limits? }` | `platform.tenants.create` |
| PATCH | /tenants/:key | `{ name?, contact?, limits?, allowSelfSignup? }` | `platform.tenants.edit` |
| PATCH | /tenants/:key | `{ enabledModules?, roleTemplateKeys? }` (then the role sync runs) | `platform.tenants.manage_modules` |
| POST | /tenants/:key/sync-roles | Re-run the role sync | `platform.tenants.manage_modules` |
| POST | /tenants/:key/suspend, /reactivate, /archive | `{ reason? }` | `platform.tenants.suspend` |
| POST | /tenants/:key/admins | `{ name, email }`: add a company admin, email a link | `platform.tenant_admins.invite` |
| POST | /tenants/:key/resend-invite | `{ email? }` | `platform.tenant_admins.resend_invite` |
| POST | /tenants/:key/admins/reset-password | `{ email }`: email a reset link | `platform.tenant_admins.reset_password` |
| GET | /role-templates | Templates and the companies using them | `platform.role_templates.view` |
| PATCH | /role-templates/:key | Edit; synced into every company using it | `platform.role_templates.manage` |
| GET | /users | Platform users | `platform.users.view` |
| POST | /users | `{ email, name, roleKey }`: invite | `platform.users.manage` |
| PATCH | /users/:id/role | `{ roleKey }` | `platform.users.manage` |
| POST | /users/:id/deactivate, /reactivate, /resend-invite | | `platform.users.manage` |
| GET | /roles | Platform roles and the permission catalogue | `platform.users.view` or `platform.roles.manage` |
| POST, PATCH, DELETE | /roles[/:key] | Create, edit, delete a platform role | `platform.roles.manage` |
| GET | /audit-logs, /audit-logs/actions | Paged; filters `action`, `targetType`, `targetKey`, `tenantKey`, `actor`, `from`, `to` | `platform.audit.view` |
| GET | /meta | Modules and the company permission catalogue | `platform.tenants.view` or `platform.role_templates.view` |

Tenant keys: a lowercase letter, then 2–30 lowercase letters, digits or hyphens (`/^[a-z][a-z0-9-]{2,30}$/`), and not reserved (`www`, `api`, `admin`, `app`, `platform`, `mail`, `static`, …). The database is `logiforce_<key>` (hyphens become underscores).

### Users and roles (company)

| Method | Endpoint                          | Description                                        | Permission |
|--------|-----------------------------------|----------------------------------------------------|------------|
| GET    | /api/roles, /api/roles/:id        | Roles, read-only (managed by LogiForce)            | roles.view |
| GET    | /api/roles/assignable             | Roles the caller may give someone: active, offered to the company (`Tenant.roleTemplateKeys`), and no permission the caller lacks | users.manage_access or users.create |
| GET    | /api/users/grantable-permissions  | Permissions the caller may grant through an override: within the company's enabled modules and held by the caller. Grants outside this list are refused | users.manage_access |
| PUT    | /api/users/:id/role, POST/DELETE /api/users/:id/permissions/override | Change a user's access | users.manage_access |

### Drivers

| Method | Endpoint                          | Description                  | Roles      |
|--------|-----------------------------------|------------------------------|------------|
| GET    | /api/drivers                      | List (paginated, searchable) | All        |
| POST   | /api/drivers                      | Create driver                | ops, admin |
| GET    | /api/drivers/:id                  | Get driver details           | All        |
| PUT    | /api/drivers/:id                  | Update driver                | ops, admin |
| DELETE | /api/drivers/:id                  | Soft delete (resign)         | admin      |
| GET    | /api/drivers/:id/ledger           | Financial ledger             | All        |
| GET    | /api/drivers/:id/salary-runs      | Salary run history           | All        |
| POST   | /api/drivers/:id/documents        | Upload document              | ops, admin |
| PUT    | /api/drivers/:id/status           | Change status                | ops, admin |
| GET    | /api/drivers/expiring-documents   | Expiring documents           | All        |

### Clients

| Method | Endpoint                   | Description           | Roles          |
|--------|----------------------------|-----------------------|----------------|
| GET    | /api/clients               | List all clients      | All            |
| POST   | /api/clients               | Create client         | admin          |
| GET    | /api/clients/:id           | Get with driver count | All            |
| PUT    | /api/clients/:id           | Update client         | admin          |
| GET    | /api/clients/:id/drivers   | Client's drivers      | All            |

### Suppliers

| Method | Endpoint              | Description          | Roles |
|--------|-----------------------|----------------------|-------|
| GET    | /api/suppliers        | List all suppliers   | admin |
| POST   | /api/suppliers        | Create supplier      | admin |
| GET    | /api/suppliers/:id    | Get supplier         | admin |
| PUT    | /api/suppliers/:id    | Update supplier      | admin |
| DELETE | /api/suppliers/:id    | Deactivate supplier  | admin |

### Attendance

| Method | Endpoint                                   | Description              | Roles             |
|--------|--------------------------------------------|--------------------------|--------------------|
| GET    | /api/attendance/batches                    | List batches             | All                |
| POST   | /api/attendance/upload                     | Upload attendance file   | ops, admin         |
| GET    | /api/attendance/batches/:id                | Batch details            | All                |
| PUT    | /api/attendance/batches/:id/approve        | Approve batch            | admin, accountant  |
| PUT    | /api/attendance/batches/:id/reject         | Reject batch             | admin, accountant  |
| GET    | /api/attendance/:driverId/:year/:month     | Driver attendance record | All                |
| PUT    | /api/attendance/records/:id/override       | Override record          | admin, accountant  |

### Salary

| Method | Endpoint                          | Description               | Roles             |
|--------|-----------------------------------|---------------------------|--------------------|
| POST   | /api/salary/run                   | Run payroll               | admin              |
| GET    | /api/salary/runs                  | List salary runs          | All                |
| GET    | /api/salary/runs/:id              | Run breakdown             | All                |
| PUT    | /api/salary/runs/:id/approve      | Approve run               | admin, accountant  |
| PUT    | /api/salary/runs/:id/adjust       | Manual adjustment         | admin, accountant  |
| POST   | /api/salary/runs/:id/dispute      | Raise dispute             | All                |
| GET    | /api/salary/wps-file              | Download WPS CSV          | admin, accountant  |

### Invoices

| Method | Endpoint                         | Description           | Roles             |
|--------|----------------------------------|-----------------------|--------------------|
| POST   | /api/invoices/generate           | Generate invoice      | admin, accountant  |
| GET    | /api/invoices                    | List invoices         | All                |
| GET    | /api/invoices/:id                | Invoice details       | All                |
| PUT    | /api/invoices/:id/status         | Update status         | admin, accountant  |
| POST   | /api/invoices/:id/credit-note    | Add credit note       | admin, accountant  |
| GET    | /api/invoices/:id/pdf            | Download PDF          | All                |

### Advances

| Method | Endpoint                     | Description           | Roles             |
|--------|------------------------------|-----------------------|--------------------|
| POST   | /api/advances                | Issue advance         | admin, accountant  |
| GET    | /api/advances                | List advances         | All                |
| PUT    | /api/advances/:id/recover    | Record recovery       | admin, accountant  |

### Reports

| Method | Endpoint                          | Description                    | Roles |
|--------|-----------------------------------|--------------------------------|-------|
| GET    | /api/reports/payroll-summary      | Payroll totals by client       | All   |
| GET    | /api/reports/invoice-aging        | Outstanding invoices by age    | All   |
| GET    | /api/reports/cost-per-driver      | Avg cost per driver per month  | All   |
| GET    | /api/reports/advance-outstanding  | Active advances outstanding    | All   |
| GET    | /api/reports/document-expiry      | Documents expiring in N days   | All   |

## Environment variables

| Variable | Description | Default |
|---|---|---|
| PLATFORM_MONGODB_URI | Platform database: companies, platform users and roles, role templates, audit log. May be the same cluster as the companies | (required) |
| PLATFORM_DB_NAME | Platform database name (never taken from the URI path) | logiforce_platform |
| MONGODB_BASE_URI | Cluster holding every company database (`MONGODB_BASE_URI/<dbName>`), without a database name | (required) |
| APP_DOMAIN | Companies are served at `https://<key>.<APP_DOMAIN>`, the console at `https://admin.<APP_DOMAIN>`; used for CORS and every invite/reset link | (required) |
| PLATFORM_CONSOLE_URL | Overrides where platform set-password links point | `https://admin.<APP_DOMAIN>` |
| TENANT_CACHE_TTL_MS | How long a server caches a company record | 60000 |
| JWT_SECRET / JWT_EXPIRES_IN | Company-user tokens | (required) / 7d |
| PLATFORM_JWT_SECRET / PLATFORM_JWT_EXPIRES_IN | Platform-staff tokens; 32+ characters, different from `JWT_SECRET` | (required) / 8h |
| PORT / NODE_ENV | | 5000 / development |
| CLIENT_URL | Extra allowed CORS origins, comma-separated (`*.<APP_DOMAIN>` and localhost are always allowed) | (empty) |
| RESEND_API_KEY / EMAIL_FROM | Transactional email (sign-in codes, invites, reset links) | (required unless `EMAIL_DEV_LOG=true`) |
| EMAIL_DEV_LOG | Log emails to the console instead of sending — local dev only | false |
| VITE_API_URL | API base URL (client build) | https://logiforce.onrender.com/api |
| VITE_APP_DOMAIN | Same as `APP_DOMAIN`, for the client build | (required in production) |
| VITE_DEV_TENANT | Company key the client sends on localhost or any host outside `VITE_APP_DOMAIN` | (none) |

There are no per-company variables.
