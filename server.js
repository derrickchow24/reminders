const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const https = require('https');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Postgres connection (Railway provides DATABASE_URL automatically)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Create table if it doesn't exist
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reminders (
      id SERIAL PRIMARY KEY,
      month INTEGER NOT NULL,
      day INTEGER NOT NULL,
      label TEXT NOT NULL,
      UNIQUE(month, day, label)
    )
  `);
  console.log('DB ready');
}

async function loadReminders() {
  const result = await pool.query('SELECT month, day, label FROM reminders ORDER BY month, day');
  return result.rows;
}

async function sendNotification(message) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      token: process.env.PUSHOVER_TOKEN,
      user: process.env.PUSHOVER_USER,
      message: message,
      title: 'Reminder',
      sound: 'default',
    }).toString();

    const options = {
      hostname: 'api.pushover.net',
      port: 443,
      path: '/1/messages.json',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(params),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.status === 1) { console.log('Sent:', message); resolve({ success: true }); }
        else { console.error('Failed:', data); resolve({ success: false, error: data }); }
      });
    });
    req.on('error', (err) => resolve({ success: false, error: err.message }));
    req.write(params);
    req.end();
  });
}

app.get('/api/reminders', async (req, res) => {
  try {
    res.json(await loadReminders());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/reminders', async (req, res) => {
  const { month, day, label } = req.body;
  if (!month || !day || !label) return res.status(400).json({ error: 'Missing fields' });
  try {
    await pool.query(
      'INSERT INTO reminders (month, day, label) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [month, day, label]
    );
    res.json({ success: true, reminders: await loadReminders() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/reminders/delete', async (req, res) => {
  const { month, day, label } = req.body;
  try {
    await pool.query('DELETE FROM reminders WHERE month=$1 AND day=$2 AND label=$3', [month, day, label]);
    res.json({ success: true, reminders: await loadReminders() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/test', async (req, res) => {
  const result = await sendNotification('Your reminder system is working!');
  res.json(result);
});

cron.schedule('0 8 * * *', async () => {
  const pst = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const month = pst.getMonth() + 1;
  const day = pst.getDate();
  const reminders = await loadReminders();
  reminders.filter(r => r.month === month && r.day === day).forEach(r => sendNotification('Reminder: ' + r.label));
}, { timezone: 'America/Los_Angeles' });

const PORT = process.env.PORT || 3000;
initDB().then(() => app.listen(PORT, () => console.log('Reminder system running on port ' + PORT)));
