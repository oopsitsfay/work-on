// Shared request handling for the metadata endpoints. The seed and difficulty come from
// HashPrints.tokenURI(), which builds them straight from chain state.
const HP = require('../../hashprints.js');

function parsePrint(query) {
  const seed = String(query.seed || '').toLowerCase();
  const d = Number(query.d);
  if (!/^0x[0-9a-f]{64}$/.test(seed)) return { error: 'seed must be 0x + 64 hex characters' };
  if (!Number.isInteger(d) || d < 16 || d > 20) return { error: 'd must be an integer from 16 to 20' };
  if (HP.leadingZeroBits(HP.fromHex(seed)) < d) return { error: 'seed does not carry enough work for d' };
  return { seed, d, art: HP.render(seed, d) };
}

function fail(res, status, message) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: message }));
}

// ERC-721 metadata for one token of a collection shape from HP.COLLECTIONS.
function metadata(req, res, c) {
  const id = Number(req.query.id);
  const max = c.runSize * c.runs + c.artistProofs;
  if (!Number.isInteger(id) || id < 1 || id > max) return fail(res, 400, `id must be 1-${max}`);
  const p = parsePrint(req.query);
  if (p.error) return fail(res, 400, p.error);

  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const qs = `seed=${p.seed}&d=${p.d}`;
  const ap = id <= c.artistProofs;
  const body = {
    name: ap ? `${c.name} A/P ${id}` : `${c.name} #${id}`,
    description: 'A 32x32 pixel print generated from the proof-of-work hash its minter found. https://hpsmine.vercel.app · X: @hashprintsnft',
    image: `${origin}/api/image?${qs}`,
    external_url: `${origin}/print.html?${c === HP.COLLECTIONS.test ? 'c=test&' : ''}id=${id}&${qs}`,
    background_color: p.art.palette[0].slice(1),
    attributes: [
      ...Object.entries(p.art.traits).map(([trait_type, value]) =>
        typeof value === 'number' ? { trait_type, value, display_type: 'number' } : { trait_type, value }),
      { trait_type: 'Run', value: ap ? 'Artist Proof' : String(Math.floor((id - c.artistProofs - 1) / c.runSize) + 1) },
      { trait_type: 'Difficulty', value: p.d, display_type: 'number' },
    ],
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(body));
}

module.exports = { HP, parsePrint, fail, metadata };
