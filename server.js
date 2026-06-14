const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'leave_system_secret_2026';
const DB_FILE = path.join(__dirname, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// ─── DATABASE HELPERS ────────────────────────────────────────────
function readDB() {
  if (!fs.existsSync(DB_FILE)) return initDB();
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function initDB() {
  const data = {
    users: [
      {
        id: 1, name: 'Sarah Mokoena', email: 'manager@company.com',
        password: bcrypt.hashSync('manager123', 10),
        role: 'manager', department: 'IT'
      },
      {
        id: 2, name: 'Boitshoko Soomo', email: 'employee@company.com',
        password: bcrypt.hashSync('employee123', 10),
        role: 'employee', department: 'IT', managerId: 1
      },
      {
        id: 3, name: 'Thabo Nkosi', email: 'thabo@company.com',
        password: bcrypt.hashSync('employee123', 10),
        role: 'employee', department: 'IT', managerId: 1
      },
      {
        id: 4, name: 'Lerato Dlamini', email: 'lerato@company.com',
        password: bcrypt.hashSync('employee123', 10),
        role: 'employee', department: 'IT', managerId: 1
      }
    ],
    leaveBalances: [
      { userId: 2, annual: 15, sick: 10, family: 3 },
      { userId: 3, annual: 15, sick: 10, family: 3 },
      { userId: 4, annual: 15, sick: 10, family: 3 },
    ],
    leaveRequests: [
      {
        id: 1, userId: 3, type: 'annual', startDate: '2026-06-01',
        endDate: '2026-06-03', days: 3, reason: 'Family vacation',
        status: 'approved', createdAt: '2026-05-20', managerId: 1,
        managerComment: 'Approved. Enjoy!'
      },
      {
        id: 2, userId: 4, type: 'sick', startDate: '2026-06-10',
        endDate: '2026-06-10', days: 1, reason: 'Doctor appointment',
        status: 'pending', createdAt: '2026-06-09', managerId: 1,
        managerComment: ''
      }
    ],
    nextIds: { user: 5, request: 3 }
  };
  writeDB(data);
  return data;
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────
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

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function parseLeaveBalance(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

// ─── AUTH ROUTES ──────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid email or password' });
  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department } });
});

// ─── USER ROUTES ──────────────────────────────────────────────────
app.get('/api/me', auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  const balance = db.leaveBalances.find(b => b.userId === req.user.id) || { annual: 0, sick: 0, family: 0 };
  res.json({ ...user, password: undefined, balance });
});

app.get('/api/employees', auth, managerOnly, (req, res) => {
  const db = readDB();
  const employees = db.users
    .filter(u => u.role === 'employee' && u.managerId === req.user.id)
    .map(u => {
      const balance = db.leaveBalances.find(b => b.userId === u.id) || { annual: 0, sick: 0, family: 0 };
      return { ...u, password: undefined, balance };
    });
  res.json(employees);
});

app.post('/api/employees', auth, managerOnly, (req, res) => {
  const { name, email, password, department, balance = {} } = req.body;
  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);
  const cleanDepartment = String(department || '').trim();

  if (!cleanName || !cleanEmail || !password || !cleanDepartment)
    return res.status(400).json({ error: 'Name, email, password, and department are required' });

  const db = readDB();
  if (db.users.some(u => u.email.toLowerCase() === cleanEmail))
    return res.status(409).json({ error: 'Email already exists' });

  const employee = {
    id: db.nextIds.user++,
    name: cleanName,
    email: cleanEmail,
    password: bcrypt.hashSync(password, 10),
    role: 'employee',
    department: cleanDepartment,
    managerId: req.user.id
  };

  const leaveBalance = {
    userId: employee.id,
    annual: parseLeaveBalance(balance.annual, 15),
    sick: parseLeaveBalance(balance.sick, 10),
    family: parseLeaveBalance(balance.family, 3)
  };

  db.users.push(employee);
  db.leaveBalances.push(leaveBalance);
  writeDB(db);

  res.status(201).json({ ...employee, password: undefined, balance: leaveBalance });
});

app.put('/api/employees/:id', auth, managerOnly, (req, res) => {
  const employeeId = parseInt(req.params.id);
  const { name, email, password, department, balance = {} } = req.body;
  const db = readDB();
  const employee = db.users.find(u => u.id === employeeId && u.role === 'employee' && u.managerId === req.user.id);

  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);
  const cleanDepartment = String(department || '').trim();

  if (!cleanName || !cleanEmail || !cleanDepartment)
    return res.status(400).json({ error: 'Name, email, and department are required' });

  if (db.users.some(u => u.id !== employeeId && u.email.toLowerCase() === cleanEmail))
    return res.status(409).json({ error: 'Email already exists' });

  employee.name = cleanName;
  employee.email = cleanEmail;
  employee.department = cleanDepartment;
  if (password) employee.password = bcrypt.hashSync(password, 10);

  let leaveBalance = db.leaveBalances.find(b => b.userId === employeeId);
  if (!leaveBalance) {
    leaveBalance = { userId: employeeId, annual: 0, sick: 0, family: 0 };
    db.leaveBalances.push(leaveBalance);
  }
  leaveBalance.annual = parseLeaveBalance(balance.annual, leaveBalance.annual);
  leaveBalance.sick = parseLeaveBalance(balance.sick, leaveBalance.sick);
  leaveBalance.family = parseLeaveBalance(balance.family, leaveBalance.family);

  writeDB(db);
  res.json({ ...employee, password: undefined, balance: leaveBalance });
});

