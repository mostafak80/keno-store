const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const htmlPath = path.resolve('index.html');
const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');

console.log('Launching Edge on', fileUrl);

const os = require('os');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-test-'));

const edgeProcess = spawn(edgePath, [
  '--headless',
  '--remote-debugging-port=9333',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${tmpDir}`,
  fileUrl
]);

async function checkConsole() {
  await new Promise(r => setTimeout(r, 2000));

  http.get('http://127.0.0.1:9333/json/list', res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', async () => {
      try {
        const tabs = JSON.parse(data);
        console.log('Open tabs:', tabs.length);
        const targetTab = tabs.find(t => t.url.includes('index.html')) || tabs[0];
        if (!targetTab || !targetTab.webSocketDebuggerUrl) {
          console.error('No debugger URL found!');
          edgeProcess.kill();
          return;
        }

        const ws = new WebSocket(targetTab.webSocketDebuggerUrl);
        const consoleMessages = [];

        ws.onopen = () => {
          console.log('Connected to DevTools WebSocket.');
          ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
          ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }));
          ws.send(JSON.stringify({ id: 3, method: 'Page.enable' }));
        };

        ws.onmessage = event => {
          const msg = JSON.parse(event.data);
          if (msg.method === 'Runtime.consoleAPICalled') {
            const type = msg.params.type;
            const args = msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
            consoleMessages.push({ type, text: args });
            console.log(`[BROWSER CONSOLE ${type.toUpperCase()}]`, args);
          } else if (msg.method === 'Runtime.exceptionThrown') {
            const text = msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || '');
            consoleMessages.push({ type: 'error', text });
            console.error(`[BROWSER EXCEPTION]`, text);
          }
        };

        // Wait 4 seconds to collect all load and render events
        setTimeout(async () => {
          // Also execute an expression to inspect DOM state
          ws.send(JSON.stringify({
            id: 10,
            method: 'Runtime.evaluate',
            params: {
              expression: `({
                title: document.title,
                serviceGridCount: document.getElementById('serviceGrid') ? document.getElementById('serviceGrid').children.length : -1,
                picksGridCount: document.getElementById('picksGrid') ? document.getElementById('picksGrid').children.length : -1,
                announcementInstaBtnHidden: document.getElementById('announcementInstaBtn') ? document.getElementById('announcementInstaBtn').hidden : null,
                footerInstaBtnHidden: document.getElementById('footerInstaBtn') ? document.getElementById('footerInstaBtn').hidden : null,
                cartItemCount: document.getElementById('cartBadge') ? document.getElementById('cartBadge').textContent : null
              })`,
              returnByValue: true
            }
          }));

          ws.onmessage = (event) => {
            const m = JSON.parse(event.data);
            if (m.id === 10) {
              console.log('\n--- DOM RENDER EVALUATION ---');
              console.log(m.result.result.value);
              console.log('-----------------------------\n');
              ws.close();
              edgeProcess.kill();
              
              const errors = consoleMessages.filter(m => m.type === 'error');
              if (errors.length > 0) {
                console.error(`FAILED: ${errors.length} browser errors detected!`);
                process.exit(1);
              } else {
                console.log(`SUCCESS: 0 browser errors detected!`);
                process.exit(0);
              }
            }
          };
        }, 4000);

      } catch (e) {
        console.error('Error parsing tab list:', e);
        edgeProcess.kill();
      }
    });
  }).on('error', err => {
    console.error('Failed to connect to CDP:', err.message);
    edgeProcess.kill();
  });
}

checkConsole();

