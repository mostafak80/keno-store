/** Vercel catalog publisher. Secrets stay in server environment variables.
 * GITHUB_TOKEN, GITHUB_REPO, ADMIN_EMAILS; optional GITHUB_BRANCH and FIREBASE_PROJECT_ID.
 * Firebase verification follows https://firebase.google.com/docs/auth/admin/verify-id-tokens
 */
import { createRequire } from 'node:module';
import { verifyFirebaseToken } from '../server/firebase-token.mjs';
const require = createRequire(import.meta.url);
const parserModule = require('../js/catalog-parser.js');
Object.assign(parserModule, require('../js/config.js'), require('../js/image.js'));
const parser = parserModule.KenoCatalogParser;
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({error:'Method not allowed'}); }
  const auth = req.headers.authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return res.status(401).json({error:'يلزم تسجيل الدخول أولًا.'});
  let claims;
  try { claims = await verifyFirebaseToken(auth.slice(7), {projectId:process.env.FIREBASE_PROJECT_ID || 'keno-store'}); }
  catch (_) { return res.status(401).json({error:'جلسة غير صالحة؛ سجّل الدخول مرة أخرى.'}); }
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if (!admins.includes(claims.email.trim().toLowerCase())) return res.status(403).json({error:'ليس لديك صلاحية النشر.'});
  const {catalogSource, expectedSha, baseUpdatedAt, commitMessage} = req.body || {};
  let source;
  try { source = parser.serialize(parser.parse(catalogSource)); }
  catch (_) { return res.status(400).json({error:'ملف الكتالوج غير صالح أو أكبر من الحد المسموح.'}); }
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO, branch = process.env.GITHUB_BRANCH || 'main';
  if (!token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || '')) return res.status(503).json({error:'إعدادات النشر غير مكتملة على الخادم.'});
  const endpoint = `https://api.github.com/repos/${repo}/contents/assets/catalog.js`;
  const headers = {'Accept':'application/vnd.github+json','Authorization':`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
  try {
    const current = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, {headers,cache:'no-store',signal:AbortSignal.timeout(15000)});
    let sha = '';
    if (current.ok) {
      const file = await current.json(); sha = file.sha;
      const currentCatalog = parser.parse(Buffer.from(file.content, 'base64').toString('utf8'));
      // Compare against the admin's actual baseline, then let GitHub enforce SHA concurrency.
      if ((expectedSha && expectedSha !== sha) || (!expectedSha && (!baseUpdatedAt || currentCatalog.updatedAt !== baseUpdatedAt))) {
        return res.status(409).json({error:'تغيّر الكتالوج منذ فتح المسودة. حمّل أحدث نسخة قبل النشر.'});
      }
    } else if (current.status !== 404) return res.status(502).json({error:'تعذر قراءة الكتالوج من GitHub.'});
    const body = {message: typeof commitMessage === 'string' ? commitMessage.slice(0,200) : 'Update Keno Store catalog',content:Buffer.from(source).toString('base64'),branch};
    if (sha) body.sha = sha;
    const result = await fetch(endpoint, {method:'PUT',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    if (!result.ok) return res.status(result.status === 409 ? 409 : 502).json({error:result.status === 409 ? 'حدث تعديل متزامن؛ أعد تحميل أحدث نسخة.' : 'لم يؤكد GitHub حفظ التعديلات.'});
    const saved = await result.json();
    return res.status(200).json({success:true,sha:saved.content?.sha || '',commitSha:saved.commit?.sha || ''});
  } catch (_) { return res.status(502).json({error:'تعذر التحقق من نتيجة النشر؛ حمّل أحدث نسخة قبل إعادة المحاولة.'}); }
}
