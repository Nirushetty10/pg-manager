const pool = require('../config/db');
const { stringify } = require('querystring');

// ── PAYMENTS ─────────────────────────────────────────────────
const getPayments = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { search, method, status, start_date, end_date, page=1, limit=15 } = req.query;
    let conds = ['p.pg_id=$1'], params = [pgId], idx = 2;
    if (search) { conds.push(`pt.name ILIKE $${idx++}`); params.push(`%${search}%`); }
    if (method && method!=='all') { conds.push(`p.payment_mode=$${idx++}`); params.push(method); }
    if (status && status!=='all') { conds.push(`p.status=$${idx++}`); params.push(status); }
    if (start_date) { conds.push(`p.payment_date>=$${idx++}`); params.push(start_date); }
    if (end_date) { conds.push(`p.payment_date<=$${idx++}`); params.push(end_date); }
    const where = `WHERE ${conds.join(' AND ')}`;
    const offset = (page-1)*limit;

    const [count, payments, summary, prevDues, logs] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM payments p LEFT JOIN pg_tenants pt ON p.pg_tenant_id=pt.id ${where}`, params),
      pool.query(`SELECT p.*, pt.name as tenant_name, pt.phone as tenant_phone, pt.monthly_rent as tenant_rent,
          r.room_number, b.bed_label
        FROM payments p LEFT JOIN pg_tenants pt ON p.pg_tenant_id=pt.id LEFT JOIN rooms r ON pt.room_id=r.id LEFT JOIN beds b ON pt.bed_id=b.id
        ${where} ORDER BY p.payment_date DESC LIMIT $${idx} OFFSET $${idx+1}`, [...params, parseInt(limit), offset]),
      pool.query(`SELECT
          COALESCE(SUM(monthly_rent),0) as total_monthly_rent,
          COALESCE(SUM(monthly_rent) FILTER (WHERE payment_status='paid'),0) as total_paid,
          COALESCE(SUM(monthly_rent) FILTER (WHERE payment_status='due'),0) as total_due,
          COALESCE(SUM(monthly_rent) FILTER (WHERE payment_status='partial'),0) as total_partial
        FROM pg_tenants WHERE pg_id=$1 AND status='active'`, [pgId]),
      // Previous month dues
      pool.query(`SELECT pt.id, pt.name, pt.monthly_rent, pt.phone, r.room_number,
          COALESCE(SUM(CASE WHEN p.is_partial THEN p.balance_due ELSE 0 END),0) as prev_due
        FROM pg_tenants pt
        LEFT JOIN rooms r ON pt.room_id=r.id
        LEFT JOIN payments p ON p.pg_tenant_id=pt.id AND DATE_TRUNC('month',p.payment_date) < DATE_TRUNC('month',CURRENT_DATE)
        WHERE pt.pg_id=$1 AND pt.status='active'
        GROUP BY pt.id,pt.name,pt.monthly_rent,pt.phone,r.room_number
        HAVING COALESCE(SUM(CASE WHEN p.is_partial THEN p.balance_due ELSE 0 END),0) > 0`, [pgId]),
      pool.query(`SELECT * FROM activity_logs WHERE pg_id=$1 AND entity_type='payment' ORDER BY created_at DESC LIMIT 5`, [pgId]),
    ]);

    res.json({
      payments: payments.rows,
      total: parseInt(count.rows[0].count),
      summary: summary.rows[0],
      prevDues: prevDues.rows,
      logs: logs.rows,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
};

const createPayment = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { pgId } = req.params;
    const { pg_tenant_id, amount, payment_date, payment_mode, transaction_ref, month, notes } = req.body;

    // Get tenant's monthly rent to calculate partial
    const tenantRes = await client.query('SELECT monthly_rent, name FROM pg_tenants WHERE id=$1', [pg_tenant_id]);
    const tenant = tenantRes.rows[0];
    const monthlyRent = parseFloat(tenant?.monthly_rent || 0);
    const paidAmount = parseFloat(amount);
    const isPartial = paidAmount < monthlyRent;
    const balanceDue = isPartial ? monthlyRent - paidAmount : 0;

    const last = await client.query("SELECT receipt_number FROM payments ORDER BY created_at DESC LIMIT 1");
    const lastNum = last.rows[0]?.receipt_number?.replace('#REC-','') || '9000';
    const receipt_number = `#REC-${parseInt(lastNum)+1}`;

    const payment = await client.query(`
      INSERT INTO payments (pg_id,pg_tenant_id,receipt_number,amount,paid_amount,balance_due,is_partial,
        payment_date,month,payment_mode,transaction_ref,notes,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'settled') RETURNING *
    `, [pgId, pg_tenant_id, receipt_number, amount, paidAmount, balanceDue, isPartial,
        payment_date, month, payment_mode||'cash', transaction_ref, notes]);

    // Update tenant payment_status
    const paymentStatus = isPartial ? 'partial' : 'paid';
    await client.query('UPDATE pg_tenants SET payment_status=$1 WHERE id=$2', [paymentStatus, pg_tenant_id]);

    await client.query(`INSERT INTO activity_logs (pg_id,action,entity_type,entity_id,performed_by_name,performed_by_role) VALUES ($1,$2,'payment',$3,$4,$5)`,
      [pgId, `Payment: ${receipt_number} ₹${amount}${isPartial?` (partial, ₹${balanceDue} due)`:''}`, payment.rows[0].id, req.actor?.name||'Staff', req.actor?.role||'staff']);

    await client.query('COMMIT');
    res.status(201).json({ ...payment.rows[0], isPartial, balanceDue });
  } catch (e) { await client.query('ROLLBACK'); console.error(e); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
};

