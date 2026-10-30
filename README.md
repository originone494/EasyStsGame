# 简单尖塔 / EasyStsGame

电脑浏览器单机卡牌战斗原型，TypeScript + Vite + HTML/CSS，无后端、无运行时第三方服务。界面采用像素风野外雾林、独立角色与敌人精灵、带插画卡牌。当前为**第一阶段**：三个可反复游玩的固定战斗；所有角色、卡牌、敌人数值都是临时内容。三层流程、存档、Boss 等见后续开发计划，当前尚未实现。

## Windows 免解压更新

下载单文件 [启动游戏.cmd](https://github.com/originone494/EasyStsGame/raw/refs/heads/main/启动游戏.cmd)，首次安装后，双击自动检查新版并打开游戏。需要 Node.js 24 LTS 与 Git for Windows。游戏文件直接放在 CMD 所在文件夹，下载缓存和临时文件放在该目录的 `.easysts` 内。从 GitHub `main` 分支获取最新发布的代码，不包含尚未推送的云端修改。 详见[免解压更新](docs/免解压更新.md)。

## 本地启动（Windows / macOS / Linux）

安装 Node.js **22.12+（建议 24 LTS）**，在仓库目录运行：

```sh
npm ci
npm run dev
```

按终端提示在电脑浏览器打开服务地址。战场完整铺满窗口，13 格随窗口等分、全部可见，没有战场滚动条。正常尺寸卡牌直接叠在同一场景前景，底部四分之一仅用于判断收牌／出牌，不设手牌面板：按住左键拖出，或左键点击拿起后再次点击使用。目标牌须放到敌人身上，无目标会返回手牌；右键或 Esc 取消。移步牌放到队伍左右的方向标记，无目标牌放到战场即可生效。卡牌免费，结束回合时怪物依次行动。可切换测试战斗、重开。点击左下角抽牌堆、右下角弃牌堆或旁边的消耗堆（✕）可查看卡牌，窗口内可切换牌堆，按 Esc、点关闭按钮或点遮罩返回。抽牌堆按牌名展示，不代表实际抽取顺序。浏览器刷新会重新开始，本阶段不存档。

构建可本地运行版本：

```sh
npm run build
npm run preview
```

构建产物在 `dist/`，应通过静态 HTTP 服务打开，不能直接双击 `index.html`。首次安装需要 npm 网络访问；依赖安装完成后，启动和游玩不需要联网。无外部字体、图片或服务。

## 验证

```sh
npm test             # 22项规则＋8项模型＋30项事件＋31项伤害＋36项击退＋28项天气
npm run test:launcher # 12项启动器检查
npm run build       # 严格 TypeScript 检查及生产构建
npx playwright install chromium  # 本机首次浏览器验收时使用
npm run test:browser # 51项浏览器流程（原有23项＋事件5项＋伤害5项＋击退7项＋天气11项）
```

云环境已有 `/usr/bin/chromium`，无需下载浏览器：

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

Playwright 自动启动并关闭自己的 Vite 服务；运行前确保 5173 端口未被其他服务占用。浏览器测试覆盖拖拽和点击拿牌、合法目标、无目标返回、拖回手牌、右键／Esc 取消、移动标记、键盘操作与四种窗口尺寸下的全宽战场，以及三场战斗胜利与重开、治疗收尾、接触致死和执行区抽牌。截图生成到被忽略的 `test-results/battlefield.png`。

## 文档与配置入口

- [五阶段开发计划](docs/开发计划.md)
- [V15.7 后续开发实施方案（上传原文）](docs/简单尖塔_V15.7_后续开发实施方案.md)
- [步骤1实施与验收](docs/步骤1_实施与验收.md)
- [步骤2事件执行规格与验收](docs/步骤2_事件执行规格与验收.md)
- [步骤3伤害执行规格与验收](docs/步骤3_伤害执行规格与验收.md)
- [步骤4同步击退执行规格与验收](docs/步骤4_同步击退执行规格与验收.md)
- [步骤5天气与适应执行规格及验收](docs/步骤5_天气与适应执行规格及验收.md)
- [当前规则确认（晴／雨／风）](docs/当前规则确认.md)
- [V15.7规则与代码对照表](docs/V15.7规则与代码对照表.md)
- [规则待定清单](docs/规则待定清单.md)
- [第一阶段规则、临时配置、默认规则](docs/第一阶段规则.md)
- [验收结果](docs/验收结果.md)
- [界面与美术方向](docs/界面与美术方向.md)
- `src/content/cards.ts`：卡牌效果及七张初始牌组。
- `src/content/enemies.ts`：敌人生命、速度、接触伤害。
- `src/content/encounters.ts`：三个布局、共享生命、战场大小与默认种子。
- `src/content/characters.ts`：临时角色及其两张初始牌。
- `src/game/model.ts`、`deck.ts`：统一数据类型、永久卡牌实例及战斗引用。
- `src/game/events.ts`、`eventQueue.ts`、`listeners.ts`：事件入队、FIFO派发、登记顺序、监听生命周期、快照与触发。
- `src/game/damage.ts`：统一公式、来源／目标修正、同步伤害批次与实际生命损失。
- `src/game/push.ts`：纯同步位移求解、逐拍整体提交、碰撞排序及位移账本。
- `src/content/pushScenarios.ts`：七个开发用同步击退局面。
- `src/content/weather.ts`、`src/game/weather.ts`：天气配置、周期、独立随机流和三项适应属性。
- `src/content/weatherScenarios.ts`：六个开发用天气局面。
- `src/content/relics.ts`：开发局面的测试遗物，普通战斗不装配。
- `src/game/`：独立规则；`src/ui/`：纯展示；`src/main.ts`：输入绑定。

开发用固定局面通过地址参数访问，不在普通游戏界面显示调试文字：`?scenario=heal`（收尾治疗）、`?scenario=empty`（空牌堆）、`?scenario=lethal`（接触致死）、`?scenario=chain`（击退传递）；`?seed=0&encounter=2` 可指定种子与布局。开发专用测试卡不会加入正常牌组。

事件验收入口：`?scenario=events`（最后击杀遗物连锁）、`?scenario=snapshots`（资格与数值快照）、`?scenario=eventLethal`（代价致死）、`?scenario=eventTarget`（目标失效与独立治疗）。添加 `&debug=events` 可展开查看完整事件、队列及触发日志。用法与预期见[步骤2执行规格](docs/步骤2_事件执行规格与验收.md)。

伤害验收入口：`?scenario=damageFormula`（独立倍率）、`?scenario=damageMulti`（分段取整）、`?scenario=damageWave`（群体同步击杀）、`?scenario=damagePartial`（群体部分击杀）、`?scenario=damageKinds`（来源修正隔离）。添加 `&debug=events` 查看完整公式、伤害类别、实际扣血及批次。预期结果与暂定交叉事件顺序见[步骤3执行规格](docs/步骤3_伤害执行规格与验收.md)。

击退验收入口：`?scenario=pushTogether`（同向累加）、`?scenario=pushSplit`（双侧同步）、`?scenario=pushOpposed`（反向净余）、`?scenario=pushClash`（等量争格）、`?scenario=pushSandwich`（同位置排序）、`?scenario=pushChain`（连续传递）、`?scenario=pushLimits`（双侧边界）。添加 `&debug=events` 查看碰撞类别、发生拍次和守恒账本。反向冲突等可调整执行选择见[步骤4规格](docs/步骤4_同步击退执行规格与验收.md)。

天气验收入口：`?scenario=weatherSun`、`?scenario=weatherRain`、`?scenario=weatherWind`（各天气属性增伤），`?scenario=weatherCycle`（连续观察第4／7／10回合切换），`?scenario=weatherMultipliers`（适应与独立倍率），`?scenario=weatherSources`（伤害来源隔离）。添加 `&debug=events` 查看天气、属性及事件。正常入口也显示天气和倒计时，初始三项适应为0；战后属性成长将在评分奖励步骤接入。完整规则见[步骤5规格](docs/步骤5_天气与适应执行规格及验收.md)。

完整策划案已原样归档：[游戏策划案_最终整合版_V15.7.md](docs/游戏策划案_最终整合版_V15.7.md)。现有原型与V15.7的系统差异见[规则与代码对照表](docs/V15.7规则与代码对照表.md)。步骤1～5的数据模型、事件、伤害、同步击退和天气适应已完成；评分奖励、Boss与完整单局仍按实施方案推进。天气采用用户确认的晴／雨／风及三项适应，覆盖旧昼夜设计。
