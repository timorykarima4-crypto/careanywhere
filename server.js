const path = require('path');
const express = require('express');
const chatHandler = require('./api/chat');

const app = express();
const PORT = process.env.PORT || 3000;

// Railway sits behind a proxy. This lets us see each visitor's real IP address.
app.set('trust proxy', 1);

app.use(express.json({ limit: '100kb' }));

// ----- Limits that protect your Anthropic credit (change the numbers if needed) -----
const PER_PERSON_PER_HOUR = 20;      // chats per person per hour
const ALL_USERS_PER_DAY = 300;       // chats for everyone combined per day
const MAX_MESSAGES = 40;             // messages allowed in one conversation
const MAX_USER_MESSAGE_CHARS = 1000; // characters in one message a person types
const MAX_INSTRUCTION_CHARS = 4000;  // characters in the instructions the page sends

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const visits = new Map();
let dayCount = 0;
let dayResetAt = Date.now() + DAY;

function protectChat(req, res, next) {
  if (req.method !== 'POST') return next();

  const { messages, system } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return res.status(400).json({ error: 'Invalid conversation.' });
  }
  if (typeof system !== 'undefined' && (typeof system !== 'string' || system.length > MAX_INSTRUCTION_CHARS)) {
    return res.status(400).json({ error: 'Invalid instructions.' });
  }
  for (const m of messages) {
    if (!m || typeof m.content !== 'string' || (m.role !== 'user' && m.role !== 'assistant')) {
      return res.status(400).json({ error: 'Invalid message.' });
    }
    if (m.role === 'user' && m.content.length > MAX_USER_MESSAGE_CHARS) {
      return res.status(400).json({ error: 'Message too long.' });
    }
  }

  const now = Date.now();
  if (now > dayResetAt) {
    dayCount = 0;
    dayResetAt = now + DAY;
  }
  if (dayCount >= ALL_USERS_PER_DAY) {
    return res.status(429).json({ error: 'Daily limit reached. Please try again tomorrow.' });
  }

  const recent = (visits.get(req.ip) || []).filter(t => now - t < HOUR);
  if (recent.length >= PER_PERSON_PER_HOUR) {
    return res.status(429).json({ error: 'Too many messages. Please try again later.' });
  }
  recent.push(now);
  visits.set(req.ip, recent);
  dayCount++;
  next();
}

// Clean out old records once an hour
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of visits) {
    const recent = times.filter(t => now - t < HOUR);
    if (recent.length === 0) visits.delete(ip);
    else visits.set(ip, recent);
  }
}, HOUR).unref();

app.use('/api/chat', protectChat);
app.all('/api/chat', chatHandler);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Index.html'));
});

app.listen(PORT, () => {
  console.log(`CareAnywhere listening on port ${PORT}`);
});
