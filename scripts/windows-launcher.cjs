// Windows launcher source; build-launcher.mjs embeds this in a single downloadable CMD.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const REPOSITORY = 'https://github.com/originone494/EasyStsGame.git';
function planUpdate({ dirty, branch, remote }) {
  if (remote.replace(/\.git\/?$/, '').toLowerCase() !== REPOSITORY.replace(/\.git$/, '').toLowerCase()) return 'foreign';
  if (dirty) return 'modified';
  if (branch !== 'main') return 'branch';
  return 'pull';
}
function dependencyKey(lock, version) { return crypto.createHash('sha256').update(lock).update('\0' + version).digest('hex'); }
function makeLauncher({ run, exists, read, write, mkdir, root, version, output, install }) {
  const repo = root;
  const runtime = path.join(root, '.easysts');
  const stamp = path.join(runtime, 'dependencies.sha256');
  function invoke(command, args, cwd = root, capture = false) {
    return run(command, args, { cwd, capture });
  }
  function checked(command, args, cwd) {
    const r = invoke(command, args, cwd);
    if (r.status !== 0) throw new Error(`${command} 执行失败。请查看上方错误；本地游戏和修改均已保留。`);
  }
  function launch() {
    if (!exists(path.join(repo, '.git'))) {
      output('首次安装：游戏文件直接放到 ' + repo);
      install(root, staging => checked('git', ['clone', '--branch', 'main', '--single-branch', REPOSITORY, staging], root));
    } else {
      const dirty = invoke('git', ['status', '--porcelain=v1', '--untracked-files=normal'], repo, true);
      const branch = invoke('git', ['symbolic-ref', '--short', 'HEAD'], repo, true);
      const remote = invoke('git', ['remote', 'get-url', 'origin'], repo, true);
      if ([dirty, branch, remote].some(r => r.status !== 0)) throw new Error('无法确认现有安装的 Git 状态。为保护文件，未执行更新。');
      const decision = planUpdate({ dirty: !!dirty.stdout.trim(), branch: branch.stdout.trim(), remote: remote.stdout.trim() });
      if (decision === 'foreign') throw new Error('安装目录的仓库来源已改变，停止自动更新。');
      if (decision !== 'pull') output('检测到本地修改或非 main 分支，跳过更新，启动你现有的版本。');
      else {
        output('正在检查更新……');
        const update = invoke('git', ['pull', '--ff-only', 'origin', 'main'], repo);
        if (update.status !== 0) output('暂时无法更新（网络、权限或本地提交冲突）。保留并尝试启动已安装版本。');
      }
    }
    const lockPath = path.join(repo, 'package-lock.json');
    if (!exists(lockPath) || !exists(path.join(repo, 'package.json'))) throw new Error('仓库尚未发布游戏文件，暂时无法启动。请等待游戏版本发布后再双击。');
    const key = dependencyKey(read(lockPath), version);
    const previous = exists(stamp) ? read(stamp).toString().trim() : '';
    if (key !== previous || !exists(path.join(repo, 'node_modules', 'vite', 'bin', 'vite.js'))) {
      output('正在安装或更新依赖（仅首次或依赖发生变化时执行）……');
      checked('npm', ['ci', '--no-audit', '--no-fund'], repo);
      mkdir(runtime);
      write(stamp, key);
    }
    output('即将打开游戏。关闭此窗口或按 Ctrl+C 停止。');
    checked('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--open'], repo);
  }
  return { launch, repo };
}
// Prepare in a local staging folder, preflight every destination, then copy only missing files.
// The launcher itself may already exist; identical files are preserved byte-for-byte.
function installCheckout(root, clone) {
  const runtime = path.join(root, '.easysts');
  fs.mkdirSync(runtime, { recursive: true });
  const staging = fs.mkdtempSync(path.join(runtime, 'checkout-'));
  try {
    clone(staging);
    if (!fs.existsSync(path.join(staging, '.git'))) throw new Error('下载未生成有效仓库，安装已停止。');
    const files = [];
    const directories = [];
    function discover(relative = '') {
      for (const entry of fs.readdirSync(path.join(staging, relative), { withFileTypes: true })) {
        if (!relative && entry.name === '.git') continue;
        const rel = path.join(relative, entry.name);
        if (entry.isSymbolicLink()) throw new Error('下载内容包含不支持的符号链接：' + rel);
        if (entry.isDirectory()) { directories.push(rel); discover(rel); }
        else if (entry.isFile()) files.push(rel);
      }
    }
    discover();
    for (const rel of directories) {
      const dest = path.join(root, rel);
      if (fs.existsSync(dest)) {
        const stat = fs.lstatSync(dest);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('目录冲突，已保留原文件：' + dest);
      }
    }
    for (const rel of files) {
      const dest = path.join(root, rel);
      if (fs.existsSync(dest)) {
        const stat = fs.lstatSync(dest);
        if (!stat.isFile() || stat.isSymbolicLink() || !fs.readFileSync(dest).equals(fs.readFileSync(path.join(staging, rel)))) {
          throw new Error('同名文件内容不同，已停止安装并保留原文件：' + dest);
        }
      }
    }
    if (fs.existsSync(path.join(root, '.git'))) throw new Error('此目录已有 Git 元数据，安装已停止。');
    for (const rel of directories) fs.mkdirSync(path.join(root, rel), { recursive: true });
    for (const rel of files) {
      const dest = path.join(root, rel);
      if (!fs.existsSync(dest)) fs.copyFileSync(path.join(staging, rel), dest, fs.constants.COPYFILE_EXCL);
    }
    fs.renameSync(path.join(staging, '.git'), path.join(root, '.git'));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
async function main() {
  if (process.platform !== 'win32') throw new Error('此双击启动器用于 Windows。其他系统请按 README 启动。');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('请先安装 Node.js 24 LTS：https://nodejs.org/');
  const git = spawnSync('git', ['--version'], { stdio: 'ignore', windowsHide: true });
  if (git.status !== 0) throw new Error('请先安装 Git for Windows：https://git-scm.com/download/win ，然后重新双击。');
  const root = path.dirname(path.resolve(process.argv[1]));
  const runtime = path.join(root, '.easysts');
  const cache = path.join(runtime, 'npm-cache');
  const temp = path.join(runtime, 'tmp');
  fs.mkdirSync(temp, { recursive: true });
  console.log('游戏目录：' + root);
  const childEnv = { ...process.env, npm_config_cache: cache, TEMP: temp, TMP: temp };
  const runner = (command, args, { cwd, capture }) => {
    // npm.cmd must be invoked through cmd.exe; all arguments below are fixed literals.
    // No user input is interpolated into a command string.
    const actual = command === 'npm' ? 'cmd.exe' : command;
    const actualArgs = command === 'npm' ? ['/d', '/s', '/c', 'npm.cmd ' + args.join(' ')] : args;
    const result = spawnSync(actual, actualArgs, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', windowsHide: !!capture, env: childEnv });
    return { status: result.status, stdout: result.stdout || '' };
  };
  makeLauncher({ run: runner, exists: fs.existsSync, read: fs.readFileSync, write: fs.writeFileSync, mkdir: p => fs.mkdirSync(p, { recursive: true }), root, version: process.versions.node, output: console.log, install: installCheckout }).launch();
}
module.exports = { planUpdate, dependencyKey, makeLauncher, installCheckout, main };
