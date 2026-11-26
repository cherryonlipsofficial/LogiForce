# LogiForce — Workforce Management Platform

Driver payroll, attendance, invoicing, and fleet operations for UAE/GCC logistics companies.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────────────────┐
│  React SPA  │────▶│  Express API │────▶│ MongoDB (per tenant)  │
│  (Vite)     │     │  (Node 20)   │     │ logi-force / clienta  │
│  Port 80    │     │  Port 5000   │     │ clientb / clientc     │
└─────────────┘     └──────────────┘     └───────────────────────┘
     nginx           REST + JWT               Mongoose (multi-tenant)
```

- **Client**: React 19, Vite, React Query, React Router 6, Recharts
- **Server**: Express 4, Mongoose 8, JWT auth, express-validator, Morgan, Winston
- **Database**: MongoDB, one database per tenant (Users, Drivers, Clients, Suppliers, Attendance, Salary, Invoices, Advances, Ledger, Documents, AuditLog, and more — see `server/src/models`)

### Multi-tenancy

This is a multi-tenant app: every `/api` request is routed to one of several separate MongoDB databases based on a tenant key, resolved by `server/src/middleware/tenant.js`. Companies (tenants) are registered in the platform database (`tenants` collection, `server/src/platform/models/Tenant.js`) and looked up by `server/src/config/tenants.js`, which caches each record in memory for `TENANT_CACHE_TTL_MS` (default 1 minute; unknown keys for 10 seconds). Only companies with status `active` are served, and only they run the nightly jobs.

- **Tenant resolution** — the server reads the tenant key from the `x-tenant-id` request header first. If that's absent, it falls back to the subdomain of the `Origin`/`Referer` header (e.g. `clienta.logiforce.app` → tenant `clienta`). If neither resolves to a known tenant, the request is rejected before it reaches any route handler — `400 Tenant could not be determined` with no header, `404 Unknown tenant` for an unrecognized key, `403 Account suspended` (`code: TENANT_SUSPENDED`) for a company whose status isn't `active`, and `503 Service temporarily unavailable` if the platform database can't be read and the company isn't cached.
- **The client sets this automatically** — `client/src/api/axiosInstance.js` attaches `x-tenant-id` to every request, derived from the hostname (or `VITE_TENANT_ID` / a hardcoded `logi-force` default on localhost). You don't need to do anything for the bundled React app to work.
- **Calling the API directly** (curl, Postman, tests) — you must set the header yourself, or every call fails at the tenant-resolution step:
  ```bash
  curl http://localhost:5000/api/drivers \
    -H "x-tenant-id: logi-force" \
    -H "Authorization: Bearer <token>"
  ```
- **Four tenants are registered** (by `npm run platform:seed`, from `server/src/platform/scripts/legacyTenants.js`; each record stores the env var its URI comes from, or none to use `MONGODB_BASE_URI` + its database name): `logi-force` (falls back to `MONGODB_URI` if `MONGODB_URI_MAIN` isn't set), plus `clienta`, `clientb`, `clientc`, each requiring its own `MONGODB_URI_CLIENTA` / `MONGODB_URI_CLIENTB` / `MONGODB_URI_CLIENTC` (or a shared `MONGODB_BASE_URI` the app derives per-tenant database names from). `docker-compose.yml` sets all four connection strings by default, each pointing at its own database on the same local `mongo` container, so all four tenants work out of the box with `docker-compose up` — useful for exercising tenant isolation (data created under one `x-tenant-id` never appears under another). Running the server without Docker (`npm run dev`)? Only `logi-force` is wired up unless you also set `MONGODB_URI_CLIENTA` / `_CLIENTB` / `_CLIENTC` (or `MONGODB_BASE_URI`) in `server/.env` — that's sufficient to run and test the full app.

## Prerequisites

- Node.js 20+
- MongoDB 7+
- Docker & Docker Compose (for containerized setup)

## Quick Start

```bash
git clone https://github.com/cherryonlipsofficial/LogiForce.git
cd LogiForce
cp .env.example .env        # edit with your values
docker-compose up --build
```

App available at `http://localhost`, API at `http://localhost:5000/api`.

