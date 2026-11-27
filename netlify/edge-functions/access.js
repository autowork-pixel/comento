const encoder = new TextEncoder();

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(bytes, character => character.charCodeAt(0));
}

async function verify(token, secret) {
  if (!secret || secret.length < 32 || !token || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [encoded, signature] = token.split('.');
  try {
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('HMAC', key, decodeBase64Url(signature), encoder.encode(encoded))) return null;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded)));
    const now = Date.now();
    if (!payload.studentId || !Number.isFinite(payload.exp) || now >= payload.exp ||
        (payload.nbf && now < payload.nbf)) return null;
    return payload;
  } catch { return null; }
}

export default async function handler(request, context) {
  const secret = Netlify.env.get('ACCESS_SIGNING_KEY');
  const url = new URL(request.url);
  const supplied = url.searchParams.get('access');
  const cookie = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith('comento_session='))?.slice(16);
  const token = supplied || cookie;
  const payload = await verify(token, secret);
  if (!payload) return new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><title>접속 불가</title><body><h1>접속할 수 없습니다</h1><p>수강생 링크가 유효하지 않거나 이용 기간이 지났습니다.</p></body></html>', {
    status: 403, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });
  if (supplied) {
    url.searchParams.delete('access');
    const maxAge = Math.max(0, Math.floor((payload.exp - Date.now()) / 1000));
    return new Response(null, { status: 302, headers: {
      location: url.toString(),
      'set-cookie': `comento_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
      'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
    } });
  }
  const response = await context.next();
  response.headers.set('cache-control', 'no-store');
  response.headers.set('referrer-policy', 'no-referrer');
  return response;
}

export const config = { path: '/*' };

