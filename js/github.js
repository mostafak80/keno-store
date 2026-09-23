/**
 * Keno Store — GitHub REST API Client
 * Official GitHub REST API version '2022-11-28' (fixes BUG-03).
 * Manages atomic loading and publishing of assets/catalog.js.
 * Enforces in-memory token safety and handles 409 concurrency conflicts.
 */
(function (root) {
  'use strict';

  function createGitHubClient(fetcher, repo, branch, token) {
    if (typeof repo !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(repo)) {
      throw new Error('يرجى كتابة اسم المستودع بالشكل الصحيح: username/repository');
    }
    if (typeof branch !== 'string' || !branch.trim() || branch.length > 200 || /[\x00-\x20]/.test(branch)) {
      throw new Error('اسم الفرع غير صالح.');
    }
    if (typeof token !== 'string' || !token.trim()) {
      throw new Error('يرجى إدخال مفتاح GitHub (Personal Access Token).');
    }

    let secret = token.trim();
    let busy = false;
    const base = 'https://api.github.com/repos/' + repo;
    const catalogPath = root.KenoConfig?.CATALOG_PATH || 'assets/catalog.js';
    const maxBytes = root.KenoConfig?.MAX_BYTES || 800000;
    const apiVersion = root.KenoConfig?.GITHUB_API_VERSION || '2022-11-28';

    async function request(path, options = {}) {
      if (!secret) {
        throw new Error('انتهت جلسة الإدارة أو تم مسح المفتاح. سجّل الدخول مرة أخرى.');
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetcher(base + path, {
          ...options,
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': 'Bearer ' + secret,
            'X-GitHub-Api-Version': apiVersion,
            ...(options.body ? { 'Content-Type': 'application/json' } : {})
          }
        });

        if (!response.ok) {
          const messages = {
            401: 'مفتاح GitHub غير صحيح أو منتهي الصلاحية.',
            403: 'لا توجد صلاحية كافية (تأكد من تفعيل Contents: Read and write واختيار هذا المستودع) أو تم تجاوز حد طلبات GitHub.',
            404: 'المستودع أو الفرع أو ملف assets/catalog.js غير موجود، أو المفتاح لا يملك وصولًا إليه.',
            409: 'توجد نسخة أحدث على GitHub تم حفظها من مصدر آخر. صدّر مسودتك كنسخة احتياطية، ثم اضغط «تحميل آخر نسخة» قبل التعديل والنشر.',
            422: 'GitHub رفض التعديل. راجع صلاحيات المفتاح وقواعد حماية الفرع (Branch Protection Rules).'
          };
          const error = new Error(messages[response.status] || `تعذّر الاتصال بـ GitHub (كود الخطأ: ${response.status}).`);
          error.status = response.status;
          throw error;
        }

        return await response.json();
      } catch (error) {
        if (error.name === 'AbortError') {
          throw new Error('انتهت مهلة الاتصال بـ GitHub (30 ثانية). يرجى التحقق من اتصال الإنترنت والمحاولة مجددًا.');
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }

    /**
     * Loads the latest catalog.js from GitHub.
     * @returns {Promise<{ data: Object, sha: string }>}
     */
    async function load() {
      const metadata = await request('');
      if (metadata.permissions && !metadata.permissions.push) {
        throw new Error('حسابك لا يملك صلاحية تعديل (Write/Push) في هذا المستودع.');
      }

      const file = await request('/contents/' + catalogPath + '?ref=' + encodeURIComponent(branch));
      if (file.encoding !== 'base64' || !file.content || !file.sha || file.size > maxBytes) {
        throw new Error('ملف catalog.js غير موجود بالصيغة المطلوبة داخل مجلد assets.');
      }

      // Decode base64 utf-8
      const rawText = new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0))
      );

      const parsed = root.KenoCatalogParser ? root.KenoCatalogParser.parse(rawText) : null;
      if (!parsed) {
        throw new Error('تعذّر تحليل بيانات ملف catalog.js الذي تم تنزيله من GitHub.');
      }

      return { data: parsed, sha: file.sha };
    }

    /**
     * Commits and publishes an updated catalog to GitHub.
     * @param {Object} catalogData
     * @param {string} currentSha
     * @returns {Promise<{ data: Object, sha: string, commit: string }>}
     */
    async function publish(catalogData, currentSha) {
      if (busy) throw new Error('عملية النشر الحالية قيد التنفيذ، يرجى الانتظار.');
      if (typeof currentSha !== 'string' || !/^[a-f0-9]{40,64}$/.test(currentSha)) {
        throw new Error('معرّف النسخة (SHA) غير صالح. حمّل أحدث نسخة من GitHub أولًا.');
      }

      busy = true;
      try {
        const updated = {
          ...JSON.parse(JSON.stringify(catalogData)),
          updatedAt: new Date().toISOString()
        };

        if (root.KenoCatalogParser) {
          root.KenoCatalogParser.validate(updated);
        }

        const serializedSource = root.KenoCatalogParser
          ? root.KenoCatalogParser.serialize(updated)
          : '';

        // Encode to UTF-8 Base64
        let binary = '';
        for (const b of new TextEncoder().encode(serializedSource)) {
          binary += String.fromCharCode(b);
        }
        const base64Content = btoa(binary);

        const result = await request('/contents/' + catalogPath, {
          method: 'PUT',
          body: JSON.stringify({
            message: 'Update Keno Store catalog & pricing',
            content: base64Content,
            sha: currentSha,
            branch: branch
          })
        });

        if (!result.content?.sha) {
          throw new Error('استجابة النشر غير مكتملة. يرجى إعادة تحميل الصفحة للتحقق من التحديث.');
        }

        return {
          data: updated,
          sha: result.content.sha,
          commit: result.commit?.sha || null
        };
      } finally {
        busy = false;
      }
    }

    function clear() {
      secret = '';
    }

    return { load, publish, clear };
  }

  root.KenoGitHub = { createGitHubClient };
})(typeof window !== 'undefined' ? window : this);
