// Web Push without a payload: only a VAPID-signed request is needed, so no message
// encryption runs in the Worker. The service worker decides what to show when it wakes.

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (s) => new TextEncoder().encode(s);

export async function generateVapid() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
  return { jwk, publicKey: b64u(raw) };
}

async function signJwt(jwk, aud, subject) {
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const head = b64u(enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc(JSON.stringify({ aud, exp, sub: subject })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc(`${head}.${body}`));
  return { token: `${head}.${body}.${b64u(sig)}`, exp };
}

// tokens: { [audience]: {token, exp} } cached by the caller between runs.
export async function sendPush(endpoint, vapid, tokens, subject) {
  const aud = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  let changed = false;
  if (!tokens[aud] || tokens[aud].exp - now < 3600) {
    tokens[aud] = await signJwt(vapid.jwk, aud, subject);
    changed = true;
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { TTL: '900', Urgency: 'high', 'Content-Length': '0', Authorization: `vapid t=${tokens[aud].token}, k=${vapid.publicKey}` },
  });
  return { status: res.status, changed };
}
