const path = require('path');
const express = require('express');
const { getDoc, putDoc } = require('./db');

const app = express();
app.use(express.json({ limit: '5mb' }));

const KEYS = ['employees', 'duties', 'vacation'];
const EMPTY = { employees: [], duties: {}, vacation: {} };

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/state', (req, res) => {
  const state = { ...EMPTY, updatedAt: null };
  for (const key of KEYS) {
    const doc = getDoc(key);
    if (doc) {
      state[key] = doc.value;
      if (!state.updatedAt || doc.updatedAt > state.updatedAt) state.updatedAt = doc.updatedAt;
    }
  }
  res.json(state);
});

app.put('/api/state', (req, res) => {
  const body = req.body || {};
  const now = new Date().toISOString();
  for (const key of KEYS) {
    if (body[key] !== undefined) putDoc(key, body[key], now);
  }
  res.json({ status: 'ok', updatedAt: now });
});

// Statisches Frontend (Repo-Root). Dotfiles werden per Default nicht ausgeliefert.
app.use(express.static(path.join(__dirname, '..')));

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => console.log(`Dienstplan-Pro auf :${PORT}`));
}

module.exports = app;
