import { createHmac, timingSafeEqual } from 'node:crypto';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function authorized(request) {
  const secret = process.env.ACCESS_SIGNING_KEY;
  if (!secret) return false;
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !signature || extra) return false;
  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
  const left = Buffer.from(signature), right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  try {
    const { exp, studentId } = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return typeof studentId === 'string' && studentId.length > 0 && Number(exp) > Date.now();
  } catch { return false; }
}

export default async function handler(request) {
  if (request.method !== 'GET') return json({ error: 'GET 요청만 허용합니다.' }, 405);
  if (!authorized(request)) return json({ error: '유효한 수강생 링크가 필요합니다.' }, 401);
  const terms = (new URL(request.url).searchParams.get('terms') || '').split(',').map(x => x.trim()).filter(Boolean);
  if (terms.length < 1 || terms.length > 5 || terms.some(x => x.length > 30)) return json({ error: '검색어는 1~5개, 각각 30자 이하여야 합니다.' }, 400);
  const { NAVER_API_KEY: apiKey, NAVER_SECRET_KEY: secretKey, NAVER_CUSTOMER_ID: customerId } = process.env;
  if (!apiKey || !secretKey || !customerId) return json({ error: '네이버 API 설정이 완료되지 않았습니다.' }, 503);
  const path = '/keywordstool', timestamp = String(Date.now());
  const signature = createHmac('sha256', secretKey).update(`${timestamp}.GET.${path}`).digest('base64');
  const url = new URL('https://api.searchad.naver.com' + path);
  url.searchParams.set('hintKeywords', terms.join(','));
  url.searchParams.set('showDetail', '1');
  try {
    const response = await fetch(url, { headers: {
      'X-Timestamp': timestamp, 'X-API-KEY': apiKey,
      'X-Customer': customerId, 'X-Signature': signature,
    }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return json({ error: `네이버 키워드 조회 실패 (${response.status})` }, 502);
    const data = await response.json();
    const fields = ['relKeyword', 'monthlyPcQcCnt', 'monthlyMobileQcCnt', 'monthlyAvePcClkCnt', 'monthlyAveMobileClkCnt', 'monthlyAvePcCtr', 'monthlyAveMobileCtr', 'compIdx', 'plAvgDepth'];
    return json({ source: 'NAVER Search Ad API', keywords: (data.keywordList || []).slice(0, 1000).map(row => Object.fromEntries(fields.map(field => [field, row[field] ?? null]))) });
  } catch { return json({ error: '네이버 키워드 조회 중 네트워크 오류가 발생했습니다.' }, 502); }
}

