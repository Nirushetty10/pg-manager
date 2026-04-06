"use strict";

/**
 * Cron: Monthly Rent Due Generator
 *
 * Runs daily at midnight. For each active tenant, inserts a rent_ledger
 * row for the current month if one doesn't already exist.
 *
 * Uses ON CONFLICT DO NOTHING — safe to run multiple times per day.
 *
 * Setup:
 *   npm install node-cron
 *
 * Usage:
 *   require('./jobs/generateMonthlyDues');   // in your app entry point
 */

const cron = require("node-cron");
const pool = require("../config/db");

// ── Core function (exported so you can also call it manually / from tests) ────
async function generateMonthlyDues() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // DATE_TRUNC gives '2026-04-01' for any day in April 2026
    const currentMonth = await client.query(
      `SELECT DATE_TRUNC('month', CURRENT_DATE)::DATE AS month`,
    );
    const month = currentMonth.rows[0].month;

    // Insert one ledger row per active tenant for current month.
    // ON CONFLICT DO NOTHING means re-running is always safe.
    const result = await client.query(
      `INSERT INTO rent_ledger (tenant_id, pg_id, month, rent_amount, paid_amount, balance_due, status)
       SELECT
         t.id          AS tenant_id,
         t.pg_id       AS pg_id,
         $1            AS month,
         t.monthly_rent AS rent_amount,
         0             AS paid_amount,
         t.monthly_rent AS balance_due,
         'due'         AS status
       FROM pg_tenants t
       WHERE t.status = 'active'
       ON CONFLICT (tenant_id, month) DO NOTHING
       RETURNING id, tenant_id, month`,
      [month],
    );

    await client.query("COMMIT");

    const count = result.rowCount;
    if (count > 0) {
      console.log(
        `[DueGen] ${new Date().toISOString()} — Created ${count} ledger rows for ${month}`,
      );
    } else {
      console.log(
        `[DueGen] ${new Date().toISOString()} — All tenants already have ledger for ${month}`,
      );
    }

    return { month, created: count };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[DueGen] Failed to generate monthly dues:", err);
    throw err;
  } finally {
    client.release();
  }
}

// ── Schedule: runs every day at 00:05 ─────────────────────────────────────────
// The 5-minute offset avoids the exact midnight spike on the DB.
// Cron format: minute hour day month weekday
cron.schedule(
  "5 0 * * *",
  async () => {
    console.log("[DueGen] Running scheduled monthly due generation...");
    try {
      await generateMonthlyDues();
    } catch (err) {
      // Already logged inside generateMonthlyDues — don't crash the process
    }
  },
  {
    timezone: "Asia/Kolkata", // ← change to your server timezone
  },
);

console.log("[DueGen] Scheduled: daily at 00:05 IST");

module.exports = { generateMonthlyDues };
