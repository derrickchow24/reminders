const express = require('express');
const cron = require('node-cron');
const { getMyTeam, getFreeAgents } = require('./espn');
const { generateReport } = require('./agent');

module.exports = function fantasyRouter(pool) {
  const router = express.Router();
  let generating = false;
  let lastError = null;

  async function initDB() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fantasy_reports (
        id SERIAL PRIMARY KEY,
        week INTEGER,
        markdown TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async function runReport() {
    if (generating) return;
    generating = true;
    lastError = null;
    try {
      const { markdown, week } = await generateReport();
      await pool.query('INSERT INTO fantasy_reports (week, markdown) VALUES ($1, $2)', [week, markdown]);
      console.log('Fantasy report generated for week', week);
    } catch (e) {
      lastError = e.message;
      console.error('Fantasy report failed:', e.message);
    } finally {
      generating = false;
    }
  }

  router.get('/team', async (req, res) => {
    try {
      res.json(await getMyTeam());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/free-agents', async (req, res) => {
    try {
      res.json(await getFreeAgents());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/report', async (req, res) => {
    try {
      const result = await pool.query('SELECT week, markdown, created_at FROM fantasy_reports ORDER BY created_at DESC LIMIT 1');
      res.json({ report: result.rows[0] || null, generating, error: lastError });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/report', (req, res) => {
    runReport();
    res.status(202).json({ generating: true });
  });

  // Daily 7:00 AM PT report (catches overnight news + Tuesday/Wednesday waivers)
  cron.schedule('0 7 * * *', runReport, { timezone: 'America/Los_Angeles' });

  router.init = initDB;
  return router;
};
