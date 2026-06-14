const bcrypt = require('bcryptjs');
const { query } = require('../db');

async function seed() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('employee', 'manager')),
      department TEXT NOT NULL,
      manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS leave_balances (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      annual INTEGER NOT NULL DEFAULT 15 CHECK (annual >= 0),
      sick INTEGER NOT NULL DEFAULT 10 CHECK (sick >= 0),
      family INTEGER NOT NULL DEFAULT 3 CHECK (family >= 0)
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('annual', 'sick', 'family')),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      days INTEGER NOT NULL CHECK (days > 0),
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at DATE NOT NULL DEFAULT CURRENT_DATE,
      manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      manager_comment TEXT NOT NULL DEFAULT ''
    );
  `);

  const managerPassword = bcrypt.hashSync('manager123', 10);
  const employeePassword = bcrypt.hashSync('employee123', 10);

  const manager = await query(
    `INSERT INTO users (name, email, password, role, department)
     VALUES ($1, $2, $3, 'manager', $4)
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name,
       password = EXCLUDED.password,
       role = EXCLUDED.role,
       department = EXCLUDED.department
     RETURNING id`,
    ['Sarah Mokoena', 'manager@company.com', managerPassword, 'IT']
  );
  const managerId = manager.rows[0].id;

  const employees = [
    ['Boitshoko Soomo', 'employee@company.com'],
    ['Thabo Nkosi', 'thabo@company.com'],
    ['Lerato Dlamini', 'lerato@company.com'],
  ];

  const employeeIds = [];
  for (const [name, email] of employees) {
    const employee = await query(
      `INSERT INTO users (name, email, password, role, department, manager_id)
       VALUES ($1, $2, $3, 'employee', 'IT', $4)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         password = EXCLUDED.password,
         role = EXCLUDED.role,
         department = EXCLUDED.department,
         manager_id = EXCLUDED.manager_id
       RETURNING id`,
      [name, email, employeePassword, managerId]
    );
    const employeeId = employee.rows[0].id;
    employeeIds.push(employeeId);
    await query(
      `INSERT INTO leave_balances (user_id, annual, sick, family)
       VALUES ($1, 15, 10, 3)
       ON CONFLICT (user_id) DO NOTHING`,
      [employeeId]
    );
  }

  await query(
    `INSERT INTO leave_requests (user_id, type, start_date, end_date, days, reason, status, created_at, manager_id, manager_comment)
     SELECT $1, 'annual', '2026-06-01', '2026-06-03', 3, 'Family vacation', 'approved', '2026-05-20', $2, 'Approved. Enjoy!'
     WHERE NOT EXISTS (SELECT 1 FROM leave_requests WHERE user_id = $1 AND start_date = '2026-06-01')`,
    [employeeIds[1], managerId]
  );

  await query(
    `INSERT INTO leave_requests (user_id, type, start_date, end_date, days, reason, status, created_at, manager_id, manager_comment)
     SELECT $1, 'sick', '2026-06-10', '2026-06-10', 1, 'Doctor appointment', 'pending', '2026-06-09', $2, ''
     WHERE NOT EXISTS (SELECT 1 FROM leave_requests WHERE user_id = $1 AND start_date = '2026-06-10')`,
    [employeeIds[2], managerId]
  );

  console.log('Database schema created and demo data seeded.');
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