const updatePayment = async (req, res) => {
  try {
    const { pgId, paymentId } = req.params;
    const { amount, payment_date, payment_mode, transaction_ref, month, notes, status } = req.body;

    // Recalculate partial if amount changed
    const tenantRes = await pool.query(`SELECT pt.monthly_rent FROM payments p JOIN pg_tenants pt ON p.pg_tenant_id=pt.id WHERE p.id=$1`, [paymentId]);
    const monthlyRent = parseFloat(tenantRes.rows[0]?.monthly_rent || 0);
    const paidAmount = parseFloat(amount);
    const isPartial = monthlyRent > 0 && paidAmount < monthlyRent;
    const balanceDue = isPartial ? monthlyRent - paidAmount : 0;

    const r = await pool.query(`
      UPDATE payments SET amount=$1,paid_amount=$2,balance_due=$3,is_partial=$4,
        payment_date=$5,month=$6,payment_mode=$7,transaction_ref=$8,notes=$9,status=$10
      WHERE id=$11 AND pg_id=$12 RETURNING *
    `, [amount, paidAmount, balanceDue, isPartial, payment_date, month, payment_mode, transaction_ref, notes, status||'settled', paymentId, pgId]);
    if (!r.rows.length) return res.status(404).json({ message: 'Payment not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

// ── EXPORT CSV ────────────────────────────────────────────────
const exportPaymentsCSV = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { start_date, end_date, month } = req.query;
    let conds = ['p.pg_id=$1'], params = [pgId], idx = 2;
    if (start_date) { conds.push(`p.payment_date>=$${idx++}`); params.push(start_date); }
    if (end_date) { conds.push(`p.payment_date<=$${idx++}`); params.push(end_date); }
    if (month) { conds.push(`p.month=$${idx++}`); params.push(month); }

    const result = await pool.query(`
      SELECT p.receipt_number, pt.name as tenant_name, pt.phone, r.room_number,
        p.amount, p.paid_amount, p.balance_due, p.is_partial,
        p.payment_date, p.month, p.payment_mode, p.transaction_ref, p.status, p.notes
      FROM payments p
      LEFT JOIN pg_tenants pt ON p.pg_tenant_id=pt.id
      LEFT JOIN rooms r ON pt.room_id=r.id
      WHERE ${conds.join(' AND ')}
      ORDER BY p.payment_date DESC
    `, params);

    const headers = ['Receipt No','Tenant Name','Phone','Room','Amount','Paid Amount','Balance Due','Is Partial','Date','Month','Method','Reference','Status','Notes'];
    const rows = result.rows.map(r => [
      r.receipt_number, r.tenant_name, r.phone, r.room_number,
      r.amount, r.paid_amount||r.amount, r.balance_due||0, r.is_partial?'Yes':'No',
      r.payment_date?.toISOString().split('T')[0], r.month, r.payment_mode,
      r.transaction_ref||'', r.status, r.notes||''
    ]);

    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="payments-${pgId}-${Date.now()}.csv"`);
    res.send(csv);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
};

// ── EXPENSES ─────────────────────────────────────────────────
const getExpenses = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { category, status, page=1, limit=15 } = req.query;
    let conds = ['pg_id=$1'], params = [pgId], idx = 2;
    if (category && category!=='all') { conds.push(`category=$${idx++}`); params.push(category); }
    if (status && status!=='all') { conds.push(`status=$${idx++}`); params.push(status); }
    const where = `WHERE ${conds.join(' AND ')}`;
    const offset = (page-1)*limit;

    const [count, expenses, stats, distribution, monthlyTrend] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM expenses ${where}`, params),
      pool.query(`SELECT * FROM expenses ${where} ORDER BY expense_date DESC LIMIT $${idx} OFFSET $${idx+1}`, [...params, parseInt(limit), offset]),
      pool.query(`SELECT
          COALESCE(SUM(amount) FILTER (WHERE DATE_TRUNC('month',expense_date)=DATE_TRUNC('month',CURRENT_DATE)),0) as total_this_month,
          COALESCE(SUM(amount) FILTER (WHERE DATE_TRUNC('month',expense_date)=DATE_TRUNC('month',CURRENT_DATE-INTERVAL '1 month')),0) as total_last_month,
          COALESCE(SUM(amount) FILTER (WHERE status='pending' AND (due_date IS NULL OR due_date<=CURRENT_DATE+7)),0) as upcoming_bills
        FROM expenses WHERE pg_id=$1`, [pgId]),
      pool.query(`SELECT category, SUM(amount) as total FROM expenses WHERE pg_id=$1 AND DATE_TRUNC('month',expense_date)=DATE_TRUNC('month',CURRENT_DATE) GROUP BY category ORDER BY total DESC`, [pgId]),
      // Last 6 months trend
      pool.query(`SELECT TO_CHAR(DATE_TRUNC('month',expense_date),'Mon') as month, DATE_TRUNC('month',expense_date) as md, SUM(amount) as total
        FROM expenses WHERE pg_id=$1 AND expense_date>=NOW()-INTERVAL '6 months'
        GROUP BY md ORDER BY md`, [pgId]),
    ]);

    res.json({
      expenses: expenses.rows,
      total: parseInt(count.rows[0].count),
      stats: stats.rows[0],
      distribution: distribution.rows,
      monthlyTrend: monthlyTrend.rows,
    });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Server error' }); }
};

const createExpense = async (req, res) => {
  try {
    const { description, sub_description, category, amount, expense_date, due_date, status, invoice_number, vendor } = req.body;
    const r = await pool.query(`INSERT INTO expenses (pg_id,description,sub_description,category,amount,expense_date,due_date,status,invoice_number,vendor) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.params.pgId, description, sub_description, category, amount, expense_date, due_date||null, status||'paid', invoice_number, vendor]);
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const updateExpense = async (req, res) => {
  try {
    const { description, sub_description, category, amount, expense_date, status, vendor } = req.body;
    const r = await pool.query(`UPDATE expenses SET description=$1,sub_description=$2,category=$3,amount=$4,expense_date=$5,status=$6,vendor=$7 WHERE id=$8 AND pg_id=$9 RETURNING *`,
      [description, sub_description, category, amount, expense_date, status, vendor, req.params.expenseId, req.params.pgId]);
    if (!r.rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const deleteExpense = async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM expenses WHERE id=$1 AND pg_id=$2 RETURNING id', [req.params.expenseId, req.params.pgId]);
    if (!r.rows.length) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

module.exports = { getPayments, createPayment, updatePayment, exportPaymentsCSV, getExpenses, createExpense, updateExpense, deleteExpense };
