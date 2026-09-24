const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 5278;

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0].split('#')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(__dirname, reqPath);
  if (!fs.existsSync(filePath)) { res.writeHead(404); return res.end('Not Found'); }
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.woff': 'font/woff'
  };
  res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(filePath));
});

server.listen(PORT, async () => {
  console.log(`Server listening on http://127.0.0.1:${PORT}`);
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

  // Scenario 1: Visitor visits #admin directly
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--dump-dom',
    `http://127.0.0.1:${PORT}/index.html#admin`
  ];

  console.log('Testing Scenario 1: Unauthorized access to #admin...');
  const edge = spawn(edgePath, args);
  let dom = '';
  edge.stdout.on('data', d => { dom += d.toString(); });

  edge.on('close', () => {
    server.close();
    
    // Check if storefront is visible (does NOT have hidden)
    const storefrontHidden = dom.includes('<main id="storefront" hidden');
    // Check if adminView has hidden
    const adminViewHidden = dom.includes('id="adminView"') && dom.includes('class="admin-view container" hidden');
    // Check if adminWorkspace has hidden
    const adminWorkspaceHidden = dom.includes('id="adminWorkspace" hidden');
    // Check if headerAdminBtn has hidden
    const headerAdminBtnHidden = dom.includes('id="headerAdminBtn"') && dom.includes('header-admin-btn" hidden');
    // Check if footerAdminLink is completely gone
    const hasFooterAdminLink = dom.includes('id="footerAdminLink"');

    console.log('--- TEST RESULTS ---');
    console.log('1. Storefront NOT hidden (Visitor sees storefront):', !storefrontHidden ? 'PASS' : 'FAIL');
    console.log('2. AdminView strictly hidden:', adminViewHidden ? 'PASS' : 'FAIL');
    console.log('3. AdminWorkspace strictly hidden:', adminWorkspaceHidden ? 'PASS' : 'FAIL');
    console.log('4. Header admin button strictly hidden:', headerAdminBtnHidden ? 'PASS' : 'FAIL');
    console.log('5. Footer admin link completely removed:', !hasFooterAdminLink ? 'PASS' : 'FAIL');

    if (!storefrontHidden && adminViewHidden && adminWorkspaceHidden && headerAdminBtnHidden && !hasFooterAdminLink) {
      console.log('\n>>> SECURITY TEST PASSED: #admin CANNOT BE ACCESSED WITHOUT ADMIN LOGIN! <<<');
    } else {
      console.error('\n>>> SECURITY TEST FAILED! <<<');
      process.exit(1);
    }
  });
});
