require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { query, withTransaction } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'leave_system_secret_2026';
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
  res.json({ name: 'LeaveFlow API', status: 'ok' });
});

app.get('/api/health', async (req, res) => {
  await query('SELECT 1');
  res.json({ status: 'ok' });
});

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function parseLeaveBalance(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    department: row.department,
    managerId: row.manager_id,
  };
}

function toBalance(row) {
  return {
    userId: row?.user_id,
    annual: row?.annual ?? 0,
    sick: row?.sick ?? 0,
    family: row?.family ?? 0,
  };
}

function toLeave(row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    startDate: row.start_date?.toISOString?.().split('T')[0] || row.start_date,
    endDate: row.end_date?.toISOString?.().split('T')[0] || row.end_date,
    days: row.days,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at?.toISOString?.().split('T')[0] || row.created_at,
    managerId: row.manager_id,
    managerComment: row.manager_comment || '',
    employeeName: row.employee_name,
    department: row.department,
  };
}

function asyncRoute(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function managerOnly(req, res, next) {
  if (req.user.role !== 'manager') return res.status(403).json({ error: 'Managers only' });
  next();
}

app.post('/api/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  const result = await query('SELECT * FROM users WHERE email = $1', [normalizeEmail(email)]);
  const user = result.rows[0];

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: toUser(user) });
}));

app.get('/api/me', auth, asyncRoute(async (req, res) => {
  const userResult = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = userResult.rows[0];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const balanceResult = await query('SELECT * FROM leave_balances WHERE user_id = $1', [req.user.id]);
  res.json({ ...toUser(user), balance: toBalance(balanceResult.rows[0]) });
}));

app.get('/api/employees', auth, managerOnly, asyncRoute(async (req, res) => {
  const result = await query(
    `SELECT u.*, b.user_id, b.annual, b.sick, b.family
     FROM users u
     LEFT JOIN leave_balances b ON b.user_id = u.id
     WHERE u.role = 'employee' AND u.manager_id = $1
     ORDER BY u.name`,
    [req.user.id]
  );

  res.json(result.rows.map((row) => ({
    ...toUser(row),
    balance: toBalance(row),
  })));
}));

app.post('/api/employees', auth, managerOnly, asyncRoute(async (req, res) => {
  const { name, email, password, department, balance = {} } = req.body;
  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);
  const cleanDepartment = String(department || '').trim();

  if (!cleanName || !cleanEmail || !password || !cleanDepartment) {
    return res.status(400).json({ error: 'Name, email, password, and department are required' });
  }

  const employee = await withTransaction(async (client) => {
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (existing.rows.length) {
      const error = new Error('Email already exists');
      error.status = 409;
      throw error;
    }

    const userResult = await client.query(
      `INSERT INTO users (name, email, password, role, department, manager_id)
       VALUES ($1, $2, $3, 'employee', $4, $5)
       RETURNING *`,
      [cleanName, cleanEmail, bcrypt.hashSync(password, 10), cleanDepartment, req.user.id]
    );

    const user = userResult.rows[0];
    const balanceResult = await client.query(
      `INSERT INTO leave_balances (user_id, annual, sick, family)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        user.id,
        parseLeaveBalance(balance.annual, 15),
        parseLeaveBalance(balance.sick, 10),
        parseLeaveBalance(balance.family, 3),
      ]
    );

    return { ...toUser(user), balance: toBalance(balanceResult.rows[0]) };
  });

  res.status(201).json(employee);
}));

app.put('/api/employees/:id', auth, managerOnly, asyncRoute(async (req, res) => {
  const employeeId = parseInt(req.params.id);
  const { name, email, password, department, balance = {} } = req.body;
  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);
  const cleanDepartment = String(department || '').trim();

  if (!cleanName || !cleanEmail || !cleanDepartment) {
    return res.status(400).json({ error: 'Name, email, and department are required' });
  }

  const employee = await withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT id FROM users WHERE email = $1 AND id <> $2`,
      [cleanEmail, employeeId]
    );
    if (existing.rows.length) {
      const error = new Error('Email already exists');
      error.status = 409;
      throw error;
    }

    const current = await client.query(
      `SELECT * FROM users WHERE id = $1 AND role = 'employee' AND manager_id = $2`,
      [employeeId, req.user.id]
    );
    if (!current.rows.length) {
      const error = new Error('Employee not found');
      error.status = 404;
      throw error;
    }

    const passwordSql = password ? ', password = $5' : '';
    const params = password
      ? [cleanName, cleanEmail, cleanDepartment, employeeId, bcrypt.hashSync(password, 10)]
      : [cleanName, cleanEmail, cleanDepartment, employeeId];

    const userResult = await client.query(
      `UPDATE users
       SET name = $1, email = $2, department = $3${passwordSql}
       WHERE id = $4
       RETURNING *`,
      params
    );

    const existingBalance = await client.query('SELECT * FROM leave_balances WHERE user_id = $1', [employeeId]);
    const currentBalance = toBalance(existingBalance.rows[0]);
    const balanceResult = await client.query(
      `INSERT INTO leave_balances (user_id, annual, sick, family)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         annual = EXCLUDED.annual,
         sick = EXCLUDED.sick,
         family = EXCLUDED.family
       RETURNING *`,
      [
        employeeId,
        parseLeaveBalance(balance.annual, currentBalance.annual),
        parseLeaveBalance(balance.sick, currentBalance.sick),
        parseLeaveBalance(balance.family, currentBalance.family),
      ]
    );

    return { ...toUser(userResult.rows[0]), balance: toBalance(balanceResult.rows[0]) };
  });

  res.json(employee);
}));

