# LogiForce — Workforce Management Platform

Driver payroll, attendance, invoicing, and fleet operations for UAE/GCC logistics companies.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────┐
│  React SPA  │────▶│  Express API │────▶│ MongoDB  │
│  (Vite)     │     │  (Node 20)   │     │  (v7+)   │
│  Port 80    │     │  Port 5000   │     │  27017   │
└─────────────┘     └──────────────┘     └──────────┘
     nginx           REST + JWT            Mongoose
```

- **Client**: React 19, Vite, React Query, React Router 6, Recharts
- **Server**: Express 4, Mongoose 8, JWT auth, express-validator, Morgan, Winston
- **Database**: MongoDB with 12 collections (Users, Drivers, Clients, Suppliers, Attendance, Salary, Invoices, Advances, Ledger, Documents, AuditLog)

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

| Role       | Email                     | Password    |
|------------|---------------------------|-------------|
| Admin      | admin@logiforce.com       | Admin@123   |
| Accountant | accountant@logiforce.com  | Account@123 |
| Ops        | ops@logiforce.com         | Ops@1234    |

## API Documentation

All endpoints are prefixed with `/api`. Protected routes require `Authorization: Bearer <token>`.

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

| Variable       | Description                    | Default                          |
|----------------|--------------------------------|----------------------------------|
| MONGODB_URI    | MongoDB connection string      | mongodb://mongo:27017/logiforce  |
| PORT           | Server port                    | 5000                             |
| JWT_SECRET     | JWT signing secret             | (required)                       |
| JWT_EXPIRES_IN | JWT token expiry               | 7d                               |
| NODE_ENV       | Environment                    | development                      |
| CLIENT_URL     | Allowed CORS origin            | http://localhost                  |
| VITE_API_URL   | API base URL (client)          | http://localhost:5000/api        |
