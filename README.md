# 隙间行者 / EasyStsGame

电脑浏览器单机卡牌战斗原型，TypeScript + Vite + HTML/CSS，无后端、无运行时第三方服务。界面采用像素风野外雾林、独立角色与敌人精灵、带插画卡牌。当前为**第一阶段**：三个可反复游玩的固定战斗；所有角色、卡牌、敌人数值都是临时内容。三层流程、存档、Boss 等见后续开发计划，当前尚未实现。

## Windows 免解压更新

下载单文件 [启动游戏.cmd](https://github.com/originone494/EasyStsGame/raw/refs/heads/main/启动游戏.cmd)，首次安装后，双击自动检查新版并打开游戏。需要 Node.js 24 LTS 与 Git for Windows。从 GitHub `main` 分支获取最新发布的代码，不包含尚未推送的云端修改。 详见[免解压更新](docs/免解压更新.md)。

## 本地启动（Windows / macOS / Linux）

安装 Node.js **22.12+（建议 24 LTS）**，在仓库目录运行：

```sh
npm ci
npm run dev
```

按终端提示在电脑浏览器打开服务地址。选择卡牌 → 点击敌人或左右方向 → 确认出牌。卡牌免费，结束回合时怪物依次行动。可切换测试战斗、修改随机种子、重开。浏览器刷新会重新开始，本阶段不存档。

构建可本地运行版本：

```sh
npm run build
npm run preview
```

构建产物在 `dist/`，应通过静态 HTTP 服务打开，不能直接双击 `index.html`。首次安装需要 npm 网络访问；依赖安装完成后，启动和游玩不需要联网。无外部字体、图片或服务。

## 验证

```sh
npm test             # 22 项规则验收
npm run build       # 严格 TypeScript 检查及生产构建
npx playwright install chromium  # 本机首次浏览器验收时使用
npm run test:browser # 4 项真实浏览器流程测试
```

云环境已有 `/usr/bin/chromium`，无需下载浏览器：

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

Playwright 自动启动并关闭自己的 Vite 服务；运行前确保 5173 端口未被其他服务占用。浏览器测试覆盖三场战斗胜利与重开，以及目标选择、非法操作、治疗收尾、接触致死、切换、执行区抽牌。截图生成到被忽略的 `test-results/battlefield.png`。

## 文档与配置入口

- [五阶段开发计划](docs/开发计划.md)
- [第一阶段规则、临时配置、默认规则](docs/第一阶段规则.md)
- [验收结果](docs/验收结果.md)
- [界面与美术方向](docs/界面与美术方向.md)
- `src/content/cards.ts`：卡牌效果及七张初始牌组。
- `src/content/enemies.ts`：敌人生命、速度、接触伤害。
- `src/content/encounters.ts`：三个布局、共享生命、战场大小与默认种子。
- `src/game/`：独立规则；`src/ui/`：纯展示；`src/main.ts`：输入绑定。

开发用固定局面位于界面「开发用固定局面」折叠项。最后击杀治疗专用测试卡不会加入正常牌组。动画、遗物触发队列和昼夜将在后续阶段接入。

完整策划案已原样归档：[游戏策划案_最终整合版_V15.7.md](docs/游戏策划案_最终整合版_V15.7.md)。现有原型依据第一阶段实施要求开发，尚未逐条完成与完整策划案的差异核对。
