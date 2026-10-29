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
function makeLauncher({ run, exists, read, write, mkdir, root, version, output }) {
  const repo = path.join(root, 'repository');
  const stamp = path.join(root, 'dependencies.sha256');
  function invoke(command, args, cwd = root, capture = false) {
    return run(command, args, { cwd, capture });
  }
  function checked(command, args, cwd) {
    const r = invoke(command, args, cwd);
    if (r.status !== 0) throw new Error(`${command} 执行失败。请查看上方错误；本地游戏和修改均已保留。`);
  }
  function launch() {
    if (!exists(path.join(repo, '.git'))) {
      if (exists(repo)) throw new Error('安装位置已有其他文件，为避免覆盖已停止。请检查：' + repo);
      output('首次安装：下载游戏到 ' + repo);
      mkdir(root);
      checked('git', ['clone', '--branch', 'main', '--single-branch', REPOSITORY, repo], root);
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
      write(stamp, key);
    }
    output('即将打开游戏。关闭此窗口或按 Ctrl+C 停止。');
    checked('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--open'], repo);
  }
  return { launch, repo };
}
async function main() {
  if (process.platform !== 'win32') throw new Error('此双击启动器用于 Windows。其他系统请按 README 启动。');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('请先安装 Node.js 24 LTS：https://nodejs.org/');
  const git = spawnSync('git', ['--version'], { stdio: 'ignore', windowsHide: true });
  if (git.status !== 0) throw new Error('请先安装 Git for Windows：https://git-scm.com/download/win ，然后重新双击。');
  if (!process.env.LOCALAPPDATA) throw new Error('未找到 Windows 本地应用目录。');
  const runner = (command, args, { cwd, capture }) => {
    // npm.cmd must be invoked through cmd.exe; all arguments below are fixed literals.
    // No user input is interpolated into a command string.
    const actual = command === 'npm' ? 'cmd.exe' : command;
    const actualArgs = command === 'npm' ? ['/d', '/s', '/c', 'npm.cmd ' + args.join(' ')] : args;
    const result = spawnSync(actual, actualArgs, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', windowsHide: !!capture });
    return { status: result.status, stdout: result.stdout || '' };
  };
  const root = path.join(process.env.LOCALAPPDATA, 'EasyStsGame');
  fs.mkdirSync(root, { recursive: true });
  makeLauncher({ run: runner, exists: fs.existsSync, read: fs.readFileSync, write: fs.writeFileSync, mkdir: p => fs.mkdirSync(p, { recursive: true }), root, version: process.versions.node, output: console.log }).launch();
}
module.exports = { planUpdate, dependencyKey, makeLauncher, main };
