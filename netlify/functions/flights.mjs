import https from 'https';

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, text: () => data, json: () => JSON.parse(data), ok: res.statusCode >= 200 && res.statusCode < 300 }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

export default async (req, context) => {
  const LAMIN = 24, LAMAX = 50, LOMIN = -126, LOMAX = -66;
  const isDelta = (cs) => cs && (cs.trim().startsWith('DAL') || cs.trim().startsWith('DL'));
  const clientId     = Netlify.env.get('OPENSKY_CLIENT_ID');
  const clientSecret = Netlify.env.get('OPENSKY_CLIENT_SECRET');

  try {
    const tokenBody = 'grant_type=client_credentials&client_id=' + encodeURIComponent(clientId) + '&client_secret=' + encodeURIComponent(clientSecret);
    const tokenRes = await httpsRequest(
      'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(tokenBody) }, body: tokenBody }
    );
    if (!tokenRes.ok) {
      return new Response(JSON.stringify({ error: 'Token failed: ' + tokenRes.status + ' ' + tokenRes.text(), flights: [] }),
        { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const { access_token } = tokenRes.json();
    const dataRes = await httpsRequest(
      'https://opensky-network.org/api/states/all?lamin=' + LAMIN + '&lamax=' + LAMAX + '&lomin=' + LOMIN + '&lomax=' + LOMAX,
      { headers: { 'Authorization': 'Bearer ' + access_token } }
    );
    if (!dataRes.ok) {
      return new Response(JSON.stringify({ error: 'Data failed: ' + dataRes.status, flights: [] }),
        { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const d = dataRes.json();
    const flights = (d.states || [])
      .filter(s => isDelta((s[1] || '').trim()) && s[5] && s[6])
      .map(s => ({
        callsign: (s[1] || '').trim(), lat: s[6], lon: s[5],
        alt: s[7] ? Math.round(s[7] * 3.281) : null,
        spd: s[9] ? Math.round(s[9] * 1.944) : null,
        heading: s[10] ? Math.round(s[10]) : null,
        actype: 'A220'
      }));
    return new Response(JSON.stringify({ flights, source: 'opensky', count: flights.length }),
      { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, flights: [] }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
