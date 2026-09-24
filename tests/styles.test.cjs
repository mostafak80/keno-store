const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const files=['style.css',...fs.readdirSync(path.join(root,'assets')).filter(f=>f.endsWith('.css')).map(f=>'assets/'+f),...fs.readdirSync(path.join(root,'assets/styles')).filter(f=>f.endsWith('.css')).map(f=>'assets/styles/'+f)];
for(const file of files)test('CSS blocks and imports: '+file,()=>{
 const css=fs.readFileSync(path.join(root,file),'utf8');
 for(const match of css.matchAll(/@import\s+url\(["']([^"']+)["']\)/g))assert.ok(fs.existsSync(path.resolve(root,path.dirname(file),match[1])),'missing import '+match[1]);
 const code=css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'quoted-value');
 let depth=0;for(const char of code){if(char==='{')depth++;if(char==='}')depth--;assert.ok(depth>=0,'unexpected closing brace')}
 assert.equal(depth,0,'unclosed block silently nests responsive rules');
 assert.equal(/[\w-]+:\s*(?:!important\s*)?;/.test(code),false,'empty declaration ignored by browser');
});
