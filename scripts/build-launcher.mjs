import { readFile, writeFile } from 'node:fs/promises';
const source = await readFile(new URL('./windows-launcher.cjs', import.meta.url), 'utf8');
const batch = `@echo off
setlocal
chcp 65001 >nul
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 LTS from https://nodejs.org/ then run this file again.
  pause
  exit /b 1
)
node -e "const f=require('node:fs'),m={exports:{}};new Function('require','module',f.readFileSync(process.argv[1],'utf8').replace(/\\r/g,'').split('\\n// EASYSTS_'+'NODE_SCRIPT\\n')[1])(require,m);m.exports.main().catch(e=>{console.error(e.message);process.exitCode=1})" "%~f0"
if errorlevel 1 (
  echo.
  echo Unable to start. See the message above.
  pause
  exit /b 1
)
exit /b 0
// EASYSTS_NODE_SCRIPT
${source}`;
await writeFile(new URL('../启动游戏.cmd', import.meta.url), batch.replace(/\r?\n/g, '\r\n'));
