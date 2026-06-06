import https from 'https';

function get(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get({ hostname: u.hostname, path: u.pathname + u.search }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, ok: res.statusCode < 300, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
  });
}

export default async (req, context) => {
  const isDelta = cs => cs && (cs.trim().toUpperCase().startsWith('DAL') || cs.trim().toUpperCase().startsWith('DL'));
  const apiKey = Netlify.env.get('AVIATIONSTACK_KEY');

  try {
    const url = 'http://api.aviationstack.com/v1/flights?access_key=' + apiKey + '&airline_iata=DL&flight_status=active&limit=100';
    const res = await get(url);
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'API error: ' + res.status + ' ' + res.body.substring(0,200), flights: [] }),
        { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const d = JSON.parse(res.body);
    if (d.error) {
      return new Response(JSON.stringify({ error: d.error.message || JSON.stringify(d.error), flights: [] }),
        { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const flights = (d.data || [])
      .filter(f => f.live && f.live.latitude && f.live.longitude)
      .map(f => ({
        callsign: f.flight.iata || f.flight.icao || 'DAL',
        lat: f.live.latitude,
        lon: f.live.longitude,
        alt: f.live.altitude ? Math.round(f.live.altitude * 3.281) : null,
        spd: f.live.speed_horizontal ? Math.round(f.live.speed_horizontal * 0.539957) : null,
        heading: f.live.direction ? Math.round(f.live.direction) : null,
        actype: 'A220',
        origin: f.departure && f.departure.iata ? f.departure.iata : null,
        dest: f.arrival && f.arrival.iata ? f.arrival.iata : null,
      }))
      .filter(f => f.lat >= 24 && f.lat <= 50 && f.lon >= -126 && f.lon <= -66);

    return new Response(JSON.stringify({ flights, source: 'aviationstack', count: flights.length }),
      { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch(err) {
    return new Response(JSON.stringify({ error: err.message, flights: [] }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
