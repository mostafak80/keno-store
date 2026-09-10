/**
 * Keno Store — Secure Publish API (Vercel Serverless Function)
 *
 * Receives catalog data from the admin dashboard, verifies the admin's
 * Firebase ID token, then commits the updated assets/catalog.js to GitHub
 * using a server-side GITHUB_TOKEN that is NEVER exposed to the browser.
 *
 * Environment variables required in Vercel dashboard:
 *   GITHUB_TOKEN   — GitHub Personal Access Token (Contents: read+write)
 *   GITHUB_REPO    — e.g. "username/keno-store"
 *   GITHUB_BRANCH  — e.g. "main"
 *   ADMIN_EMAILS   — comma-separated admin emails, e.g. "admin@gmail.com,editor@gmail.com"
 */

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- 1. Extract and validate Firebase ID Token ---
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const idToken = authHeader.slice(7);

  // Verify the token with Google's public tokeninfo endpoint
  let userEmail = '';
  try {
    const verifyRes = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!verifyRes.ok) {
      return res.status(401).json({ error: 'Invalid Firebase ID token' });
    }
    const tokenData = await verifyRes.json();
    userEmail = (tokenData.email || '').toLowerCase().trim();
    if (!userEmail || tokenData.email_verified === 'false') {
      return res.status(401).json({ error: 'Email not verified' });
    }
  } catch (err) {
    return res.status(401).json({ error: 'Token verification failed: ' + err.message });
  }

  // --- 2. Check admin whitelist ---
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  if (!adminEmails.includes(userEmail)) {
    return res.status(403).json({ error: 'Unauthorized: email not in admin whitelist' });
  }

  // --- 3. Parse catalog data from request body ---
  const { catalogSource, commitMessage } = req.body || {};
  if (!catalogSource || typeof catalogSource !== 'string') {
    return res.status(400).json({ error: 'Missing catalogSource in request body' });
  }

  // --- 4. Read environment variables ---
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
  const CATALOG_PATH = 'assets/catalog.js';

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return res.status(500).json({ error: 'Server misconfigured: missing GITHUB_TOKEN or GITHUB_REPO' });
  }

  // --- 5. Get current file SHA from GitHub ---
  const apiBase = `https://api.github.com/repos/${GITHUB_REPO}`;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };

  let currentSha = '';
  try {
    const fileRes = await fetch(
      `${apiBase}/contents/${CATALOG_PATH}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
      { headers, cache: 'no-store' }
    );
    if (fileRes.ok) {
      const fileData = await fileRes.json();
      currentSha = fileData.sha;
    } else if (fileRes.status !== 404) {
      const errText = await fileRes.text();
      return res.status(502).json({ error: `GitHub read failed (${fileRes.status}): ${errText}` });
    }
    // If 404, the file doesn't exist yet — we'll create it
  } catch (err) {
    return res.status(502).json({ error: 'Failed to read from GitHub: ' + err.message });
  }

  // --- 6. Encode catalog content to Base64 ---
  const encoder = new TextEncoder();
  const bytes = encoder.encode(catalogSource);
  // Convert Uint8Array to Base64 in Node.js
  const base64Content = Buffer.from(bytes).toString('base64');

  // --- 7. Commit to GitHub ---
  const commitBody = {
    message: commitMessage || `Update Keno Store catalog — ${new Date().toISOString()}`,
    content: base64Content,
    branch: GITHUB_BRANCH
  };
  if (currentSha) {
    commitBody.sha = currentSha;
  }

  try {
    const commitRes = await fetch(`${apiBase}/contents/${CATALOG_PATH}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(commitBody)
    });

    if (!commitRes.ok) {
      const errText = await commitRes.text();
      return res.status(502).json({
        error: `GitHub commit failed (${commitRes.status}): ${errText}`
      });
    }

    const commitData = await commitRes.json();
    return res.status(200).json({
      success: true,
      sha: commitData.content?.sha || '',
      commitSha: commitData.commit?.sha || '',
      message: 'Published successfully to GitHub'
    });
  } catch (err) {
    return res.status(502).json({ error: 'GitHub commit request failed: ' + err.message });
  }
}
