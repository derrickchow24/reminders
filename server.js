const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const twilio = require('twilio');
const cron = require('node-cron');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// All credentials via environment variables (set these in Railway)
const ACCOUNT_SID = process.env.TWILIO_SID;
const AUTH_TOKEN = process.env.TWILIO_TOKEN;
const FROM_NUMBER = process.env.TWILIO_FROM;
const TO_NUMBER = process.env.TO_NUMBER;
const REMINDERS_FILE = path.join(__dirname, 'reminders.json');

const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

function loadReminders() {
  try { return JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8')); }
  catch { return []; }
}

function saveReminders(reminders) {
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
}

app.get('/api/reminders', (req, res) => {
  res.json(loadReminders());
});

app.post('/api/reminders', (req, res) => {
  const { month, day, label } = req.body;
  if (!month || !day || !label) return res.status(400).json({ error: 'Missing fields' });
  const reminders = loadReminders();
  const filtered = reminders.filter(r => !(r.month === month && r.day === day && r.label === label));
  filtered.push({ month, day, label });
  filtered.sort((a, b) => a.month !== b.month ? a.month - b.month : a.day - b.day);
  saveReminders(filtered);
  res.json({ success: true, reminders: filtered });
});

app.delete('/api/reminders', (req, res) => {
  const { month, day, label } = req.body;
  const reminders = loadReminders();
  const filtered = reminders.filter(r => !(r.month === month && r.day === day && r.label === label));
  saveReminders(filtered);
  res.json({ success: true, reminders: filtered });
});

// Daily cron at 8am PST
cron.schedule('0 8 * * *', () => {
  const now = new Date();
  const pst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const month = pst.getMonth() + 1;
  const day = pst.getDate();
  const reminders = loadReminders();
  const todays = reminders.filter(r => r.month === month && r.day === day);
  todays.forEach(r => {
    client.messages.create({ body: `Reminder: ${r.label}`, from: FROM_NUMBER, to: TO_NUMBER })
      .then(m => console.log('Sent:', r.label, m.sid))
      .catch(e => console.error('Error:', e.message));
  });
}, { timezone: 'America/Los_Angeles' });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Reminder system running on port ${PORT}`));
