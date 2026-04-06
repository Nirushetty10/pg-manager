'use strict';

const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate complete outstanding state for a tenant.
 *
 * DESIGN RULE:
 *   Current month and previous months are tracked SEPARATELY.
 *
 *   current_month_balance = monthly_rent - SUM(paid_amount this month)
 *   prev_balance          = SUM of unpaid gaps from all months BEFORE current month
 *   total_outstanding     = current_month_balance + prev_balance
 *
 *   pg_tenants.payment_status → reflects CURRENT MONTH only ('paid' | 'partial' | 'due')
 *   pg_tenants.balance_due    → current month gap only
 *   pg_tenants.prev_balance   → carry-forward from previous months
 *
 *   This means paying ₹6,500 for April ONLY affects April's balance.
 *   March's unpaid ₹6,500 remains in prev_balance until explicitly paid
 *   with a payment row for month='2026-03'.
 */
async function calcTenantState(client, tenantId, month, monthlyRent) {
  const rent = parseFloat(monthlyRent) || 0;

  // 1. Current month: total paid so far for this specific month
  const { rows: currRows } = await client.query(
    `SELECT COALESCE(SUM(paid_amount), 0) AS total_paid
       FROM payments
      WHERE pg_tenant_id = $1
        AND month        = $2
        AND status      != 'failed'`,
    [tenantId, month]
  );
  const totalPaidThisMonth = parseFloat(currRows[0].total_paid) || 0;
  const currentMonthBalance = Math.max(0, rent - totalPaidThisMonth);

  // 2. Previous months: for each older month, calculate that month's unpaid gap
  //    We store monthly_rent on each payment row so we can calculate independently.
  //    If there are NO payment rows for a past month, that month's full rent
  //    is NOT counted here — only months that have at least one payment row
  //    but still have a gap are counted.
  //    (For months with zero payments ever, use a separate "due generation" job.)
  const { rows: prevRows } = await client.query(
    `SELECT COALESCE(SUM(month_gap), 0) AS prev_balance
       FROM (
         SELECT
           month,
           -- Use the monthly_rent stored on the payment row for that month
           MAX(monthly_rent) - COALESCE(SUM(paid_amount) FILTER (WHERE status != 'failed'), 0) AS month_gap
           FROM payments
          WHERE pg_tenant_id = $1
            AND month        < $2
          GROUP BY month
       ) sub
      WHERE month_gap > 0`,
    [tenantId, month]
  );
  const prevBalance = parseFloat(prevRows[0].prev_balance) || 0;

  const isPartial     = totalPaidThisMonth > 0 && currentMonthBalance > 0;
  const paymentStatus =
    totalPaidThisMonth <= 0    ? 'due'
    : currentMonthBalance > 0  ? 'partial'
    :                            'paid';

  return {
    totalPaidThisMonth,
    currentMonthBalance,   // gap for THIS month only
    prevBalance,           // carry-forward from all older months
    totalOutstanding: currentMonthBalance + prevBalance,
    isPartial,
    paymentStatus,
  };
}

/**
 * Write derived state back to pg_tenants.
 * Requires pg_tenants to have: payment_status, balance_due, prev_balance, is_partial
 */
