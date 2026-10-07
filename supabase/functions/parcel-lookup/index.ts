const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function decodeJwtPayload(authorization) {
  try {
    const token = String(authorization || '').replace(/^Bearer\s+/i, '');
    const payload = token.split('.')[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

async function geocodeAddress(address) {
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
  url.searchParams.set('address', address);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) return null;
    const data = await response.json();
    const match = data?.result?.addressMatches?.[0];
    const coordinates = match?.coordinates;
    const lat = Number(coordinates?.y);
    const lon = Number(coordinates?.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      latitude: lat,
      longitude: lon,
      matched_address: match?.matchedAddress || address,
      source: 'US Census Geocoder'
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const claims = decodeJwtPayload(req.headers.get('Authorization'));
  const email = String(claims.email || '').trim().toLowerCase();
  if (!email.endsWith('@creativexteriors.com')) {
    return json({ error: 'Creativexteriors account required.' }, 403);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const address = String(payload?.address || '').trim();
  if (address.length < 5 || address.length > 250) {
    return json({ error: 'Enter a complete property address.' }, 400);
  }

  const geocode = await geocodeAddress(address);
  const regridToken = Deno.env.get('REGRID_TOKEN');
  if (!regridToken) {
    return json({
      code: 'REGRID_NOT_CONFIGURED',
      located: !!geocode,
      feature: null,
      center: geocode ? { latitude: geocode.latitude, longitude: geocode.longitude } : null,
      meta: {
        matched_address: geocode?.matched_address || address,
        latitude: geocode?.latitude || null,
        longitude: geocode?.longitude || null,
        geocode_source: geocode?.source || null
      },
      error: geocode
        ? 'Address located. Regrid is still needed for the parcel boundary.'
        : 'Regrid parcel lookup is not configured yet, and the address could not be geocoded.'
    });
  }

  const url = new URL('https://app.regrid.com/api/v2/parcels/address');
  url.searchParams.set('query', address);
  url.searchParams.set('limit', '1');
  url.searchParams.set('return_geometry', 'true');
  url.searchParams.set('return_matched_buildings', 'false');
  url.searchParams.set('return_matched_addresses', 'false');
  url.searchParams.set('return_enhanced_ownership', 'false');
  url.searchParams.set('return_zoning', 'false');

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'x-regrid-token': regridToken
      }
    });
  } catch {
    return json({ error: 'Could not reach the parcel service.' }, 502);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return json({ error: 'Parcel service returned an unreadable response.' }, 502);
  }

  if (!response.ok) {
    console.error('Regrid error', response.status, data);
    return json({ error: 'Parcel service rejected the lookup.' }, 502);
  }

  const feature = data?.parcels?.features?.[0];
  if (!feature?.geometry) {
    return json({
      code: 'PARCEL_NOT_FOUND',
      located: !!geocode,
      feature: null,
      center: geocode ? { latitude: geocode.latitude, longitude: geocode.longitude } : null,
      meta: {
        matched_address: geocode?.matched_address || address,
        latitude: geocode?.latitude || null,
        longitude: geocode?.longitude || null,
        geocode_source: geocode?.source || null
      },
      error: 'The address was located, but Regrid did not return a parcel boundary for it.'
    });
  }

  const props = feature.properties || {};
  const fields = props.fields || {};
  const path = props.path || fields.path || null;

  const safeFeature = {
    type: 'Feature',
    id: feature.id ?? null,
    geometry: feature.geometry,
    properties: {
      headline: props.headline || fields.address || address,
      path,
      ll_uuid: props.ll_uuid || fields.ll_uuid || null
    }
  };

  return json({
    feature: safeFeature,
    meta: {
      parcel_number: fields.parcelnumb || null,
      matched_address: props.headline || fields.address || address,
      city: fields.scity || fields.city || null,
      county: fields.county || null,
      state: fields.state2 || null,
      zip: fields.szip5 || fields.szip || null,
      acreage: Number(fields.ll_gisacre || fields.gisacre || 0) || null,
      square_feet: Number(fields.ll_gissqft || fields.sqft || 0) || null,
      latitude: Number(fields.lat || 0) || geocode?.latitude || null,
      longitude: Number(fields.lon || 0) || geocode?.longitude || null,
      geocode_source: geocode?.source || null,
      ll_uuid: props.ll_uuid || fields.ll_uuid || null,
      path
    },
    source_url: path ? 'https://app.regrid.com' + path : null
  });
});