## Development Setup (without Docker)

```bash
# Install dependencies
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

# Configure environment
cp server/.env.example server/.env
# Edit server/.env — set MONGODB_URI to your local MongoDB
# Set EMAIL_DEV_LOG=true to log OTP/reset codes to the console instead of
# sending real email (skips the RESEND_API_KEY / verified-domain requirement)

# Seed test data
cd server && npm run seed && cd ..

# Start dev servers (concurrent)
npm run dev

# Server tests (no database needed)
cd server && npm test && cd ..
```

- Server runs on `http://localhost:5000`
- Client runs on `http://localhost:5173`

### Default Login Credentials

| Role       | Email                     | Password     |
|------------|---------------------------|--------------|
| Admin      | admin@logiforce.com       | Admin@123    |
| Accountant | accountant@logiforce.com  | Account@123  |
| Ops        | ops@logiforce.com         | Ops@123      |
| Compliance | compliance@logiforce.com  | Compliance@123 |
| Sales      | sales@logiforce.com       | Sales@123    |
| Viewer     | viewer@logiforce.com      | Viewer@123   |

The seeded accountant also carries a one-off `drivers.create` permission override on top of their role, useful for testing permission-override behavior.

## API Documentation

All endpoints are prefixed with `/api` and require an `x-tenant-id` header (see [Multi-tenancy](#multi-tenancy)) — omitting it returns `400` before any auth or route logic runs. Protected routes additionally require `Authorization: Bearer <token>`. A token only works for the company it was issued for: one obtained with `x-tenant-id: clienta` gets `401 Token is not valid for this company` on every other company.

### Auth

| Method | Endpoint                | Description              | Auth     |
|--------|-------------------------|--------------------------|----------|
| POST   | /api/auth/register      | Register user            | Admin*   |
| POST   | /api/auth/login         | Login (rate limited)     | Public   |
| GET    | /api/auth/me            | Current user profile     | Required |
| PUT    | /api/auth/change-password | Change password        | Required |

### Platform (product owner)

Routes for LogiForce staff, not company users. They live under `/api/platform`, need **no** `x-tenant-id`, and use their own token (signed with `PLATFORM_JWT_SECRET`), which tenant routes reject — and tenant tokens are rejected here.

| Method | Endpoint                         | Description                                              | Auth           |
|--------|----------------------------------|----------------------------------------------------------|----------------|
| POST   | /api/platform/auth/login         | Email + password → `challengeToken`; emails a 6-digit code | Public (rate limited) |
| POST   | /api/platform/auth/verify-otp    | `challengeToken` + `code` → platform token               | Public (rate limited) |
| POST   | /api/platform/auth/resend-otp    | New code for an open challenge (60 s apart, max 3)       | Public (rate limited) |
| GET    | /api/platform/auth/me            | Current platform user                                    | Platform token |
| GET    | /api/platform/auth/set-password/:token | Check a set-password link (invited platform user)  | Public (rate limited) |
| POST   | /api/platform/auth/set-password  | `token` + `password` (12+ chars) → password set; the link works once | Public (rate limited) |
| POST   | /api/platform/tenants            | Provision a company: `{ key, name, adminName, adminEmail, enabledModules, roleTemplateKeys }`. Creates the record, its database indexes, roles (always `tenant_admin`), blank company settings and the admin user, and emails the admin a set-password link to `https://<key>.logiforce.app`. On failure the company is `failed` with `provisioningError`; send the same request again to resume | Platform owner |
| POST   | /api/platform/tenants/:key/resend-invite | New set-password link for the company admin (`{ email }` optional; defaults to the admin from provisioning) | Platform owner |
| GET    | /api/platform/tenants            | Companies (`?status=` `&search=` on key or name), newest first | Owner or support |
| GET    | /api/platform/tenants/:key       | Company detail, with its admins read from its own database | Owner or support |
| PATCH  | /api/platform/tenants/:key       | `{ name?, enabledModules?, roleTemplateKeys? }` (`tenant_admin` is always kept). Audited as `tenant.update`; a module or role change then runs the role sync and returns its result as `roleSync` | Platform owner |
| POST   | /api/platform/tenants/:key/suspend, /reactivate | `{ reason? }`. active ↔ suspended; audited as `tenant.suspend` / `tenant.reactivate` | Platform owner |
| POST   | /api/platform/tenants/:key/sync-roles | Run the role sync again (e.g. after it failed) | Platform owner |
| GET    | /api/platform/role-templates     | Every role template, with the companies that use it | Owner or support |
| PATCH  | /api/platform/role-templates/:key | `{ displayName?, description?, permissions?, assignableByTenant?, version? }`. Audited as `roleTemplate.update`, then synced into every company using it (`sync: { ok, failed }`). A stale `version` → 409 `TEMPLATE_STALE` | Platform owner |
| GET    | /api/platform/audit-logs         | Paged (`page`, `limit` ≤ 100), filters `action`, `targetType`, `targetKey`, `actor`, `from`, `to` | Owner or support |
| GET    | /api/platform/audit-logs/actions | Distinct actions and target types, for the filter | Owner or support |
| GET    | /api/platform/meta               | Modules, core modules and the permission catalogue (no platform-only keys) | Owner or support |

The **platform console** is the web UI for these, at `/platform` in the client app and at `https://admin.logiforce.app` (a reserved subdomain: every path there opens the console). It has its own login (password + emailed code), keeps its token under `platformToken` in local storage, and never sends `x-tenant-id`; signing in or out of it doesn't affect a company login in the same browser. Set `PLATFORM_CONSOLE_URL=https://admin.logiforce.app` so set-password links open it.

Tenant keys are the subdomain: 3–31 lowercase letters, digits or hyphens, not starting or ending with a hyphen, and not one of `RESERVED_TENANT_KEYS` (`server/src/platform/models/Tenant.js`). Each new company needs a DNS record for `<key>.logiforce.app` (a wildcard `*.logiforce.app` covers them all).

Create the first platform owner, or reset a platform user's password (the password is asked for without echo; when stdin isn't a terminal it is read from `PLATFORM_OWNER_PASSWORD`). A reset signs out every existing session of that user.

```bash
cd server
npm run platform:create-owner -- --email you@example.com --name "Your Name"
npm run platform:create-owner -- --email you@example.com --reset-password
```

Move the existing companies onto the platform (dry run by default; prints every change and an unmatched-roles report, writes nothing). See the header of `server/src/scripts/migrateToPlatform.js` for exactly what it does:

```bash
cd server
npm run migrate:platform                                  # dry run
npm run migrate:platform -- --csv unmatched-roles.csv     # dry run + report as CSV
npm run migrate:platform -- --apply                       # make the changes
```

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

## Seeding

`npm run platform:seed` creates any missing role template but leaves existing ones alone, since they're edited in the platform console (it prints a note for any that differ from the code defaults). `npm run platform:seed -- --reset-templates` puts them back to the code defaults; run `npm run platform:sync-roles` afterwards to copy them into the companies.

```bash
cd server
npm run seed
```

Seeds the database at `MONGODB_URI` (the `logi-force` tenant's database unless `MONGODB_URI_MAIN` or `MONGODB_BASE_URI` points it elsewhere), replacing any existing users, roles, clients, suppliers, projects, drivers, attendance, salary runs and driver ledger entries, with 6 users, 3 clients, 3 suppliers, 6 projects with contracts, 21 drivers assigned to 4 of those projects, and Feb–Apr 2026 attendance + salary data at different workflow stages:

| Period   | Attendance batches                  | Salary runs                          |
|----------|-------------------------------------|--------------------------------------|
| Feb 2026 | Approved by Sales + Ops, processed  | Processed and paid (ledger credited) |
| Mar 2026 | Approved by Sales + Ops, processed  | Draft, awaiting Operations approval  |
| Apr 2026 | Pending Sales + Ops review          | Not run yet                          |

## Environment Variables

| Variable            | Description                    | Default                          |
|---------------------|---------------------------------|----------------------------------|
| MONGODB_URI         | Connection string for the `logi-force` tenant (fallback if `MONGODB_URI_MAIN` is unset) | mongodb://mongo:27017/logiforce  |
| MONGODB_URI_MAIN    | Explicit connection string for the `logi-force` tenant | (optional — falls back to `MONGODB_URI`) |
| MONGODB_URI_CLIENTA | Connection string for the `clienta` tenant | (required to use that tenant, unless `MONGODB_BASE_URI` is set) |
| MONGODB_URI_CLIENTB | Connection string for the `clientb` tenant | (required to use that tenant, unless `MONGODB_BASE_URI` is set) |
| MONGODB_URI_CLIENTC | Connection string for the `clientc` tenant | (required to use that tenant, unless `MONGODB_BASE_URI` is set) |
| MONGODB_BASE_URI    | Shared Atlas base URI — per-tenant database name is appended automatically for any tenant without its own explicit URI above | (optional) |
| TENANT_CACHE_TTL_MS | How long (ms) a server caches each company's platform record; a change such as a suspension reaches a running server within this time | 60000 |
| PLATFORM_MONGODB_URI | Connection string for the platform (product-owner) database: tenant registry, role templates, platform users, platform audit log. May be the same cluster as the tenants | (required — server exits on startup without it) |
| PLATFORM_DB_NAME    | Platform database name (always passed explicitly, never taken from the URI path) | logiforce_platform |
| PLATFORM_OWNER_EMAIL / PLATFORM_OWNER_NAME / PLATFORM_OWNER_PASSWORD | First platform owner, created by `npm run platform:seed` if the email doesn't exist yet. Password ≥ 12 chars; an existing account is never changed. `npm run platform:create-owner` also reads `PLATFORM_OWNER_PASSWORD` when stdin isn't a terminal | (optional — read only by those scripts) |
| PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_NAME | Your platform account, created by `npm run migrate:platform` without a password; you get an emailed set-password link | (optional — read only by that script) |
| PLATFORM_CONSOLE_URL | Base URL of the platform console (e.g. `https://admin.logiforce.app`); set-password links go to `<PLATFORM_CONSOLE_URL>/set-password/<token>`, which the console redirects to `/platform/set-password/<token>` | (required when a platform set-password link is sent) |
| PLATFORM_JWT_SECRET | Signs platform (product-owner) login tokens. At least 32 characters and different from `JWT_SECRET` (`openssl rand -hex 32`); changing it signs out every platform session | (required — server exits on startup without it) |
| PLATFORM_JWT_EXPIRES_IN | Platform token lifetime | 8h |
| PORT                | Server port                    | 5000                             |
| JWT_SECRET          | JWT signing secret             | (required)                       |
| JWT_EXPIRES_IN      | JWT token expiry               | 7d                               |
| NODE_ENV            | Environment                    | development                      |
| CLIENT_URL          | Allowed CORS origin(s), comma-separated | http://localhost                  |
| RESEND_API_KEY      | API key for transactional email (OTP, password reset) | (required unless `EMAIL_DEV_LOG=true`) |
| EMAIL_FROM          | From header for outgoing email | LogiForce \<onboarding@resend.dev\> |
| EMAIL_DEV_LOG       | Log OTP/reset emails to the server console instead of sending — local dev only, never enable in production | false |
| VITE_API_URL        | API base URL (client)          | http://localhost:5000/api        |
| VITE_TENANT_ID      | Tenant key the client sends as `x-tenant-id` when the hostname isn't a `*.logiforce.app` subdomain (e.g. localhost) | logi-force |
