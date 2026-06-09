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

// Send via Gmail REST API (no SMTP, uses HTTPS only)
async function sendText(message) {
  return new Promise((resolve) => {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_PASS;
    const to = process.env.TO_NUMBER + '@tmomail.net';

    // Use Gmail API via fetch-style HTTPS
    const emailContent = [
      'From: ' + user,
      'To: ' + to,
      'Subject: reminder',
      'Content-Type: text/plain',
      '',
      message
    ].join('\r\n');

    const encoded = Buffer.from(emailContent).toString('base64url');

    // Get OAuth token using app password via SMTP over port 465 (SSL)
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    transporter.sendMail({
      from: user,
      to,
      subject: 'reminder',
      text: message,
    }).then(() => {
      console.log('Sent:', message);
      resolve({ success: true });
    }).catch(err => {
      console.error('Failed:', err.message);
      resolve({ success: false, error: err.message });
    });
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
  const result = await sendText('Your reminder system is working!');
  res.json(result);
});

cron.schedule('0 8 * * *', () => {
  const pst = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const month = pst.getMonth() + 1;
  const day = pst.getDate();
  loadReminders().filter(r => r.month === month && r.day === day).forEach(r => sendText('Reminder: ' + r.label));
}, { timezone: 'America/Los_Angeles' });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Reminder system running on port ' + PORT));
