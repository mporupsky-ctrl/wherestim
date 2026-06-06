export default async (req, context) => {
  const LAMIN = 24, LAMAX = 50, LOMIN = -126, LOMAX = -66;
  const isDelta = (cs) => cs && (cs.trim().startsWith('DAL') || cs.trim().startsWith('DL'));
  try {
    const clientId = Netlify.env.get('OPENSKY_CLIENT_ID');
    const clientSecret = Netlify.env.get('OPENSKY_CLIENT_SECRET');
    let flights = [], source = 'none';
    if (clientId && clientSecret) {
      const tokenRes = await fetch(
        'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
        { method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'grant_type=client_credentials&client_id=' + encodeURIComponent(clientId) + '&client_secret=' + encodeURIComponent(clientSecret)
        }
      );
      if (tokenRes.ok) {
        const tok = await tokenRes.json();
        const dataRes = await fetch(
          'https://opensky-network.org/api/states/all?lamin=' + LAMIN + '&lamax=' + LAMAX + '&lomin=' + LOMIN + '&lomax=' + LOMAX,
          { headers: { 'Authorization': 'Bearer ' + tok.access_token } }
        );
        if (dataRes.ok) {
          const d = await dataRes.json();
          flights = (d.states||[]).filter(function(s){ return isDelta((s[1]||'').trim()) && s[5] && s[6]; }).map(function(s){ return {
            callsign: (s[1]||'').trim(), lat: s[6], lon: s[5],
            alt: s[7] ? Math.round(s[7]*3.281) : null,
            spd: s[9] ? Math.round(s[9]*1.944) : null,
            heading: s[10] ? Math.round(s[10]) : null,
            actype: 'A220'
          }; });
          source = 'opensky';
        }
      }
    }
    return new Response(JSON.stringify({flights: flights, source: source, count: flights.length}),
      {headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
  } catch(err) {
    return new Response(JSON.stringify({error: err.message, flights: []}),
      {status: 500, headers: {'Content-Type': 'application/json'}});
  }
}
