const path = require('path');
const express = require('express');
const chatHandler = require('./api/chat');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.all('/api/chat', chatHandler);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Index.html'));
});

app.listen(PORT, () => {
  console.log(`CareAnywhere listening on port ${PORT}`);
});
