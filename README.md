# LeaveFlow - Employee Leave Management System

LeaveFlow is a full-stack leave management system for employees and managers. It demonstrates a practical HR workflow with authentication, role-based access, leave balance checks, manager approvals, and reporting.

## Current Stack

- **Frontend:** Next.js, React, CSS
- **Backend:** Node.js, Express.js, REST API
- **Auth:** JWT authentication with role-based access control
- **Storage:** JSON file persistence through `db.json`
- **Security:** bcrypt password hashing

## Features

### Employee

- Login with role-based access
- View annual, sick, and family responsibility leave balances
- Apply for leave with date and balance validation
- View leave request history
- Cancel pending leave requests

### Manager

- View team leave requests
- Approve or reject pending requests with comments
- Add employees after recruitment
- Edit employee details and leave balances
- Delete employees who leave the team
- View team leave balances
- Review department reports by request status, leave type, and employee usage

## Getting Started

Install dependencies:

```bash
npm install
```

Run the Express API:

```bash
npm run server
```

Run the Next.js app in a second terminal:

```bash
npm run dev
```

Open http://localhost:3000.

## Production Build

Build the Next.js frontend:

```bash
npm run build
```

Start Next.js:

```bash
npm start
```

Run the Express API separately with `npm run server`. During local development, Next.js proxies `/api/*` requests to `http://localhost:3001/api/*`.

## Demo Credentials

| Role     | Email               | Password    |
|----------|---------------------|-------------|
| Manager  | manager@company.com | manager123  |
| Employee | employee@company.com | employee123 |

## Project Structure

```text
leave-system/
|-- server.js          # Express API and JSON persistence
|-- next.config.js     # Next.js config and API rewrite
|-- app/
|   |-- layout.jsx     # Root layout and global CSS import
|   |-- page.jsx       # Home route that renders the app
|   `-- globals.css    # Application styling
|-- src/
|   |-- App.jsx        # React application views and state
|-- public/
|-- package.json
`-- README.md
```

## API Endpoints

| Method | Endpoint         | Auth     | Description                 |
|--------|------------------|----------|-----------------------------|
| POST   | `/api/login`     | None     | Login and receive JWT token |
| GET    | `/api/me`        | Any      | Get current user profile    |
| GET    | `/api/balance`   | Employee | Get leave balances          |
| GET    | `/api/leaves`    | Any      | Get leave requests          |
| POST   | `/api/leaves`    | Employee | Submit a leave request      |
| PUT    | `/api/leaves/:id` | Manager | Approve or reject a request |
| DELETE | `/api/leaves/:id` | Employee | Cancel a pending request    |
| GET    | `/api/employees` | Manager  | Get managed employees       |
| POST   | `/api/employees` | Manager  | Add a new employee          |
| PUT    | `/api/employees/:id` | Manager | Edit an employee            |
| DELETE | `/api/employees/:id` | Manager | Delete an employee          |
| GET    | `/api/reports`   | Manager  | Get department reports      |

## Recommended Improvements

These are the highest-impact next steps to raise the project toward full-stack developer portfolio standard:

1. **Move backend logic out of `server.js`**
   Split routes, middleware, services, and database access into separate modules. This makes the backend easier to test and explain in interviews.

2. **Replace JSON storage with a real database**
   Use PostgreSQL or MySQL with Prisma/Drizzle/Knex. This will demonstrate schema design, migrations, relations, and safer data integrity.

3. **Add validation and tests**
   Add request validation with Zod/Joi and automated API tests with Jest, Vitest, or Supertest.

4. **Improve auth configuration**
   Move `JWT_SECRET`, port, and CORS origin into `.env`. Add refresh-token or session expiry handling later if needed.

5. **Use Next.js structure more deeply**
   Split `src/App.jsx` into `components/`, `app/(employee)`, `app/(manager)`, `hooks/`, and `lib/api.js` once the UI grows.

6. **Add HR/admin workflows**
   Add employee creation, manager assignment, leave policy configuration, public holidays, and annual leave accrual.

7. **Add deployment readiness**
   Add environment examples, build instructions, seed scripts, and a deployment target such as Render, Railway, Fly.io, or Azure.

## Author

Boitshoko Soomo | github.com/BoitshokoSoomo
