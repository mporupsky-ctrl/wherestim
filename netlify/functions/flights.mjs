import https from 'https';

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname + u.search, headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, ok: res.statusCode < 300, body: data }));
    }).on('error', reject).setTimeout(12000, function(){ this.destroy(new Error('timeout')); });
  });
}

function post(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const buf = Buffer.from(body);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { ...headers, 'Content-Length': buf.length }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, ok: res.statusCode < 300, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(new Error('timeout')); });
    req.write(buf);
    req.end();
  });
}

export default async (req, context) => {
  const LAMIN = 24, LAMAX = 50, LOMIN = -126, LOMAX = -66;
  const isDelta = cs => cs && (cs.trim().startsWith('DAL') || cs.trim().startsWith('DL'));
  const url = 'https://opensky-network.org/api/states/all?lamin='+LAMIN+'&lamax='+LAMAX+'&lomin='+LOMIN+'&lomax='+LOMAX;

  const clientId     = Netlify.env.get('OPENSKY_CLIENT_ID');
  const clientSecret = Netlify.env.get('OPENSKY_CLIENT_SECRET');
  let flights = [], source = 'none', lastError = '';

  // Try 1: OAuth
  if (clientId && clientSecret) {
    try {
      const body = 'grant_type=client_credentials&client_id='+encodeURIComponent(clientId)+'&client_secret='+encodeURIComponent(clientSecret);
      const tok = await post(
        'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
        body, { 'Content-Type': 'application/x-www-form-urlencoded' }
      );
      if (tok.ok) {
        const { access_token } = JSON.parse(tok.body);
        const data = await get(url, { 'Authorization': 'Bearer ' + access_token });
        if (data.ok) {
          const d = JSON.parse(data.body);
          flights = (d.states||[]).filter(s => isDelta((s[1]||'').trim()) && s[5] && s[6]).map(s => ({
            callsign:(s[1]||'').trim(), lat:s[6], lon:s[5],
            alt:s[7]?Math.round(s[7]*3.281):null, spd:s[9]?Math.round(s[9]*1.944):null,
            heading:s[10]?Math.round(s[10]):null, actype:'A220'
          }));
          source = 'opensky-oauth';
        }
      } else { lastError = 'token:' + tok.status + ' ' + tok.body.substring(0,100); }
    } catch(e) { lastError = 'oauth:' + e.message; }
  }

  // Try 2: Anonymous
  if (flights.length === 0) {
    try {
      const data = await get(url, { 'User-Agent': 'WheresTim/1.0' });
      if (data.ok) {
        const d = JSON.parse(data.body);
        flights = (d.states||[]).filter(s => isDelta((s[1]||'').trim()) && s[5] && s[6]).map(s => ({
          callsign:(s[1]||'').trim(), lat:s[6], lon:s[5],
          alt:s[7]?Math.round(s[7]*3.281):null, spd:s[9]?Math.round(s[9]*1.944):null,
          heading:s[10]?Math.round(s[10]):null, actype:'A220'
        }));
        source = 'opensky-anon';
      } else { lastError += ' anon:' + data.status; }
    } catch(e) { lastError += ' anon:' + e.message; }
  }

  if (flights.length === 0) {
    return new Response(JSON.stringify({ error: lastError, flights: [], source: 'none' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ flights, source, count: flights.length }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
