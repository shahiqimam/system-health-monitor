// Deterministic demo fixture: always healthy. Not part of the product.
const { createServer } = require('http');

const PORT = Number(process.env.PORT || 8081);

createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'demo-healthy' }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ status: 'not_found' }));
}).listen(PORT, '0.0.0.0', () => console.log(`demo-healthy listening on ${PORT}`));