app.delete('/api/employees/:id', auth, managerOnly, asyncRoute(async (req, res) => {
  const employeeId = parseInt(req.params.id);
  const result = await query(
    `DELETE FROM users
     WHERE id = $1 AND role = 'employee' AND manager_id = $2
     RETURNING id`,
    [employeeId, req.user.id]
  );

  if (!result.rows.length) return res.status(404).json({ error: 'Employee not found' });
  res.json({ message: 'Employee deleted' });
}));

app.get('/api/balance', auth, asyncRoute(async (req, res) => {
  const result = await query('SELECT * FROM leave_balances WHERE user_id = $1', [req.user.id]);
  res.json(toBalance(result.rows[0]));
}));

app.get('/api/leaves', auth, asyncRoute(async (req, res) => {
  let result;
  if (req.user.role === 'manager') {
    result = await query(
      `SELECT r.*, u.name AS employee_name, u.department
       FROM leave_requests r
       JOIN users u ON u.id = r.user_id
       WHERE u.manager_id = $1
       ORDER BY r.created_at DESC, r.id DESC`,
      [req.user.id]
    );
  } else {
    result = await query(
      `SELECT * FROM leave_requests
       WHERE user_id = $1
       ORDER BY created_at DESC, id DESC`,
      [req.user.id]
    );
  }
  res.json(result.rows.map(toLeave));
}));

