const pool = require('../config/db');

// ── PAYMENTS ─────────────────────────────────────────────────
const getPayments = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { search, method, status, start_date, end_date, page = 1, limit = 15 } = req.query;
    let conds = ['p.pg_id=$1'], params = [pgId], idx = 2;
    if (search) { conds.push(`pt.name ILIKE $${idx++}`); params.push(`%${search}%`); }
    if (method && method !== 'all') { conds.push(`p.payment_mode=$${idx++}`); params.push(method); }
    if (status && status !== 'all') { conds.push(`p.status=$${idx++}`); params.push(status); }
    if (start_date) { conds.push(`p.payment_date>=$${idx++}`); params.push(start_date); }
    if (end_date) { conds.push(`p.payment_date<=$${idx++}`); params.push(end_date); }
    const where = `WHERE ${conds.join(' AND ')}`;
    const offset = (page - 1) * limit;

    const count = await pool.query(`SELECT COUNT(*) FROM payments p LEFT JOIN pg_tenants pt ON p.pg_tenant_id=pt.id ${where}`, params);
    const payments = await pool.query(`
      SELECT p.*, pt.name as tenant_name, pt.phone as tenant_phone, r.room_number
      FROM payments p
      LEFT JOIN pg_tenants pt ON p.pg_tenant_id=pt.id
      LEFT JOIN rooms r ON pt.room_id=r.id
      ${where} ORDER BY p.payment_date DESC
      LIMIT $${idx} OFFSET $${idx+1}
    `, [...params, parseInt(limit), offset]);

    const stats = await pool.query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE status='settled' AND DATE_TRUNC('month',payment_date)=DATE_TRUNC('month',CURRENT_DATE)),0) as total_collected,
        COALESCE(AVG(amount) FILTER (WHERE status='settled' AND DATE_TRUNC('month',payment_date)=DATE_TRUNC('month',CURRENT_DATE)),0) as avg_transaction
      FROM payments WHERE pg_id=$1
    `, [pgId]);

    const logs = await pool.query(`
      SELECT * FROM activity_logs WHERE pg_id=$1 AND entity_type='payment'
      ORDER BY created_at DESC LIMIT 5
    `, [pgId]);

    res.json({ payments: payments.rows, total: parseInt(count.rows[0].count), stats: stats.rows[0], logs: logs.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createPayment = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { pgId } = req.params;
    const { pg_tenant_id, amount, payment_date, payment_mode, transaction_ref, month, notes } = req.body;

    const lastReceipt = await client.query("SELECT receipt_number FROM payments ORDER BY created_at DESC LIMIT 1");
    const lastNum = lastReceipt.rows[0]?.receipt_number?.replace('#REC-','') || '9000';
    const receipt_number = `#REC-${parseInt(lastNum)+1}`;

    const payment = await client.query(`
      INSERT INTO payments (pg_id,pg_tenant_id,receipt_number,amount,payment_date,month,payment_mode,transaction_ref,notes,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'settled') RETURNING *
    `, [pgId, pg_tenant_id, receipt_number, amount, payment_date, month, payment_mode||'cash', transaction_ref, notes]);

    await client.query(`INSERT INTO activity_logs (pg_id,action,entity_type,entity_id,performed_by_name,performed_by_role) VALUES ($1,$2,'payment',$3,$4,$5)`,
      [pgId, `Payment recorded: ${receipt_number} — ₹${amount}`, payment.rows[0].id, req.actor.name||'Staff', req.actor.role]);

    await client.query('COMMIT');
    res.status(201).json(payment.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally { client.release(); }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const r = await pool.query('UPDATE payments SET status=$1 WHERE id=$2 AND pg_id=$3 RETURNING *', [req.body.status, req.params.paymentId, req.params.pgId]);
    if (!r.rows.length) return res.status(404).json({ message: 'Payment not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// ── EXPENSES ─────────────────────────────────────────────────
const getExpenses = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { category, status, page = 1, limit = 15 } = req.query;
    let conds = ['pg_id=$1'], params = [pgId], idx = 2;
    if (category && category !== 'all') { conds.push(`category=$${idx++}`); params.push(category); }
    if (status && status !== 'all') { conds.push(`status=$${idx++}`); params.push(status); }
    const where = `WHERE ${conds.join(' AND ')}`;
    const offset = (page-1)*limit;

    const count = await pool.query(`SELECT COUNT(*) FROM expenses ${where}`, params);
    const expenses = await pool.query(`SELECT * FROM expenses ${where} ORDER BY expense_date DESC LIMIT $${idx} OFFSET $${idx+1}`, [...params, parseInt(limit), offset]);

    const stats = await pool.query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE DATE_TRUNC('month',expense_date)=DATE_TRUNC('month',CURRENT_DATE)),0) as total_this_month,
        COALESCE(SUM(amount) FILTER (WHERE status='pending' AND (due_date IS NULL OR due_date<=CURRENT_DATE+7)),0) as upcoming_bills
      FROM expenses WHERE pg_id=$1
    `, [pgId]);

    const distribution = await pool.query(`
      SELECT category, SUM(amount) as total FROM expenses
      WHERE pg_id=$1 AND DATE_TRUNC('month',expense_date)=DATE_TRUNC('month',CURRENT_DATE)
      GROUP BY category ORDER BY total DESC
    `, [pgId]);

    res.json({ expenses: expenses.rows, total: parseInt(count.rows[0].count), stats: stats.rows[0], distribution: distribution.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createExpense = async (req, res) => {
  try {
    const { description, sub_description, category, amount, expense_date, due_date, status, invoice_number, vendor } = req.body;
    const r = await pool.query(`
      INSERT INTO expenses (pg_id,description,sub_description,category,amount,expense_date,due_date,status,invoice_number,vendor)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [req.params.pgId, description, sub_description, category, amount, expense_date, due_date||null, status||'paid', invoice_number, vendor]);
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

const updateExpense = async (req, res) => {
  try {
    const { description, sub_description, category, amount, expense_date, status, vendor } = req.body;
    const r = await pool.query(`
      UPDATE expenses SET description=$1,sub_description=$2,category=$3,amount=$4,expense_date=$5,status=$6,vendor=$7
      WHERE id=$8 AND pg_id=$9 RETURNING *
    `, [description, sub_description, category, amount, expense_date, status, vendor, req.params.expenseId, req.params.pgId]);
    if (!r.rows.length) return res.status(404).json({ message: 'Expense not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

const deleteExpense = async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM expenses WHERE id=$1 AND pg_id=$2 RETURNING id', [req.params.expenseId, req.params.pgId]);
    if (!r.rows.length) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Expense deleted' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

module.exports = { getPayments, createPayment, updatePaymentStatus, getExpenses, createExpense, updateExpense, deleteExpense };
