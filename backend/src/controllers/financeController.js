"use strict";

/**
 * Finance Controller — Fixed ledger calculations
 *
 * ROOT CAUSE OF THE BUG:
 *   Both getPgLedger and getTenantLedger were grouping payments by
 *   payment_date (when money was received) instead of by the `month`
 *   column (which rent period the payment covers).
 *
 *   Result: A payment of ₹13,000 made in April for both April + March
 *   would show ALL under April, leaving March as DUE forever.
 *
 * THE FIX:
 *   Always group/filter payments by the `month` column, not payment_date.
 *   The `month` column = "which rent period does this payment cover".
 */

const pool = require("../config/db");

// ─────────────────────────────────────────────────────────────────────────────
// GET PAYMENTS LIST
// GET /pg/:pgId/payments
// ─────────────────────────────────────────────────────────────────────────────
const getPayments = async (req, res) => {
  try {
    const { pgId } = req.params;
    const {
      search,
      method,
      status,
      start_date,
      end_date,
      month,
      page = 1,
      limit = 15,
    } = req.query;

    let conds = ["p.pg_id=$1"],
      params = [pgId],
      idx = 2;
    if (search) {
      conds.push(`pt.name ILIKE $${idx++}`);
      params.push(`%${search}%`);
    }
    if (method && method !== "all") {
      conds.push(`p.payment_mode=$${idx++}`);
      params.push(method);
    }
    if (status && status !== "all") {
      conds.push(`p.status=$${idx++}`);
      params.push(status);
    }
    if (start_date) {
      conds.push(`p.payment_date>=$${idx++}`);
      params.push(start_date);
    }
    if (end_date) {
      conds.push(`p.payment_date<=$${idx++}`);
      params.push(end_date);
    }

    // FIXED: filter by the `month` column (rent period), not payment_date
    if (month) {
      conds.push(
        `DATE_TRUNC('month', p.month::date) = DATE_TRUNC('month', $${idx++}::date)`,
      );
      params.push(month);
    }

    const where = `WHERE ${conds.join(" AND ")}`;
    const offset = (page - 1) * limit;

    const [count, payments, summary] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FROM payments p LEFT JOIN pg_tenants pt ON p.pg_tenant_id=pt.id ${where}`,
        params,
      ),
      pool.query(
        `SELECT p.*,
            pt.name         AS tenant_name,
            pt.phone        AS tenant_phone,
            pt.monthly_rent AS tenant_rent,
            r.room_number,
            b.bed_label
         FROM payments p
         LEFT JOIN pg_tenants pt ON p.pg_tenant_id=pt.id
         LEFT JOIN rooms r ON pt.room_id=r.id
         LEFT JOIN beds  b ON pt.bed_id=b.id
         ${where}
         ORDER BY p.payment_date DESC, p.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, parseInt(limit), offset],
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(monthly_rent), 0)                                              AS total_rent,
           COALESCE(SUM(monthly_rent) FILTER (WHERE payment_status='paid'),    0)      AS total_collected,
           COALESCE(SUM(monthly_rent) FILTER (WHERE payment_status='due'),     0)      AS total_outstanding,
           COALESCE(SUM(monthly_rent) FILTER (WHERE payment_status='partial'), 0)      AS total_partial
         FROM pg_tenants WHERE pg_id=$1 AND status='active'`,
        [pgId],
      ),
    ]);

    res.json({
      payments: payments.rows,
      total: parseInt(count.rows[0].count),
      summary: summary.rows[0],
    });
  } catch (e) {
    console.error("getPayments error:", e);
    res.status(500).json({ message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET PG-WIDE LEDGER — current month status for all active tenants
// GET /pg/:pgId/payments/ledger
//
// FIX: prev_balance now uses the `month` column on payments, not payment_date.
// This means a payment recorded in April but covering March correctly reduces
// March's outstanding balance — and therefore prev_balance.
// ─────────────────────────────────────────────────────────────────────────────
const getPgLedger = async (req, res) => {
  try {
    const { pgId } = req.params;

    const { rows: ledger } = await pool.query(
      `
      WITH

      -- Step 1: What has been paid whose month = current month
      current_month_payments AS (
        SELECT
          pg_tenant_id,
          COALESCE(SUM(paid_amount), 0) AS paid_this_month
        FROM payments
        WHERE pg_id = $1
          AND DATE_TRUNC('month', month::date) = DATE_TRUNC('month', CURRENT_DATE)
          AND status != 'failed'
        GROUP BY pg_tenant_id
      ),

      -- Step 2: True previous balance
      --   = total rent owed from joining until end of last month
      --   MINUS total paid for all months BEFORE current month
      --   (using the 'month' column — i.e. which period each payment covers)
      --
      --   This correctly handles:
      --   - Tenant paying April + March together in April → March prev_balance = 0
      --   - Tenant who never paid March → prev_balance = ₹6,500
      --   - Tenant joining mid-year → only counts months from join date
      prev_balances AS (
        SELECT
          pt.id AS pg_tenant_id,
          GREATEST(0,
            -- Months of rent owed before current month
            GREATEST(0,
              EXTRACT(YEAR  FROM AGE(DATE_TRUNC('month', CURRENT_DATE), DATE_TRUNC('month', COALESCE(pt.joining_date, CURRENT_DATE)))) * 12 +
              EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', CURRENT_DATE), DATE_TRUNC('month', COALESCE(pt.joining_date, CURRENT_DATE))))
            )::numeric * pt.monthly_rent
            -
            -- Total paid for months BEFORE current month (by the month the payment covers, not when paid)
            COALESCE((
              SELECT SUM(p2.paid_amount)
              FROM payments p2
              WHERE p2.pg_tenant_id = pt.id
                AND DATE_TRUNC('month', p2.month::date) < DATE_TRUNC('month', CURRENT_DATE)
                AND p2.status != 'failed'
            ), 0)
          ) AS prev_balance
        FROM pg_tenants pt
        WHERE pt.pg_id = $1 AND pt.status = 'active'
      )

      SELECT
        pt.id                                                       AS tenant_id,
        pt.name                                                     AS tenant_name,
        pt.phone,
        pt.monthly_rent                                             AS rent_amount,
        r.room_number,
        b.bed_label,

        -- How much paid for current month
        COALESCE(cp.paid_this_month, 0)                             AS paid_amount,

        -- Carry-forward from months before current month
        COALESCE(pb.prev_balance, 0)                                AS prev_balance,

        -- Gap remaining for current month
        GREATEST(0, pt.monthly_rent - COALESCE(cp.paid_this_month, 0)) AS balance_due,

        -- Effective status for this month
        CASE
          WHEN COALESCE(cp.paid_this_month, 0) >= pt.monthly_rent AND COALESCE(pb.prev_balance, 0) = 0
            THEN 'paid'
          WHEN COALESCE(cp.paid_this_month, 0) >= pt.monthly_rent AND COALESCE(pb.prev_balance, 0) > 0
            THEN 'prev_due'   -- this month paid but old dues remain
          WHEN COALESCE(cp.paid_this_month, 0) > 0
            THEN 'partial'
          ELSE 'due'
        END AS effective_status,

        -- Legacy field — kept for frontend compatibility
        CASE
          WHEN COALESCE(cp.paid_this_month, 0) >= pt.monthly_rent THEN 'paid'
          WHEN COALESCE(cp.paid_this_month, 0) > 0                THEN 'partial'
          ELSE 'due'
        END AS status

      FROM pg_tenants pt
      LEFT JOIN rooms r ON pt.room_id = r.id
      LEFT JOIN beds  b ON pt.bed_id  = b.id
      LEFT JOIN current_month_payments cp ON cp.pg_tenant_id = pt.id
      LEFT JOIN prev_balances          pb ON pb.pg_tenant_id = pt.id
      WHERE pt.pg_id = $1 AND pt.status = 'active'
      ORDER BY pt.name
      `,
      [pgId],
    );

    const summary = {
      total_rent: ledger.reduce(
        (s, r) => s + parseFloat(r.rent_amount || 0),
        0,
      ),
      total_collected: ledger.reduce(
        (s, r) => s + parseFloat(r.paid_amount || 0),
        0,
      ),
      total_outstanding: ledger.reduce(
        (s, r) => s + parseFloat(r.balance_due || 0),
        0,
      ),
      total_prev_dues: ledger.reduce(
        (s, r) => s + parseFloat(r.prev_balance || 0),
        0,
      ),
    };

    res.json({ ledger, summary });
  } catch (e) {
    console.error("getPgLedger error:", e);
    res.status(500).json({ message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET TENANT LEDGER — month-by-month history for one tenant
// GET /pg/:pgId/tenants/:tenantId/ledger
//
// FIX: groups payments by the `month` column (rent period covered),
// not by payment_date. So ₹13,000 paid in April covering both March and April
// is correctly split: ₹6,500 under March, ₹6,500 under April.
// ─────────────────────────────────────────────────────────────────────────────
const getTenantLedger = async (req, res) => {
  try {
    const { pgId, tenantId } = req.params;

    const { rows: tenantRows } = await pool.query(
      `SELECT monthly_rent, joining_date, name FROM pg_tenants WHERE id=$1 AND pg_id=$2`,
      [tenantId, pgId],
    );
    if (!tenantRows.length)
      return res.status(404).json({ message: "Tenant not found" });

    const { monthly_rent, joining_date, name } = tenantRows[0];
    const joinDate = joining_date || new Date();

    const { rows: ledger } = await pool.query(
      `
      WITH

      -- Generate one row per calendar month from joining date to today
      months AS (
        SELECT DATE_TRUNC('month', gs)::date AS month
        FROM generate_series(
          DATE_TRUNC('month', $1::date),
          DATE_TRUNC('month', CURRENT_DATE),
          '1 month'::interval
        ) gs
      ),

      -- FIXED: group by the payment's 'month' column (which period it covers)
      -- NOT by payment_date (when it was physically paid)
      month_payments AS (
        SELECT
          DATE_TRUNC('month', p.month::date)::date          AS month,
          COALESCE(SUM(p.paid_amount), 0)                   AS paid_amount,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'receipt_number', p.receipt_number,
              'paid_amount',    p.paid_amount,
              'payment_date',   p.payment_date,
              'payment_mode',   p.payment_mode
            ) ORDER BY p.payment_date
          ) AS payments
        FROM payments p
        WHERE p.pg_tenant_id = $2
          AND p.status != 'failed'
        GROUP BY DATE_TRUNC('month', p.month::date)::date
      )

      SELECT
        m.month,
        $3::numeric                                                     AS rent_amount,
        COALESCE(mp.paid_amount, 0)                                     AS paid_amount,
        GREATEST(0, $3::numeric - COALESCE(mp.paid_amount, 0))          AS balance_due,
        CASE
          WHEN COALESCE(mp.paid_amount, 0) > $3::numeric  THEN 'overpaid'
          WHEN COALESCE(mp.paid_amount, 0) >= $3::numeric THEN 'paid'
          WHEN COALESCE(mp.paid_amount, 0) > 0            THEN 'partial'
          ELSE 'due'
        END                                                             AS status,
        COALESCE(mp.payments, '[]'::json)                               AS payments
      FROM months m
      LEFT JOIN month_payments mp ON mp.month = m.month
      ORDER BY m.month DESC
      `,
      [joinDate, tenantId, monthly_rent],
    );

    const summary = {
      tenant_name: name,
      total_rent: ledger.reduce(
        (s, r) => s + parseFloat(r.rent_amount || 0),
        0,
      ),
      total_paid: ledger.reduce(
        (s, r) => s + parseFloat(r.paid_amount || 0),
        0,
      ),
      total_outstanding: ledger.reduce(
        (s, r) => s + parseFloat(r.balance_due || 0),
        0,
      ),
    };

    res.json({ ledger, summary });
  } catch (e) {
    console.error("getTenantLedger error:", e);
    res.status(500).json({ message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE PAYMENT
// POST /pg/:pgId/payments
// ─────────────────────────────────────────────────────────────────────────────
const createPayment = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { pgId } = req.params;
    const {
      pg_tenant_id,
      amount,
      payment_date,
      payment_mode,
      transaction_ref,
      month,
      notes,
    } = req.body;

    // Validate
    if (!pg_tenant_id || !amount || !payment_date || !month) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "pg_tenant_id, amount, payment_date and month are required.",
      });
    }
    const paidAmount = parseFloat(amount);
    if (isNaN(paidAmount) || paidAmount <= 0) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ message: "amount must be a positive number." });
    }

    // Validate tenant belongs to this PG
    const { rows: tenantRows } = await client.query(
      `SELECT monthly_rent, name FROM pg_tenants WHERE id=$1 AND pg_id=$2`,
      [pg_tenant_id, pgId],
    );
    if (!tenantRows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Tenant not found for this PG." });
    }
    const { monthly_rent } = tenantRows[0];
    const monthlyRent = parseFloat(monthly_rent || 0);

    // Normalise month to first of month
    const { rows: monthRows } = await client.query(
      `SELECT DATE_TRUNC('month', $1::date)::date AS month`,
      [month],
    );
    const normalizedMonth = monthRows[0].month;

    // Total already paid for this month (by the month the payments cover)
    const { rows: existingRows } = await client.query(
      `SELECT COALESCE(SUM(paid_amount), 0) AS already_paid
       FROM payments
       WHERE pg_tenant_id = $1
         AND DATE_TRUNC('month', month::date) = $2
         AND status != 'failed'`,
      [pg_tenant_id, normalizedMonth],
    );
    const alreadyPaid = parseFloat(existingRows[0].already_paid) || 0;
    const newTotalPaid = alreadyPaid + paidAmount;
    const isPartial = newTotalPaid < monthlyRent;
    const balanceDue = Math.max(0, monthlyRent - newTotalPaid);

    // Atomic receipt number
    const { rows: receiptRows } = await client.query(
      `SELECT next_receipt_number() AS receipt_number`,
    );
    const receipt_number = receiptRows[0].receipt_number;

    const { rows: paymentRows } = await client.query(
      `INSERT INTO payments
         (pg_id, pg_tenant_id, receipt_number, amount, paid_amount, balance_due,
          is_partial, payment_date, month, payment_mode, transaction_ref, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'settled')
       RETURNING *`,
      [
        pgId,
        pg_tenant_id,
        receipt_number,
        paidAmount,
        paidAmount,
        balanceDue,
        isPartial,
        payment_date,
        normalizedMonth,
        payment_mode || "cash",
        transaction_ref || null,
        notes || null,
      ],
    );

    // Update pg_tenants payment_status based on current month total
    const paymentStatus =
      newTotalPaid >= monthlyRent
        ? "paid"
        : newTotalPaid > 0
          ? "partial"
          : "due";
    await client.query(`UPDATE pg_tenants SET payment_status=$1 WHERE id=$2`, [
      paymentStatus,
      pg_tenant_id,
    ]);

    await client.query(
      `INSERT INTO activity_logs (pg_id, action, entity_type, entity_id, performed_by_name, performed_by_role)
       VALUES ($1,$2,'payment',$3,$4,$5)`,
      [
        pgId,
        `Payment: ${receipt_number} ₹${paidAmount}${isPartial ? ` (partial, ₹${balanceDue} still due)` : " (settled)"}`,
        paymentRows[0].id,
        req.actor?.name || "Staff",
        req.actor?.role || "staff",
      ],
    );

    await client.query("COMMIT");
    res.status(201).json({ ...paymentRows[0], isPartial, balanceDue });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("createPayment error:", e);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE PAYMENT
// PUT /pg/:pgId/payments/:paymentId
// ─────────────────────────────────────────────────────────────────────────────
const updatePayment = async (req, res) => {
  try {
    const { pgId, paymentId } = req.params;
    const {
      amount,
      payment_date,
      payment_mode,
      transaction_ref,
      month,
      notes,
      status,
    } = req.body;

    const { rows: tenantRows } = await pool.query(
      `SELECT pt.monthly_rent FROM payments p JOIN pg_tenants pt ON p.pg_tenant_id=pt.id WHERE p.id=$1`,
      [paymentId],
    );
    const monthlyRent = parseFloat(tenantRows[0]?.monthly_rent || 0);
    const paidAmount = parseFloat(amount);
    const isPartial = monthlyRent > 0 && paidAmount < monthlyRent;
    const balanceDue = isPartial ? monthlyRent - paidAmount : 0;

    const { rows } = await pool.query(
      `UPDATE payments SET
         amount=$1, paid_amount=$2, balance_due=$3, is_partial=$4,
         payment_date=$5, month=$6, payment_mode=$7,
         transaction_ref=$8, notes=$9, status=$10
       WHERE id=$11 AND pg_id=$12 RETURNING *`,
      [
        amount,
        paidAmount,
        balanceDue,
        isPartial,
        payment_date,
        month,
        payment_mode,
        transaction_ref,
        notes,
        status || "settled",
        paymentId,
        pgId,
      ],
    );
    if (!rows.length)
      return res.status(404).json({ message: "Payment not found" });
    res.json(rows[0]);
  } catch (e) {
    console.error("updatePayment error:", e);
    res.status(500).json({ message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE PAYMENT
// DELETE /pg/:pgId/payments/:paymentId
// ─────────────────────────────────────────────────────────────────────────────
const deletePayment = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { pgId, paymentId } = req.params;

    const { rows } = await client.query(
      `SELECT p.*, pt.monthly_rent
         FROM payments p
         JOIN pg_tenants pt ON p.pg_tenant_id = pt.id
        WHERE p.id = $1 AND p.pg_id = $2`,
      [paymentId, pgId],
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Payment not found" });
    }
    const payment = rows[0];
    const monthlyRent = parseFloat(payment.monthly_rent);

    await client.query(`DELETE FROM payments WHERE id=$1`, [paymentId]);

    // Recalculate current month status using `month` column (not payment_date)
    const { rows: remaining } = await client.query(
      `SELECT COALESCE(SUM(paid_amount), 0) AS total_paid
         FROM payments
        WHERE pg_tenant_id = $1
          AND DATE_TRUNC('month', month::date) = DATE_TRUNC('month', CURRENT_DATE)
          AND status != 'failed'`,
      [payment.pg_tenant_id],
    );
    const totalPaid = parseFloat(remaining[0].total_paid) || 0;
    const newStatus =
      totalPaid >= monthlyRent ? "paid" : totalPaid > 0 ? "partial" : "due";

    await client.query(`UPDATE pg_tenants SET payment_status=$1 WHERE id=$2`, [
      newStatus,
      payment.pg_tenant_id,
    ]);

    await client.query(
      `INSERT INTO activity_logs (pg_id, action, entity_type, entity_id, performed_by_name, performed_by_role)
       VALUES ($1,$2,'payment',$3,$4,$5)`,
      [
        pgId,
        `Deleted ${payment.receipt_number} ₹${payment.paid_amount} — reverted to '${newStatus}'`,
        paymentId,
        req.actor?.name || "Staff",
        req.actor?.role || "staff",
      ],
    );

    await client.query("COMMIT");
    res.json({ message: "Payment deleted", newStatus });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("deletePayment error:", e);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT CSV
// GET /pg/:pgId/payments/export-csv
// ─────────────────────────────────────────────────────────────────────────────
const exportPaymentsCSV = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { start_date, end_date, month } = req.query;

    let conds = ["p.pg_id=$1"],
      params = [pgId],
      idx = 2;
    if (start_date) {
      conds.push(`p.payment_date>=$${idx++}`);
      params.push(start_date);
    }
    if (end_date) {
      conds.push(`p.payment_date<=$${idx++}`);
      params.push(end_date);
    }
    if (month) {
      conds.push(
        `DATE_TRUNC('month', p.month::date) = DATE_TRUNC('month', $${idx++}::date)`,
      );
      params.push(month);
    }

    const result = await pool.query(
      `SELECT p.receipt_number, pt.name AS tenant_name, pt.phone, r.room_number,
              p.amount, p.paid_amount, p.balance_due, p.is_partial,
              p.payment_date, p.month, p.payment_mode, p.transaction_ref, p.status, p.notes
         FROM payments p
         LEFT JOIN pg_tenants pt ON p.pg_tenant_id=pt.id
         LEFT JOIN rooms r ON pt.room_id=r.id
        WHERE ${conds.join(" AND ")}
        ORDER BY p.payment_date DESC`,
      params,
    );

    const headers = [
      "Receipt No",
      "Tenant Name",
      "Phone",
      "Room",
      "Amount",
      "Paid Amount",
      "Balance Due",
      "Is Partial",
      "Date",
      "Month",
      "Method",
      "Reference",
      "Status",
      "Notes",
    ];
    const rows = result.rows.map((r) => [
      r.receipt_number,
      r.tenant_name,
      r.phone,
      r.room_number,
      r.amount,
      r.paid_amount || r.amount,
      r.balance_due || 0,
      r.is_partial ? "Yes" : "No",
      r.payment_date?.toISOString().split("T")[0],
      r.month,
      r.payment_mode,
      r.transaction_ref || "",
      r.status,
      r.notes || "",
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payments-${pgId}-${Date.now()}.csv"`,
    );
    res.send(csv);
  } catch (e) {
    console.error("exportPaymentsCSV error:", e);
    res.status(500).json({ message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSES
// ─────────────────────────────────────────────────────────────────────────────
const getExpenses = async (req, res) => {
  try {
    const { pgId } = req.params;
    const { category, status, page = 1, limit = 15 } = req.query;
    let conds = ["pg_id=$1"],
      params = [pgId],
      idx = 2;
    if (category && category !== "all") {
      conds.push(`category=$${idx++}`);
      params.push(category);
    }
    if (status && status !== "all") {
      conds.push(`status=$${idx++}`);
      params.push(status);
    }
    const where = `WHERE ${conds.join(" AND ")}`;
    const offset = (page - 1) * limit;

    const [count, expenses, stats, distribution, monthlyTrend] =
      await Promise.all([
        pool.query(`SELECT COUNT(*) FROM expenses ${where}`, params),
        pool.query(
          `SELECT * FROM expenses ${where} ORDER BY expense_date DESC LIMIT $${idx} OFFSET $${idx + 1}`,
          [...params, parseInt(limit), offset],
        ),
        pool.query(
          `SELECT
          COALESCE(SUM(amount) FILTER (WHERE DATE_TRUNC('month',expense_date)=DATE_TRUNC('month',CURRENT_DATE)),0) AS total_this_month,
          COALESCE(SUM(amount) FILTER (WHERE DATE_TRUNC('month',expense_date)=DATE_TRUNC('month',CURRENT_DATE-INTERVAL '1 month')),0) AS total_last_month,
          COALESCE(SUM(amount) FILTER (WHERE status='pending' AND (due_date IS NULL OR due_date<=CURRENT_DATE+7)),0) AS upcoming_bills
        FROM expenses WHERE pg_id=$1`,
          [pgId],
        ),
        pool.query(
          `SELECT category, SUM(amount) AS total FROM expenses WHERE pg_id=$1 AND DATE_TRUNC('month',expense_date)=DATE_TRUNC('month',CURRENT_DATE) GROUP BY category ORDER BY total DESC`,
          [pgId],
        ),
        pool.query(
          `SELECT TO_CHAR(DATE_TRUNC('month',expense_date),'Mon') AS month, DATE_TRUNC('month',expense_date) AS md, SUM(amount) AS total FROM expenses WHERE pg_id=$1 AND expense_date>=NOW()-INTERVAL '6 months' GROUP BY md ORDER BY md`,
          [pgId],
        ),
      ]);

    res.json({
      expenses: expenses.rows,
      total: parseInt(count.rows[0].count),
      stats: stats.rows[0],
      distribution: distribution.rows,
      monthlyTrend: monthlyTrend.rows,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
};

const createExpense = async (req, res) => {
  try {
    const {
      description,
      sub_description,
      category,
      amount,
      expense_date,
      due_date,
      status,
      invoice_number,
      vendor,
    } = req.body;
    const r = await pool.query(
      `INSERT INTO expenses (pg_id,description,sub_description,category,amount,expense_date,due_date,status,invoice_number,vendor) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        req.params.pgId,
        description,
        sub_description,
        category,
        amount,
        expense_date,
        due_date || null,
        status || "paid",
        invoice_number,
        vendor,
      ],
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};

const updateExpense = async (req, res) => {
  try {
    const {
      description,
      sub_description,
      category,
      amount,
      expense_date,
      status,
      vendor,
    } = req.body;
    const r = await pool.query(
      `UPDATE expenses SET description=$1,sub_description=$2,category=$3,amount=$4,expense_date=$5,status=$6,vendor=$7 WHERE id=$8 AND pg_id=$9 RETURNING *`,
      [
        description,
        sub_description,
        category,
        amount,
        expense_date,
        status,
        vendor,
        req.params.expenseId,
        req.params.pgId,
      ],
    );
    if (!r.rows.length) return res.status(404).json({ message: "Not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};

const deleteExpense = async (req, res) => {
  try {
    const r = await pool.query(
      "DELETE FROM expenses WHERE id=$1 AND pg_id=$2 RETURNING id",
      [req.params.expenseId, req.params.pgId],
    );
    if (!r.rows.length) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getPayments,
  getPgLedger,
  getTenantLedger,
  createPayment,
  updatePayment,
  deletePayment,
  exportPaymentsCSV,
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
};