app.delete('/api/employees/:id', auth, managerOnly, (req, res) => {
  const employeeId = parseInt(req.params.id);
  const db = readDB();
  const employee = db.users.find(u => u.id === employeeId && u.role === 'employee' && u.managerId === req.user.id);

  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  db.users = db.users.filter(u => u.id !== employeeId);
  db.leaveBalances = db.leaveBalances.filter(b => b.userId !== employeeId);
  db.leaveRequests = db.leaveRequests.filter(r => r.userId !== employeeId);
  writeDB(db);

  res.json({ message: 'Employee deleted' });
});

// ─── LEAVE BALANCE ROUTES ─────────────────────────────────────────
app.get('/api/balance', auth, (req, res) => {
  const db = readDB();
  const balance = db.leaveBalances.find(b => b.userId === req.user.id);
  res.json(balance || { annual: 0, sick: 0, family: 0 });
});

// ─── LEAVE REQUEST ROUTES ─────────────────────────────────────────
app.get('/api/leaves', auth, (req, res) => {
  const db = readDB();
  let requests;
  if (req.user.role === 'manager') {
    const empIds = db.users.filter(u => u.managerId === req.user.id).map(u => u.id);
    requests = db.leaveRequests.filter(r => empIds.includes(r.userId));
    requests = requests.map(r => {
      const user = db.users.find(u => u.id === r.userId);
      return { ...r, employeeName: user?.name, department: user?.department };
    });
  } else {
    requests = db.leaveRequests.filter(r => r.userId === req.user.id);
  }
  requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(requests);
});

app.post('/api/leaves', auth, (req, res) => {
  if (req.user.role !== 'employee') return res.status(403).json({ error: 'Employees only' });
  const { type, startDate, endDate, reason } = req.body;
  if (!type || !startDate || !endDate || !reason)
    return res.status(400).json({ error: 'All fields required' });
  if (!['annual', 'sick', 'family'].includes(type))
    return res.status(400).json({ error: 'Invalid leave type' });

  const db = readDB();
  const balance = db.leaveBalances.find(b => b.userId === req.user.id);
  const days = Math.round((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;

  if (days <= 0) return res.status(400).json({ error: 'End date must be after start date' });
  if (!balance) return res.status(400).json({ error: 'Leave balance not found' });
  if (balance[type] < days) return res.status(400).json({ error: `Insufficient ${type} leave balance` });

  const user = db.users.find(u => u.id === req.user.id);
  const newRequest = {
    id: db.nextIds.request++,
    userId: req.user.id,
    type, startDate, endDate, days, reason,
    status: 'pending',
    createdAt: new Date().toISOString().split('T')[0],
    managerId: user.managerId,
    managerComment: ''
  };
  db.leaveRequests.push(newRequest);
  writeDB(db);
  res.status(201).json(newRequest);
});

app.put('/api/leaves/:id', auth, managerOnly, (req, res) => {
  const { status, managerComment } = req.body;
  if (!['approved', 'rejected'].includes(status))
    return res.status(400).json({ error: 'Invalid request status' });

  const db = readDB();
  const idx = db.leaveRequests.findIndex(r => r.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Request not found' });

  const request = db.leaveRequests[idx];
  const employee = db.users.find(u => u.id === request.userId);
  if (!employee || employee.managerId !== req.user.id) return res.status(403).json({ error: 'Not your team member' });
  if (request.status !== 'pending') return res.status(400).json({ error: 'Already processed' });

  if (status === 'approved') {
    const balance = db.leaveBalances.find(b => b.userId === request.userId);
    if (!balance) return res.status(400).json({ error: 'Leave balance not found' });
    if (balance[request.type] < request.days) return res.status(400).json({ error: `Insufficient ${request.type} leave balance` });
    if (balance) balance[request.type] -= request.days;
  }

  db.leaveRequests[idx] = { ...request, status, managerComment: managerComment || '' };
  writeDB(db);
  res.json(db.leaveRequests[idx]);
});

app.delete('/api/leaves/:id', auth, (req, res) => {
  const db = readDB();
  const idx = db.leaveRequests.findIndex(r => r.id === parseInt(req.params.id) && r.userId === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (db.leaveRequests[idx].status !== 'pending') return res.status(400).json({ error: 'Cannot cancel processed request' });
  db.leaveRequests.splice(idx, 1);
  writeDB(db);
  res.json({ message: 'Cancelled' });
});

// ─── REPORTS ──────────────────────────────────────────────────────
app.get('/api/reports', auth, managerOnly, (req, res) => {
  const db = readDB();
  const empIds = db.users.filter(u => u.managerId === req.user.id).map(u => u.id);
  const requests = db.leaveRequests.filter(r => empIds.includes(r.userId));
  const report = {
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    byType: {
      annual: requests.filter(r => r.type === 'annual').length,
      sick: requests.filter(r => r.type === 'sick').length,
      family: requests.filter(r => r.type === 'family').length,
    },
    byEmployee: db.users.filter(u => u.managerId === req.user.id).map(u => {
      const userRequests = requests.filter(r => r.userId === u.id);
      const balance = db.leaveBalances.find(b => b.userId === u.id);
      return {
        name: u.name,
        total: userRequests.length,
        approved: userRequests.filter(r => r.status === 'approved').length,
        daysUsed: userRequests.filter(r => r.status === 'approved').reduce((s, r) => s + r.days, 0),
        balance
      };
    })
  };
  res.json(report);
});

app.listen(PORT, () => console.log(`Leave Management API running on http://localhost:${PORT}`));
