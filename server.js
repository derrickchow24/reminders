const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const REMINDERS_FILE = path.join(__dirname, 'reminders.json');

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
        if (parsed.status === 1) {
          console.log('Sent:', message);
          resolve({ success: true });
        } else {
          console.error('Failed:', data);
          resolve({ success: false, error: data });
        }
      });
    });

    req.on('error', (err) => {
      console.error('Error:', err.message);
      resolve({ success: false, error: err.message });
    });

    req.write(params);
    req.end();
  });
}

function loadReminders() {
  try { return JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8')); }
  catch { return []; }
}

function saveReminders(reminders) {
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
}

app.get('/api/reminders', (req, res) => res.json(loadReminders()));

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

app.post('/api/test', async (req, res) => {
  const result = await sendNotification('Your reminder system is working!');
  res.json(result);
});

cron.schedule('0 8 * * *', () => {
  const pst = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const month = pst.getMonth() + 1;
  const day = pst.getDate();
  loadReminders().filter(r => r.month === month && r.day === day).forEach(r => sendNotification('Reminder: ' + r.label));
}, { timezone: 'America/Los_Angeles' });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Reminder system running on port ' + PORT));
