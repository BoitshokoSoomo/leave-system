'use client';

import { useEffect, useMemo, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')}/api`
  : '/api';

const employeeNav = [
  { id: 'dashboard', icon: 'D', label: 'Dashboard' },
  { id: 'apply', icon: '+', label: 'Apply for Leave' },
  { id: 'history', icon: 'H', label: 'History' },
];

const managerNav = [
  { id: 'requests', icon: 'R', label: 'Leave Requests' },
  { id: 'team', icon: 'T', label: 'My Team' },
  { id: 'reports', icon: 'C', label: 'Reports' },
];

const leaveLabels = {
  annual: 'Annual',
  sick: 'Sick',
  family: 'Family',
};

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function createApi(token) {
  return async function api(path, options = {}) {
    const response = await fetch(API_BASE + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('API is not available. Deploy the Express backend and set NEXT_PUBLIC_API_URL in Vercel.');
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  };
}

function Badge({ type, children }) {
  return <span className={`badge badge-${type}`}>{children}</span>;
}

function StatCard({ label, value, tone = 'annual', sub }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value stat-${tone}`}>{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`toast ${toast.type} show`}>{toast.message}</div>;
}

function Login({ onLogin, api }) {
  const [email, setEmail] = useState('employee@company.com');
  const [password, setPassword] = useState('employee123');
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      const data = await api('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      onLogin(data);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          Leave<span>Flow</span>
        </div>
        <div className="login-sub">Employee Leave Management System</div>
        <div className="demo-creds">
          <p>Demo credentials</p>
          <strong>Manager: manager@company.com / manager123</strong>
          <strong>Employee: employee@company.com / employee123</strong>
        </div>
        {error ? <div className="error-msg visible">{error}</div> : null}
        <label htmlFor="loginEmail">Email address</label>
        <input id="loginEmail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <label htmlFor="loginPassword">Password</label>
        <input id="loginPassword" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <button className="btn btn-primary" type="submit">Sign in</button>
      </form>
    </main>
  );
}

function Sidebar({ user, page, setPage, onLogout }) {
  const nav = user.role === 'manager' ? managerNav : employeeNav;
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        Leave<span>Flow</span>
      </div>
      <nav>
        {nav.map((item) => (
          <button
            className={`nav-item ${page === item.id ? 'active' : ''}`}
            key={item.id}
            type="button"
            onClick={() => setPage(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="avatar">{initials(user.name)}</div>
          <div className="user-info">
            <div className="user-name">{user.name}</div>
            <div className="user-role">{user.role}</div>
          </div>
          <button className="logout-btn" type="button" onClick={onLogout} title="Sign out">x</button>
        </div>
      </div>
    </aside>
  );
}

function PageHeader({ title, sub }) {
  return (
    <div className="page-header">
      <h1 className="page-title">{title}</h1>
      {sub ? <p className="page-sub">{sub}</p> : null}
    </div>
  );
}

function EmptyState({ title }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">--</div>
      <p>{title}</p>
    </div>
  );
}

function Dashboard({ api, user, setPage }) {
  const [balance, setBalance] = useState(null);
  const [leaves, setLeaves] = useState([]);

  useEffect(() => {
    Promise.all([api('/balance'), api('/leaves')]).then(([nextBalance, nextLeaves]) => {
      setBalance(nextBalance);
      setLeaves(nextLeaves);
    });
  }, [api]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  if (!balance) return <PageHeader title="Dashboard" sub="Loading your leave overview..." />;

  return (
    <>
      <PageHeader title="Dashboard" sub={`${greeting}, ${user.name.split(' ')[0]}`} />
      <div className="stats-grid">
        <StatCard label="Annual Leave" value={balance.annual} sub="days remaining" />
        <StatCard label="Sick Leave" value={balance.sick} tone="sick" sub="days remaining" />
        <StatCard label="Family Responsibility" value={balance.family} tone="family" sub="days remaining" />
        <StatCard label="Pending Requests" value={leaves.filter((leave) => leave.status === 'pending').length} tone="pending" sub="awaiting approval" />
      </div>
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Recent Leave Requests</h2>
          <button className="btn btn-primary btn-sm" type="button" onClick={() => setPage('apply')}>+ Apply for Leave</button>
        </div>
        <LeaveTable leaves={leaves.slice(0, 5)} compact />
      </section>
    </>
  );
}

function LeaveTable({ leaves, compact = false, onCancel }) {
  if (!leaves.length) return <EmptyState title="No leave requests found." />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Start</th>
            <th>End</th>
            <th>Days</th>
            <th>Status</th>
            {!compact ? <th>Reason</th> : null}
            {!compact ? <th>Comment</th> : null}
            {onCancel ? <th></th> : null}
          </tr>
        </thead>
        <tbody>
          {leaves.map((leave) => (
            <tr key={leave.id}>
              <td><Badge type={leave.type}>{leaveLabels[leave.type]}</Badge></td>
              <td>{leave.startDate}</td>
              <td>{leave.endDate}</td>
              <td>{leave.days}</td>
              <td><Badge type={leave.status}>{leave.status}</Badge></td>
              {!compact ? <td className="truncate">{leave.reason}</td> : null}
              {!compact ? <td className="muted">{leave.managerComment || '-'}</td> : null}
              {onCancel ? (
                <td>{leave.status === 'pending' ? <button className="btn btn-danger btn-sm" type="button" onClick={() => onCancel(leave.id)}>Cancel</button> : null}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApplyLeave({ api, setPage, showToast }) {
  const [form, setForm] = useState({ type: 'annual', startDate: '', endDate: '', reason: '' });
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await api('/leaves', { method: 'POST', body: JSON.stringify(form) });
      showToast('Leave request submitted successfully', 'success');
      setPage('dashboard');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <PageHeader title="Apply for Leave" sub="Submit a new leave request for manager approval" />
      <form className="card form-card" onSubmit={submit}>
        {error ? <div className="error-msg visible">{error}</div> : null}
        <label htmlFor="leaveType">Leave Type</label>
        <select id="leaveType" value={form.type} onChange={(event) => update('type', event.target.value)}>
          <option value="annual">Annual Leave</option>
          <option value="sick">Sick Leave</option>
          <option value="family">Family Responsibility</option>
        </select>
        <div className="two-col">
          <div>
            <label htmlFor="startDate">Start Date</label>
            <input id="startDate" type="date" value={form.startDate} onChange={(event) => update('startDate', event.target.value)} />
          </div>
          <div>
            <label htmlFor="endDate">End Date</label>
            <input id="endDate" type="date" value={form.endDate} onChange={(event) => update('endDate', event.target.value)} />
          </div>
        </div>
        <label htmlFor="leaveReason">Reason</label>
        <textarea id="leaveReason" rows="4" value={form.reason} onChange={(event) => update('reason', event.target.value)} />
        <div className="button-row">
          <button className="btn btn-primary" type="submit">Submit Request</button>
          <button className="btn btn-ghost" type="button" onClick={() => setPage('dashboard')}>Cancel</button>
        </div>
      </form>
    </>
  );
}

function History({ api, showToast }) {
  const [leaves, setLeaves] = useState([]);

  async function load() {
    setLeaves(await api('/leaves'));
  }

  useEffect(() => {
    load();
  }, [api]);

  async function cancelLeave(id) {
    if (!window.confirm('Cancel this leave request?')) return;
    try {
      await api(`/leaves/${id}`, { method: 'DELETE' });
      showToast('Request cancelled', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <>
      <PageHeader title="Leave History" sub="All your leave requests and their status" />
      <section className="card">
        <LeaveTable leaves={leaves} onCancel={cancelLeave} />
      </section>
    </>
  );
}

function Requests({ api, showToast }) {
  const [leaves, setLeaves] = useState([]);
  const [active, setActive] = useState(null);

  async function load() {
    setLeaves(await api('/leaves'));
  }

  useEffect(() => {
    load();
  }, [api]);

  async function process(status, managerComment) {
    try {
      await api(`/leaves/${active.id}`, { method: 'PUT', body: JSON.stringify({ status, managerComment }) });
      setActive(null);
      showToast(`Request ${status}`, status === 'approved' ? 'success' : 'error');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <>
      <PageHeader title="Leave Requests" sub="Review and action pending requests from your team" />
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Pending Requests</h2>
          <Badge type="pending">{leaves.filter((leave) => leave.status === 'pending').length} pending</Badge>
        </div>
        <ManagerRequestTable leaves={leaves} onReview={setActive} />
      </section>
      {active ? <ReviewModal request={active} onClose={() => setActive(null)} onProcess={process} /> : null}
    </>
  );
}

function ManagerRequestTable({ leaves, onReview }) {
  if (!leaves.length) return <EmptyState title="No leave requests from your team yet." />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Type</th>
            <th>Start</th>
            <th>End</th>
            <th>Days</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {leaves.map((leave) => (
            <tr key={leave.id}>
              <td><strong>{leave.employeeName}</strong></td>
              <td><Badge type={leave.type}>{leaveLabels[leave.type]}</Badge></td>
              <td>{leave.startDate}</td>
              <td>{leave.endDate}</td>
              <td>{leave.days}</td>
              <td className="truncate">{leave.reason}</td>
              <td><Badge type={leave.status}>{leave.status}</Badge></td>
              <td>{leave.status === 'pending' ? <button className="btn btn-primary btn-sm" type="button" onClick={() => onReview(leave)}>Review</button> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewModal({ request, onClose, onProcess }) {
  const [comment, setComment] = useState('');
  return (
    <div className="modal-overlay open">
      <div className="modal">
        <h2 className="modal-title">Review Leave Request</h2>
        <div className="review-box">
          <strong>{request.employeeName}</strong>
          <p>Type: <Badge type={request.type}>{leaveLabels[request.type]}</Badge> Days: <strong>{request.days}</strong></p>
        </div>
        <label htmlFor="managerComment">Comment</label>
        <textarea id="managerComment" rows="3" value={comment} onChange={(event) => setComment(event.target.value)} />
        <div className="modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger btn-sm" type="button" onClick={() => onProcess('rejected', comment)}>Reject</button>
          <button className="btn btn-success btn-sm" type="button" onClick={() => onProcess('approved', comment)}>Approve</button>
        </div>
      </div>
    </div>
  );
}

const emptyEmployeeForm = {
  name: '',
  email: '',
  password: '',
  department: 'IT',
  annual: 15,
  sick: 10,
  family: 3,
};

function employeeToForm(employee) {
  return {
    name: employee.name,
    email: employee.email,
    password: '',
    department: employee.department,
    annual: employee.balance?.annual ?? 15,
    sick: employee.balance?.sick ?? 10,
    family: employee.balance?.family ?? 3,
  };
}

function Team({ api, showToast }) {
  const [employees, setEmployees] = useState([]);
  const [modal, setModal] = useState(null);

  async function load() {
    setEmployees(await api('/employees'));
  }

  useEffect(() => {
    load();
  }, [api]);

  async function saveEmployee(form) {
    const isEdit = Boolean(modal.employee);
    const path = isEdit ? `/employees/${modal.employee.id}` : '/employees';
    const method = isEdit ? 'PUT' : 'POST';
    const payload = {
      name: form.name,
      email: form.email,
      password: form.password,
      department: form.department,
      balance: {
        annual: form.annual,
        sick: form.sick,
        family: form.family,
      },
    };

    if (isEdit && !payload.password) delete payload.password;

    await api(path, { method, body: JSON.stringify(payload) });
    setModal(null);
    showToast(`Employee ${isEdit ? 'updated' : 'added'} successfully`, 'success');
    load();
  }

  async function deleteEmployee(employee) {
    if (!window.confirm(`Delete ${employee.name}? This will also remove their leave requests.`)) return;
    try {
      await api(`/employees/${employee.id}`, { method: 'DELETE' });
      showToast('Employee deleted', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <>
      <div className="page-header action-header">
        <div>
          <h1 className="page-title">My Team</h1>
          <p className="page-sub">Leave balances for all employees you manage</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => setModal({ employee: null })}>+ Add Employee</button>
      </div>
      <div className="emp-grid">
        {employees.map((employee) => (
          <EmployeeCard
            employee={employee}
            key={employee.id}
            onEdit={() => setModal({ employee })}
            onDelete={() => deleteEmployee(employee)}
          />
        ))}
      </div>
      {modal ? (
        <EmployeeModal
          employee={modal.employee}
          onClose={() => setModal(null)}
          onSave={saveEmployee}
          showToast={showToast}
        />
      ) : null}
    </>
  );
}

function EmployeeCard({ employee, onEdit, onDelete }) {
  const rows = [
    ['Annual', employee.balance.annual, 15, 'annual'],
    ['Sick', employee.balance.sick, 10, 'sick'],
    ['Family', employee.balance.family, 3, 'family'],
  ];
  return (
    <article className="emp-card">
      <div className="emp-top">
        <div className="avatar">{initials(employee.name)}</div>
        <div>
          <div className="emp-name">{employee.name}</div>
          <div className="emp-dept">{employee.department}</div>
          <div className="emp-email">{employee.email}</div>
        </div>
      </div>
      <div className="leave-bars">
        {rows.map(([label, count, total, tone]) => (
          <div className="leave-bar-row" key={label}>
            <span className="leave-bar-label">{label}</span>
            <div className="leave-bar-track">
              <div className={`leave-bar-fill fill-${tone}`} style={{ width: `${Math.max(0, Math.min(100, (count / total) * 100))}%` }} />
            </div>
            <span className={`leave-bar-count stat-${tone}`}>{count}</span>
          </div>
        ))}
      </div>
      <div className="employee-actions">
        <button className="btn btn-ghost btn-sm" type="button" onClick={onEdit}>Edit</button>
        <button className="btn btn-danger btn-sm" type="button" onClick={onDelete}>Delete</button>
      </div>
    </article>
  );
}

function EmployeeModal({ employee, onClose, onSave, showToast }) {
  const [form, setForm] = useState(() => (employee ? employeeToForm(employee) : emptyEmployeeForm));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message);
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay open">
      <form className="modal employee-modal" onSubmit={submit}>
        <h2 className="modal-title">{employee ? 'Edit Employee' : 'Add Employee'}</h2>
        {error ? <div className="error-msg visible">{error}</div> : null}
        <label htmlFor="employeeName">Full Name</label>
        <input id="employeeName" value={form.name} onChange={(event) => update('name', event.target.value)} />
        <label htmlFor="employeeEmail">Email</label>
        <input id="employeeEmail" type="email" value={form.email} onChange={(event) => update('email', event.target.value)} />
        <label htmlFor="employeePassword">{employee ? 'New Password' : 'Password'}</label>
        <input
          id="employeePassword"
          type="password"
          value={form.password}
          placeholder={employee ? 'Leave blank to keep current password' : ''}
          onChange={(event) => update('password', event.target.value)}
        />
        <label htmlFor="employeeDepartment">Department</label>
        <input id="employeeDepartment" value={form.department} onChange={(event) => update('department', event.target.value)} />
        <div className="three-col">
          <div>
            <label htmlFor="annualBalance">Annual</label>
            <input id="annualBalance" type="number" min="0" value={form.annual} onChange={(event) => update('annual', event.target.value)} />
          </div>
          <div>
            <label htmlFor="sickBalance">Sick</label>
            <input id="sickBalance" type="number" min="0" value={form.sick} onChange={(event) => update('sick', event.target.value)} />
          </div>
          <div>
            <label htmlFor="familyBalance">Family</label>
            <input id="familyBalance" type="number" min="0" value={form.family} onChange={(event) => update('family', event.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Employee'}</button>
        </div>
      </form>
    </div>
  );
}

function Reports({ api }) {
  const [report, setReport] = useState(null);

  useEffect(() => {
    api('/reports').then(setReport);
  }, [api]);

  if (!report) return <PageHeader title="Reports" sub="Loading department reporting..." />;

  return (
    <>
      <PageHeader title="Reports" sub="Leave usage overview for your department" />
      <div className="stats-grid">
        <StatCard label="Total Requests" value={report.total} />
        <StatCard label="Pending" value={report.pending} tone="pending" />
        <StatCard label="Approved" value={report.approved} tone="approved" />
        <StatCard label="Rejected" value={report.rejected} tone="rejected" />
      </div>
      <div className="report-grid">
        <Chart title="Requests by Type" data={[
          ['Annual', report.byType.annual, 'annual'],
          ['Sick', report.byType.sick, 'sick'],
          ['Family', report.byType.family, 'family'],
        ]} />
        <Chart title="Requests by Status" data={[
          ['Pending', report.pending, 'pending'],
          ['Approved', report.approved, 'approved'],
          ['Rejected', report.rejected, 'rejected'],
        ]} />
      </div>
      <section className="card">
        <div className="card-header"><h2 className="card-title">Per Employee Summary</h2></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Total Requests</th>
                <th>Approved</th>
                <th>Days Used</th>
                <th>Annual Left</th>
                <th>Sick Left</th>
              </tr>
            </thead>
            <tbody>
              {report.byEmployee.map((employee) => (
                <tr key={employee.name}>
                  <td><strong>{employee.name}</strong></td>
                  <td>{employee.total}</td>
                  <td>{employee.approved}</td>
                  <td>{employee.daysUsed}</td>
                  <td><Badge type="annual">{employee.balance?.annual ?? 0}</Badge></td>
                  <td><Badge type="sick">{employee.balance?.sick ?? 0}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Chart({ title, data }) {
  const max = Math.max(...data.map((item) => item[1]), 1);
  return (
    <section className="card">
      <div className="card-header"><h2 className="card-title">{title}</h2></div>
      <div className="chart-bars">
        {data.map(([label, value, tone]) => (
          <div className="bar-wrap" key={label}>
            <div className="bar-val">{value}</div>
            <div className={`bar fill-${tone}`} style={{ height: `${(value / max) * 100}px` }} />
            <div className="bar-label">{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [token, setToken] = useState(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('lf_token');
  });
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [toast, setToast] = useState(null);
  const api = useMemo(() => createApi(token), [token]);

  useEffect(() => {
    if (!token) return;
    api('/me')
      .then((nextUser) => {
        setUser(nextUser);
        setPage(nextUser.role === 'manager' ? 'requests' : 'dashboard');
      })
      .catch(() => {
        localStorage.removeItem('lf_token');
        setToken(null);
      });
  }, [api, token]);

  function showToast(message, type = 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  }

  function handleLogin(data) {
    localStorage.setItem('lf_token', data.token);
    setToken(data.token);
    setUser(data.user);
    setPage(data.user.role === 'manager' ? 'requests' : 'dashboard');
  }

  function logout() {
    localStorage.removeItem('lf_token');
    setToken(null);
    setUser(null);
    setPage('dashboard');
  }

  if (!token || !user) return <Login api={api} onLogin={handleLogin} />;

  return (
    <>
      <Sidebar user={user} page={page} setPage={setPage} onLogout={logout} />
      <main className="main">
        {page === 'dashboard' ? <Dashboard api={api} user={user} setPage={setPage} /> : null}
        {page === 'apply' ? <ApplyLeave api={api} setPage={setPage} showToast={showToast} /> : null}
        {page === 'history' ? <History api={api} showToast={showToast} /> : null}
        {page === 'requests' ? <Requests api={api} showToast={showToast} /> : null}
        {page === 'team' ? <Team api={api} showToast={showToast} /> : null}
        {page === 'reports' ? <Reports api={api} /> : null}
      </main>
      <Toast toast={toast} />
    </>
  );
}