async function syncTenantStatus(client, tenantId, state) {
  await client.query(
    `UPDATE pg_tenants
        SET payment_status = $1,
            balance_due    = $2,
            prev_balance   = $3,
            is_partial     = $4
      WHERE id = $5`,
    [
      state.paymentStatus,
      state.currentMonthBalance,
      state.prevBalance,
      state.isPartial,
      tenantId,
    ]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GET PAYMENTS
// ─────────────────────────────────────────────────────────────────────────────
const getPayments = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { search, method, status, start_date, end_date, page = 1, limit = 15 } = req.query;

    let conds = ['p.pg_id = $1'], params = [pgId], idx = 2;
    if (search)                     { conds.push(`pt.name ILIKE $${idx++}`);     params.push(`%${search}%`); }
    if (method && method !== 'all') { conds.push(`p.payment_mode = $${idx++}`);  params.push(method); }
    if (status && status !== 'all') { conds.push(`p.status = $${idx++}`);        params.push(status); }
    if (start_date)                 { conds.push(`p.payment_date >= $${idx++}`); params.push(start_date); }
    if (end_date)                   { conds.push(`p.payment_date <= $${idx++}`); params.push(end_date); }

    const where  = `WHERE ${conds.join(' AND ')}`;
    const offset = (page - 1) * limit;

    const [count, payments, summary, prevDues, logs] = await Promise.all([

      pool.query(
        `SELECT COUNT(*)
           FROM payments p
           LEFT JOIN pg_tenants pt ON p.pg_tenant_id = pt.id
         ${where}`,
        params
      ),

      pool.query(
        `SELECT p.*,
                pt.name         AS tenant_name,
                pt.phone        AS tenant_phone,
                pt.monthly_rent AS tenant_rent,
                r.room_number,
                b.bed_label
           FROM payments p
           LEFT JOIN pg_tenants pt ON p.pg_tenant_id = pt.id
           LEFT JOIN rooms r ON pt.room_id = r.id
           LEFT JOIN beds  b ON pt.bed_id  = b.id
         ${where}
         ORDER BY p.payment_date DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, parseInt(limit), offset]
      ),

      // Dashboard summary cards
      pool.query(
        `SELECT
           COALESCE(SUM(monthly_rent), 0)                                             AS total_monthly_rent,
           COALESCE(SUM(monthly_rent) FILTER (WHERE payment_status = 'paid'),    0)   AS total_paid,
           COALESCE(SUM(monthly_rent) FILTER (WHERE payment_status = 'due'),     0)   AS total_due,
           COALESCE(SUM(monthly_rent) FILTER (WHERE payment_status = 'partial'), 0)   AS total_partial,
           COALESCE(SUM(balance_due), 0)                                              AS total_current_balance,
           COALESCE(SUM(prev_balance), 0)                                             AS total_prev_dues
         FROM pg_tenants
         WHERE pg_id = $1 AND status = 'active'`,
        [pgId]
      ),

      // Tenants with ANY outstanding amount — current month gap OR prev dues
      pool.query(
        `SELECT
           pt.id,
           pt.name,
           pt.monthly_rent,
           pt.phone,
           r.room_number,
           pt.balance_due                                      AS current_month_due,
           COALESCE(pt.prev_balance, 0)                        AS prev_due,
           pt.balance_due + COALESCE(pt.prev_balance, 0)       AS total_outstanding,
           pt.payment_status
         FROM pg_tenants pt
         LEFT JOIN rooms r ON pt.room_id = r.id
         WHERE pt.pg_id = $1
           AND pt.status = 'active'
           AND (pt.balance_due > 0 OR COALESCE(pt.prev_balance, 0) > 0)
         ORDER BY total_outstanding DESC`,
        [pgId]
      ),

      pool.query(
        `SELECT * FROM activity_logs
          WHERE pg_id = $1 AND entity_type = 'payment'
          ORDER BY created_at DESC LIMIT 5`,
        [pgId]
      ),
    ]);

    res.json({
      payments : payments.rows,
      total    : parseInt(count.rows[0].count),
      summary  : summary.rows[0],
      prevDues : prevDues.rows,
      logs     : logs.rows,
    });
  } catch (e) {
    console.error('getPayments error:', e);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE PAYMENT
// ─────────────────────────────────────────────────────────────────────────────
const createPayment = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { pgId } = req.params;
    const {
      pg_tenant_id,
      amount,
      payment_date,
      payment_mode = 'cash',
      transaction_ref,
      month,          // format: 'YYYY-MM' e.g. '2026-04'
      notes,
    } = req.body;

    // ── 1. Validate required fields ────────────────────────────────────────
    if (!pg_tenant_id || !amount || !payment_date || !month) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'pg_tenant_id, amount, payment_date and month are required.' });
    }
    const paidAmount = parseFloat(amount);
    if (isNaN(paidAmount) || paidAmount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'amount must be a positive number.' });
    }

    // ── 2. Validate tenant belongs to this PG ─────────────────────────────
    const { rows: tenantRows } = await client.query(
      `SELECT id, name, monthly_rent, status
         FROM pg_tenants
        WHERE id = $1 AND pg_id = $2`,
      [pg_tenant_id, pgId]
    );
    if (!tenantRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Tenant not found for this PG.' });
    }
    const tenant      = tenantRows[0];
    const monthlyRent = parseFloat(tenant.monthly_rent) || 0;

    // ── 3. Atomic receipt number via PostgreSQL sequence ───────────────────
    const { rows: receiptRows } = await client.query(
      `SELECT next_receipt_number() AS receipt_number`
    );
    const receiptNumber = receiptRows[0].receipt_number;

    // ── 4. Insert ledger row ───────────────────────────────────────────────
    //    IMPORTANT: monthly_rent is stored here so calcTenantState can compute
    //    per-month gaps from payments table alone without joining pg_tenants.
    const { rows: paymentRows } = await client.query(
      `INSERT INTO payments
         (pg_id, pg_tenant_id, receipt_number, amount, paid_amount, monthly_rent,
          payment_date, month, payment_mode, transaction_ref, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'settled')
       RETURNING *`,
      [
        pgId, pg_tenant_id, receiptNumber,
        paidAmount, paidAmount, monthlyRent,
        payment_date, month, payment_mode,
        transaction_ref || null, notes || null,
      ]
    );
    const newPayment = paymentRows[0];

    // ── 5. Recalculate state — current month + all previous months ─────────
    //    This correctly keeps March's ₹6,500 due SEPARATE from April's payment.
    const state = await calcTenantState(client, pg_tenant_id, month, monthlyRent);

    // ── 6. Sync pg_tenants ─────────────────────────────────────────────────
    await syncTenantStatus(client, pg_tenant_id, state);

    // ── 7. Activity log ────────────────────────────────────────────────────
    const logMsg = state.isPartial
      ? `${receiptNumber} ₹${paidAmount} (partial — ₹${state.currentMonthBalance} still due for ${month})`
      : `${receiptNumber} ₹${paidAmount} (${month} fully settled)`;

    await client.query(
      `INSERT INTO activity_logs
         (pg_id, action, entity_type, entity_id, performed_by_name, performed_by_role)
       VALUES ($1,$2,'payment',$3,$4,$5)`,
      [pgId, logMsg, newPayment.id, req.actor?.name || 'Staff', req.actor?.role || 'staff']
    );

    await client.query('COMMIT');

    res.status(201).json({
      ...newPayment,
      current_month_balance : state.currentMonthBalance,
      prev_balance          : state.prevBalance,
      total_outstanding     : state.totalOutstanding,
      is_partial            : state.isPartial,
      payment_status        : state.paymentStatus,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('createPayment error:', e);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE PAYMENT
// ─────────────────────────────────────────────────────────────────────────────
const deletePayment = async (req, res) => {
  const { pgId, paymentId } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT p.*, pt.monthly_rent
         FROM payments p
         JOIN pg_tenants pt ON pt.id = p.pg_tenant_id
        WHERE p.id = $1 AND p.pg_id = $2`,
      [paymentId, pgId]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Payment not found.' });
    }
    const payment     = rows[0];
    const monthlyRent = parseFloat(payment.monthly_rent) || 0;

    await client.query(`DELETE FROM payments WHERE id = $1`, [paymentId]);

    // Recalculate from surviving rows — deleted row is already gone
    const state = await calcTenantState(client, payment.pg_tenant_id, payment.month, monthlyRent);
    await syncTenantStatus(client, payment.pg_tenant_id, state);

    await client.query(
      `INSERT INTO activity_logs
         (pg_id, action, entity_type, entity_id, performed_by_name, performed_by_role)
       VALUES ($1,$2,'payment',$3,$4,$5)`,
      [
        pgId,
        `Deleted ${payment.receipt_number} ₹${payment.paid_amount} — ${payment.month} reverted to '${state.paymentStatus}'`,
        paymentId,
        req.actor?.name || 'Staff', req.actor?.role || 'staff',
      ]
    );

    await client.query('COMMIT');

    res.json({
      message               : 'Payment deleted successfully.',
      reverted_status       : state.paymentStatus,
      current_month_balance : state.currentMonthBalance,
      prev_balance          : state.prevBalance,
      total_outstanding     : state.totalOutstanding,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('deletePayment error:', e);
    res.status(500).json({ message: 'Failed to delete payment.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE PAYMENT
// ─────────────────────────────────────────────────────────────────────────────
const updatePayment = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { pgId, paymentId } = req.params;
    const { amount, payment_date, payment_mode, transaction_ref, month, notes } = req.body;

    if (!amount || parseFloat(amount) <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'amount must be a positive number.' });
    }

    const { rows: old } = await client.query(
      `SELECT p.*, pt.monthly_rent
         FROM payments p
         JOIN pg_tenants pt ON pt.id = p.pg_tenant_id
        WHERE p.id = $1 AND p.pg_id = $2`,
      [paymentId, pgId]
    );
    if (!old.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Payment not found.' });
    }

    const oldPayment  = old[0];
    const monthlyRent = parseFloat(oldPayment.monthly_rent) || 0;
    const paidAmount  = parseFloat(amount);
    const newMonth    = month || oldPayment.month;

    const { rows: updated } = await client.query(
      `UPDATE payments
          SET paid_amount     = $1,
              amount          = $1,
              payment_date    = $2,
              month           = $3,
              payment_mode    = $4,
              transaction_ref = $5,
              notes           = $6
        WHERE id = $7 AND pg_id = $8
        RETURNING *`,
      [
        paidAmount,
        payment_date    || oldPayment.payment_date,
        newMonth,
        payment_mode    || oldPayment.payment_mode,
        transaction_ref ?? oldPayment.transaction_ref,
        notes           ?? oldPayment.notes,
        paymentId, pgId,
      ]
    );

    const state = await calcTenantState(client, oldPayment.pg_tenant_id, newMonth, monthlyRent);
    await syncTenantStatus(client, oldPayment.pg_tenant_id, state);

    await client.query('COMMIT');

    res.json({
      ...updated[0],
      current_month_balance : state.currentMonthBalance,
      prev_balance          : state.prevBalance,
      total_outstanding     : state.totalOutstanding,
      is_partial            : state.isPartial,
      payment_status        : state.paymentStatus,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('updatePayment error:', e);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT CSV
// ─────────────────────────────────────────────────────────────────────────────
const exportPaymentsCSV = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { start_date, end_date, month } = req.query;

    let conds = ['p.pg_id = $1'], params = [pgId], idx = 2;
    if (start_date) { conds.push(`p.payment_date >= $${idx++}`); params.push(start_date); }
    if (end_date)   { conds.push(`p.payment_date <= $${idx++}`); params.push(end_date); }
    if (month)      { conds.push(`p.month = $${idx++}`);         params.push(month); }

    const result = await pool.query(
      `SELECT p.receipt_number, pt.name AS tenant_name, pt.phone, r.room_number,
              p.amount, p.paid_amount, p.monthly_rent, p.payment_date,
              p.month, p.payment_mode, p.transaction_ref, p.status, p.notes
         FROM payments p
         LEFT JOIN pg_tenants pt ON p.pg_tenant_id = pt.id
         LEFT JOIN rooms r ON pt.room_id = r.id
        WHERE ${conds.join(' AND ')}
        ORDER BY p.payment_date DESC`,
      params
    );

    const headers = [
      'Receipt No','Tenant Name','Phone','Room',
      'Paid Amount','Monthly Rent','Date','Month',
      'Method','Reference','Status','Notes',
    ];
    const rows = result.rows.map(r => [
      r.receipt_number, r.tenant_name, r.phone, r.room_number,
      r.paid_amount, r.monthly_rent,
      r.payment_date?.toISOString().split('T')[0], r.month,
      r.payment_mode, r.transaction_ref || '', r.status, r.notes || '',
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="payments-${pgId}-${Date.now()}.csv"`);
    res.send(csv);
  } catch (e) {
    console.error('exportPaymentsCSV error:', e);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSES
// ─────────────────────────────────────────────────────────────────────────────
const getExpenses = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { category, status, page = 1, limit = 15 } = req.query;

    let conds = ['pg_id = $1'], params = [pgId], idx = 2;
    if (category && category !== 'all') { conds.push(`category = $${idx++}`); params.push(category); }
    if (status   && status   !== 'all') { conds.push(`status = $${idx++}`);   params.push(status); }

    const where  = `WHERE ${conds.join(' AND ')}`;
    const offset = (page - 1) * limit;

    const [count, expenses, stats, distribution, monthlyTrend] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM expenses ${where}`, params),
      pool.query(
        `SELECT * FROM expenses ${where} ORDER BY expense_date DESC LIMIT $${idx} OFFSET $${idx+1}`,
        [...params, parseInt(limit), offset]
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(amount) FILTER (WHERE DATE_TRUNC('month',expense_date)=DATE_TRUNC('month',CURRENT_DATE)),0)                     AS total_this_month,
           COALESCE(SUM(amount) FILTER (WHERE DATE_TRUNC('month',expense_date)=DATE_TRUNC('month',CURRENT_DATE-INTERVAL '1 month')),0)  AS total_last_month,
           COALESCE(SUM(amount) FILTER (WHERE status='pending' AND (due_date IS NULL OR due_date<=CURRENT_DATE+7)),0)                   AS upcoming_bills
         FROM expenses WHERE pg_id=$1`,
        [pgId]
      ),
      pool.query(
        `SELECT category, SUM(amount) AS total
           FROM expenses
          WHERE pg_id=$1 AND DATE_TRUNC('month',expense_date)=DATE_TRUNC('month',CURRENT_DATE)
          GROUP BY category ORDER BY total DESC`,
        [pgId]
      ),
      pool.query(
        `SELECT TO_CHAR(DATE_TRUNC('month',expense_date),'Mon') AS month,
                DATE_TRUNC('month',expense_date) AS md,
                SUM(amount) AS total
           FROM expenses
          WHERE pg_id=$1 AND expense_date>=NOW()-INTERVAL '6 months'
          GROUP BY md ORDER BY md`,
        [pgId]
      ),
    ]);

    res.json({
      expenses     : expenses.rows,
      total        : parseInt(count.rows[0].count),
      stats        : stats.rows[0],
      distribution : distribution.rows,
      monthlyTrend : monthlyTrend.rows,
    });
  } catch (e) {
    console.error('getExpenses error:', e);
    res.status(500).json({ message: 'Server error' });
  }
};

const createExpense = async (req, res) => {
  try {
    const { description, sub_description, category, amount, expense_date, due_date, status, invoice_number, vendor } = req.body;
    const r = await pool.query(
      `INSERT INTO expenses
         (pg_id,description,sub_description,category,amount,expense_date,due_date,status,invoice_number,vendor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.params.pgId, description, sub_description, category, amount, expense_date, due_date || null, status || 'paid', invoice_number, vendor]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error('createExpense error:', e);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateExpense = async (req, res) => {
  try {
    const { description, sub_description, category, amount, expense_date, status, vendor } = req.body;
    const r = await pool.query(
      `UPDATE expenses
          SET description=$1, sub_description=$2, category=$3,
              amount=$4, expense_date=$5, status=$6, vendor=$7
        WHERE id=$8 AND pg_id=$9 RETURNING *`,
      [description, sub_description, category, amount, expense_date, status, vendor, req.params.expenseId, req.params.pgId]
    );
    if (!r.rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('updateExpense error:', e);
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteExpense = async (req, res) => {
  try {
    const r = await pool.query(
      'DELETE FROM expenses WHERE id=$1 AND pg_id=$2 RETURNING id',
      [req.params.expenseId, req.params.pgId]
    );
    if (!r.rows.length) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('deleteExpense error:', e);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getPayments, createPayment, updatePayment, deletePayment, exportPaymentsCSV,
  getExpenses, createExpense, updateExpense, deleteExpense,
};