app.post('/api/leaves', auth, asyncRoute(async (req, res) => {
  if (req.user.role !== 'employee') return res.status(403).json({ error: 'Employees only' });

  const { type, startDate, endDate, reason } = req.body;
  if (!type || !startDate || !endDate || !reason) return res.status(400).json({ error: 'All fields required' });
  if (!['annual', 'sick', 'family'].includes(type)) return res.status(400).json({ error: 'Invalid leave type' });

  const days = Math.round((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
  if (days <= 0) return res.status(400).json({ error: 'End date must be after start date' });

  const created = await withTransaction(async (client) => {
    const balanceResult = await client.query('SELECT * FROM leave_balances WHERE user_id = $1', [req.user.id]);
    const balance = balanceResult.rows[0];
    if (!balance) {
      const error = new Error('Leave balance not found');
      error.status = 400;
      throw error;
    }
    if (balance[type] < days) {
      const error = new Error(`Insufficient ${type} leave balance`);
      error.status = 400;
      throw error;
    }

    const userResult = await client.query('SELECT manager_id FROM users WHERE id = $1', [req.user.id]);
    const result = await client.query(
      `INSERT INTO leave_requests (user_id, type, start_date, end_date, days, reason, status, manager_id, manager_comment)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, '')
       RETURNING *`,
      [req.user.id, type, startDate, endDate, days, reason, userResult.rows[0]?.manager_id]
    );
    return toLeave(result.rows[0]);
  });

  res.status(201).json(created);
}));

app.put('/api/leaves/:id', auth, managerOnly, asyncRoute(async (req, res) => {
  const requestId = parseInt(req.params.id);
  const { status, managerComment } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid request status' });

  const updated = await withTransaction(async (client) => {
    const requestResult = await client.query(
      `SELECT r.*
       FROM leave_requests r
       JOIN users u ON u.id = r.user_id
       WHERE r.id = $1 AND u.manager_id = $2`,
      [requestId, req.user.id]
    );
    const request = requestResult.rows[0];
    if (!request) {
      const error = new Error('Request not found');
      error.status = 404;
      throw error;
    }
    if (request.status !== 'pending') {
      const error = new Error('Already processed');
      error.status = 400;
      throw error;
    }

    if (status === 'approved') {
      const balanceResult = await client.query('SELECT * FROM leave_balances WHERE user_id = $1 FOR UPDATE', [request.user_id]);
      const balance = balanceResult.rows[0];
      if (!balance) {
        const error = new Error('Leave balance not found');
        error.status = 400;
        throw error;
      }
      if (balance[request.type] < request.days) {
        const error = new Error(`Insufficient ${request.type} leave balance`);
        error.status = 400;
        throw error;
      }
      await client.query(
        `UPDATE leave_balances SET ${request.type} = ${request.type} - $1 WHERE user_id = $2`,
        [request.days, request.user_id]
      );
    }

    const result = await client.query(
      `UPDATE leave_requests
       SET status = $1, manager_comment = $2
       WHERE id = $3
       RETURNING *`,
      [status, managerComment || '', requestId]
    );
    return toLeave(result.rows[0]);
  });

  res.json(updated);
}));

app.delete('/api/leaves/:id', auth, asyncRoute(async (req, res) => {
  const result = await query(
    `DELETE FROM leave_requests
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING id`,
    [parseInt(req.params.id), req.user.id]
  );

  if (!result.rows.length) return res.status(404).json({ error: 'Pending request not found' });
  res.json({ message: 'Cancelled' });
}));

app.get('/api/reports', auth, managerOnly, asyncRoute(async (req, res) => {
  const stats = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
       COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
       COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
       COUNT(*) FILTER (WHERE type = 'annual')::int AS annual,
       COUNT(*) FILTER (WHERE type = 'sick')::int AS sick,
       COUNT(*) FILTER (WHERE type = 'family')::int AS family
     FROM leave_requests r
     JOIN users u ON u.id = r.user_id
     WHERE u.manager_id = $1`,
    [req.user.id]
  );

  const employees = await query(
    `SELECT
       u.name,
       COUNT(r.id)::int AS total,
       COUNT(r.id) FILTER (WHERE r.status = 'approved')::int AS approved,
       COALESCE(SUM(r.days) FILTER (WHERE r.status = 'approved'), 0)::int AS days_used,
       b.user_id,
       b.annual,
       b.sick,
       b.family
     FROM users u
     LEFT JOIN leave_requests r ON r.user_id = u.id
     LEFT JOIN leave_balances b ON b.user_id = u.id
     WHERE u.manager_id = $1
     GROUP BY u.id, b.user_id, b.annual, b.sick, b.family
     ORDER BY u.name`,
    [req.user.id]
  );

  const row = stats.rows[0];
  res.json({
    total: row.total,
    pending: row.pending,
    approved: row.approved,
    rejected: row.rejected,
    byType: {
      annual: row.annual,
      sick: row.sick,
      family: row.family,
    },
    byEmployee: employees.rows.map((employee) => ({
      name: employee.name,
      total: employee.total,
      approved: employee.approved,
      daysUsed: employee.days_used,
      balance: toBalance(employee),
    })),
  });
}));

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.message || 'Server error' });
});

app.listen(PORT, () => console.log(`Leave Management API running on http://localhost:${PORT}`));
