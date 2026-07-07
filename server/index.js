const path = require('path');
const express = require('express');

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Statisches Frontend (Repo-Root). Dotfiles werden per Default nicht ausgeliefert.
app.use(express.static(path.join(__dirname, '..')));

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => console.log(`Dienstplan-Pro auf :${PORT}`));
}

module.exports = app;
