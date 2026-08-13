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

This is a multi-tenant app: every `/api` request is routed to one of several separate MongoDB databases based on a tenant key, resolved by `server/src/middleware/tenant.js`. The registry of tenants lives in `server/src/config/tenants.js`.

- **Tenant resolution** — the server reads the tenant key from the `x-tenant-id` request header first. If that's absent, it falls back to the subdomain of the `Origin`/`Referer` header (e.g. `clienta.logiforce.app` → tenant `clienta`). If neither resolves to a known tenant, the request is rejected before it reaches any route handler — `400 Tenant could not be determined` with no header, `404 Unknown tenant` for an unrecognized key.
- **The client sets this automatically** — `client/src/api/axiosInstance.js` attaches `x-tenant-id` to every request, derived from the hostname (or `VITE_TENANT_ID` / a hardcoded `logi-force` default on localhost). You don't need to do anything for the bundled React app to work.
- **Calling the API directly** (curl, Postman, tests) — you must set the header yourself, or every call fails at the tenant-resolution step:
  ```bash
  curl http://localhost:5000/api/drivers \
    -H "x-tenant-id: logi-force" \
    -H "Authorization: Bearer <token>"
  ```
- **Four tenants are registered**: `logi-force` (falls back to `MONGODB_URI` if `MONGODB_URI_MAIN` isn't set — this is the one local dev uses), plus `clienta`, `clientb`, `clientc`, each requiring its own `MONGODB_URI_CLIENTA` / `MONGODB_URI_CLIENTB` / `MONGODB_URI_CLIENTC` (or a shared `MONGODB_BASE_URI` the app derives per-tenant database names from). Locally, only `logi-force` is usable unless you configure the other three — that's sufficient to run and test the full app.

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
cp .env.example server/.env
# Edit server/.env — set MONGODB_URI to your local MongoDB

# Seed test data
cd server && npm run seed && cd ..

# Start dev servers (concurrent)
npm run dev
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

All endpoints are prefixed with `/api` and require an `x-tenant-id` header (see [Multi-tenancy](#multi-tenancy)) — omitting it returns `400` before any auth or route logic runs. Protected routes additionally require `Authorization: Bearer <token>`.

### Auth

| Method | Endpoint                | Description              | Auth     |
|--------|-------------------------|--------------------------|----------|
| POST   | /api/auth/register      | Register user            | Admin*   |
| POST   | /api/auth/login         | Login (rate limited)     | Public   |
| GET    | /api/auth/me            | Current user profile     | Required |
| PUT    | /api/auth/change-password | Change password        | Required |

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

```bash
cd server
npm run seed
```

Creates 3 users, 3 clients, 3 suppliers, 20 drivers, and 3 months of attendance + salary data.

## Environment Variables

| Variable            | Description                    | Default                          |
|---------------------|---------------------------------|----------------------------------|
| MONGODB_URI         | Connection string for the `logi-force` tenant (fallback if `MONGODB_URI_MAIN` is unset) | mongodb://mongo:27017/logiforce  |
| MONGODB_URI_MAIN    | Explicit connection string for the `logi-force` tenant | (optional — falls back to `MONGODB_URI`) |
| MONGODB_URI_CLIENTA | Connection string for the `clienta` tenant | (required to use that tenant, unless `MONGODB_BASE_URI` is set) |
| MONGODB_URI_CLIENTB | Connection string for the `clientb` tenant | (required to use that tenant, unless `MONGODB_BASE_URI` is set) |
| MONGODB_URI_CLIENTC | Connection string for the `clientc` tenant | (required to use that tenant, unless `MONGODB_BASE_URI` is set) |
| MONGODB_BASE_URI    | Shared Atlas base URI — per-tenant database name is appended automatically for any tenant without its own explicit URI above | (optional) |
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
