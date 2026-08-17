# School Management System — Backend

Node.js + Express + TypeScript API backed by MySQL (via Sequelize).

## Setup

1. Make sure MySQL is installed and running (Windows service `MySQL80`, or any MySQL 8 server).
2. Copy `.env.example` to `.env` and fill in your MySQL credentials (`DB_USER`, `DB_PASSWORD`).
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```

On startup the server will:
- Create the `school_management` database if it doesn't exist.
- Create all tables if they don't exist (`sequelize.sync()`). See `docs/schema.sql` for a readable reference of the resulting schema.
- Seed the default **Super Admin** (`admin@edu.com` / `admin123` by default — see `.env`).
- Seed a demo **Admin** (office/billing staff), demo student/teacher accounts, and the starter fee/item/class catalog.

The API is served at `http://127.0.0.1:8000/api/v1` by default — matching the frontend's default `VITE_API_URL`.

## Roles & access control

| Role | JWT slug | Can do |
|---|---|---|
| Super Admin | `super_admin` | Everything Admin can, plus financial analytics, daily cash reconciliation audit, and creating/granting the Super Admin role itself |
| Admin | `admin` | Student enrollment/registration, manual cash payment processing, inventory issuance, receipt generation, fee/subject/class catalog management |
| Teacher | `teacher` | Read-only access to class lists, students, fee/item/enrollment records |
| Student | `student` | Own fee records, issued items, class enrollments |

Demo logins (seeded automatically): `admin@edu.com` / `admin123` (Super Admin), `office@edu.com` / `office123` (Admin), `teacher@edu.com` / `teacher123`, `student@edu.com` / `student123`.

## API endpoints (v1)

```
POST   /api/v1/auth/login
GET    /api/v1/auth/me
GET    /api/v1/auth/health

GET    /api/v1/admin/users            (Admin+)
POST   /api/v1/admin/users            (Admin+)
PUT    /api/v1/admin/users/:id        (Admin+)
DELETE /api/v1/admin/users/:id        (Admin+)
POST   /api/v1/students/register      (Admin+)   — enrollment: creates the login + academic profile
GET    /api/v1/students/:id/profile   (Admin+)

GET    /api/v1/schema/subjects
POST   /api/v1/schema/subjects        (Admin+)
PUT    /api/v1/schema/subjects/:id    (Admin+)
DELETE /api/v1/schema/subjects/:id    (Admin+)

GET    /api/v1/fees/structures
POST   /api/v1/fees/structures        (Admin+)
DELETE /api/v1/fees/structures/:id    (Admin+)
GET    /api/v1/fees/records           (Admin+/Teacher)
GET    /api/v1/fees/me                (Student)
POST   /api/v1/fees/records           (Admin+)   — assign a fee to a student
POST   /api/v1/fees/records/:id/pay   (Admin+)

GET    /api/v1/items/records          (Admin+/Teacher)
GET    /api/v1/items/me               (Student)
POST   /api/v1/items/records          (Admin+)
DELETE /api/v1/items/records/:id      (Admin+)

GET    /api/v1/after-school-classes
POST   /api/v1/after-school-classes                       (Admin+)
DELETE /api/v1/after-school-classes/:id                    (Admin+)
GET    /api/v1/after-school-classes/enrollments            (Admin+/Teacher)
GET    /api/v1/after-school-classes/enrollments/me          (Student)
POST   /api/v1/after-school-classes/:id/enroll              (Student)
PUT    /api/v1/after-school-classes/enrollments/:id/status  (Admin+)

POST   /api/v1/payments/manual        (Admin+)   — the manual cash-payment pipeline (see below)
GET    /api/v1/transactions           (Admin+)   — fee-collection report

GET    /api/v1/superadmin/analytics/financial              (Super Admin only)
GET    /api/v1/superadmin/analytics/cash-reconciliation    (Super Admin only)
```

`(Admin+)` = accessible to both `Admin` and `Super Admin`.

## The manual payment pipeline

`POST /api/v1/payments/manual` (see `src/routes/payments.routes.ts`) is the single entry
point office/billing staff use to key in what was physically collected at the counter:

```json
{
  "studentEmail": "student@edu.com",
  "type": "Fee",                 // "Fee" | "Item" | "After-School Class"
  "referenceId": "3",            // fee_records.id / inventory_items.id / after_school_classes.id
  "amount": 3500,
  "paymentMode": "Cash",         // optional, defaults to "Cash"
  "notes": "optional note"
}
```

The whole operation runs inside one DB transaction (`sequelize.transaction()`), and every
branch ends by writing a `transactions` row — the receipt / audit trail that both the
fee-collection report and the Super Admin's cash-reconciliation audit read from.

- **`type: "Fee"`** — applies the cash to a `fee_records` balance (`Unpaid` → `Partial` →
  `Paid`). If the fee is an Admission or School Fee and this payment fully settles it, the
  student's account is reactivated (`status: 'Inactive' → 'Active'`) — this is the
  "unlocks access" step from the spec.
- **`type: "Item"`** — looks up the `inventory_items` row, refuses the sale with `409` if
  `stockQuantity` is too low, decrements stock, and creates an `item_records` issuance row.
- **`type: "After-School Class"`** — applies the cash as an installment against the
  student's `class_enrollments.amountPaid` (auto-creating the enrollment if the student
  hasn't self-enrolled yet), activating it once the balance is met.

## Scope

Covers the SRS's core workflows: auth, user/student management, fee catalog + per-student
billing, inventory + stock-aware issuance, after-school class enrollment + installments,
the manual payment pipeline, and Super Admin financial/cash-reconciliation reporting.

Not implemented here yet: chat, study resources, attendance uploads, assignment PDFs,
teacher grading (Report Card entry / Communication Book updates), and general admin
reports. The frontend automatically falls back to its built-in mock data for those, since
`apiRequest` is wrapped in try/catch throughout.
