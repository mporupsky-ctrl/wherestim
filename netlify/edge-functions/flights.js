export default async (request, context) => {
  const LAMIN = 24, LAMAX = 50, LOMIN = -126, LOMAX = -66;
  const isDelta = (cs) => cs && (cs.trim().startsWith('DAL') || cs.trim().startsWith('DL'));
  const log = [];

  try {
    const clientId     = Deno.env.get('OPENSKY_CLIENT_ID');
    const clientSecret = Deno.env.get('OPENSKY_CLIENT_SECRET');
    log.push(`ID present: ${!!clientId}, SECRET present: ${!!clientSecret}`);

    let flights = [], source = 'none';

    if (clientId && clientSecret) {
      const tokenRes = await fetch(
        'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`
        }
      );
      log.push(`Token status: ${tokenRes.status}`);
      if (tokenRes.ok) {
        const { access_token } = await tokenRes.json();
        const dataRes = await fetch(
          `https://opensky-network.org/api/states/all?lamin=${LAMIN}&lamax=${LAMAX}&lomin=${LOMIN}&lomax=${LOMAX}`,
          { headers: { 'Authorization': `Bearer ${access_token}` } }
        );
        log.push(`Data status: ${dataRes.status}`);
        if (dataRes.ok) {
          const d = await dataRes.json();
          const pool = (d.states||[]).filter(s => isDelta((s[1]||'').trim()) && s[5] && s[6]);
          flights = pool.map(s => ({
            callsign: (s[1]||'').trim(), lat: s[6], lon: s[5],
            alt: s[7] ? Math.round(s[7] * 3.281) : null,
            spd: s[9] ? Math.round(s[9] * 1.944) : null,
            heading: s[10] ? Math.round(s[10]) : null,
            actype: 'A220',
          }));
          source = 'opensky';
        }
      }
    }

    return new Response(
      JSON.stringify({ flights, source, count: flights.length, debug: log }),
      { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
                   'Access-Control-Allow-Origin': '*' } }
    );
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message, flights: [], debug: log }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/flights' };
