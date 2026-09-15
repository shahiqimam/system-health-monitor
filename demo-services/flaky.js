// Deterministic demo fixture: health is toggled explicitly, never randomly,
// so a demo can reproduce DEGRADED -> DOWN -> incident -> recovery on demand.
const { createServer } = require('http');

const PORT = Number(process.env.PORT || 8082);
let healthy = process.env.START_HEALTHY !== 'false';

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  const url = req.url || '/';

  if (url === '/health' || url === '/') {
    return healthy
      ? json(res, 200, { status: 'ok', service: 'demo-flaky' })
      : json(res, 503, { status: 'unavailable', service: 'demo-flaky' });
  }
  // Local test mechanism only. These containers are never exposed publicly.
  if (url === '/admin/fail') {
    healthy = false;
    return json(res, 200, { healthy });
  }
  if (url === '/admin/heal') {
    healthy = true;
    return json(res, 200, { healthy });
  }
  if (url === '/admin/state') {
    return json(res, 200, { healthy });
  }
  return json(res, 404, { status: 'not_found' });
}).listen(PORT, '0.0.0.0', () => console.log(`demo-flaky listening on ${PORT}`));
