const twilio = require('twilio');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// All credentials via environment variables (set these in Railway)
const ACCOUNT_SID = process.env.TWILIO_SID;
const AUTH_TOKEN = process.env.TWILIO_TOKEN;
const FROM_NUMBER = process.env.TWILIO_FROM;
const TO_NUMBER = process.env.TO_NUMBER;

const client = twilio(ACCOUNT_SID, AUTH_TOKEN);
const REMINDERS_FILE = path.join(__dirname, 'reminders.json');

function loadReminders() {
  try { return JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8')); }
  catch { return []; }
}

function saveReminders(reminders) {
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
}

cron.schedule('0 8 * * *', () => {
  const pst = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const month = pst.getMonth() + 1;
  const day = pst.getDate();
  const todays = loadReminders().filter(r => r.month === month && r.day === day);
  todays.forEach(r => {
    client.messages.create({ body: `Reminder: ${r.label}`, from: FROM_NUMBER, to: TO_NUMBER })
      .then(m => console.log('Sent:', r.label))
      .catch(e => console.error('Error:', e.message));
  });
}, { timezone: 'America/Los_Angeles' });

console.log('Reminder system running. Texts at 8:00 AM PST daily.');
