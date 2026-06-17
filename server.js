const express = require('express');
const path = require('path');

const app = express();
const PORT = 3012;

app.use(express.static(__dirname));

app.get('/favicon.ico', (_req, res) => {
  res.status(204).end();
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Progress board running at http://localhost:${PORT}`);
});
