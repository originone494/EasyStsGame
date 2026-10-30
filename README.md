# 简单尖塔 / EasyStsGame

电脑浏览器单机卡牌战斗原型，TypeScript + Vite + HTML/CSS，无后端、无运行时第三方服务。界面采用像素风野外雾林、独立角色与敌人精灵、带插画卡牌。已支持三个独立战斗、Boss输出挑战，以及三层共22个战斗节点的自由选点地图；每层1商店＋4事件及Boss旁唯一火堆，全局40节点。角色、卡牌和敌人仍为临时内容，实际选卡、招募、安全节点服务、存档及正式平衡按后续计划推进。

## Windows 免解压更新

下载单文件 [启动游戏.cmd](https://github.com/originone494/EasyStsGame/raw/refs/heads/main/启动游戏.cmd)，首次安装后，双击自动检查新版并打开游戏。需要 Node.js 24 LTS 与 Git for Windows。游戏文件直接放在 CMD 所在文件夹，下载缓存和临时文件放在该目录的 `.easysts` 内。从 GitHub `main` 分支获取最新发布的代码，不包含尚未推送的云端修改。 详见[免解压更新](docs/免解压更新.md)。

## 本地启动（Windows / macOS / Linux）

安装 Node.js **22.12+（建议 24 LTS）**，在仓库目录运行：

```sh
npm ci
npm run dev
```

按终端提示在电脑浏览器打开服务地址。战场完整铺满窗口，13 格随窗口等分、全部可见，没有战场滚动条。正常尺寸卡牌直接叠在同一场景前景，底部四分之一仅用于判断收牌／出牌，不设手牌面板：按住左键拖出，或左键点击拿起后再次点击使用。目标牌须放到敌人身上，无目标会返回手牌；右键或 Esc 取消。移步牌放到队伍左右的方向标记，无目标牌放到战场即可生效。卡牌免费，结束回合时怪物依次行动。胜利后可继续下一个测试布局并携带生命、金币和适应；重开恢复当前战斗开局状态，切换测试战斗创建独立开局。点击左下角抽牌堆、右下角弃牌堆或旁边的消耗堆（✕）可查看卡牌，窗口内可切换牌堆，按 Esc、点关闭按钮或点遮罩返回。抽牌堆按牌名展示，不代表实际抽取顺序。浏览器刷新会重新开始，本阶段不存档。

构建可本地运行版本：

```sh
npm run build
npm run preview
```

构建产物在 `dist/`，应通过静态 HTTP 服务打开，不能直接双击 `index.html`。首次安装需要 npm 网络访问；依赖安装完成后，启动和游玩不需要联网。无外部字体、图片或服务。

## 验证

```sh
npm test             # 264项：原有244项＋20项选卡／招募框架检查
npm run test:launcher # 12项启动器检查
npm run build       # 严格 TypeScript 检查及生产构建
npx playwright install chromium  # 本机首次浏览器验收时使用
npm run test:browser # 91项浏览器流程（原有86项＋选卡／招募5项）
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
- [步骤6非Boss评分奖励规格与验收](docs/步骤6_非Boss评分奖励规格与验收.md)
- [步骤7Boss输出挑战规格与验收](docs/步骤7_Boss输出挑战规格与验收.md)
- [步骤8单局状态与线性地图规格及验收](docs/步骤8_单局状态与线性地图规格及验收.md)
- [步骤9奖励选卡与角色招募框架及验收](docs/步骤9_奖励选卡与角色招募框架及验收.md)
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
- `src/content/economy.ts`：普通战20金币＋5点指定适应，Boss100金币＋三项适应各10点，楼层上限50／100／200（均为用户确认的可调测试值）。
- `src/content/map.ts`、`src/game/map.ts`、`run.ts`：地图配置、固定骨架／随机节点、独立RunState、自由选点与Boss升层。
- `src/ui/map.ts`、`mapArt.ts`、`map.css`：羊皮纸节点地图、原创墨线图标、地形装饰及均匀散点布局。
- `src/content/bossEncounters.ts`、`bossScenarios.ts`、`src/game/boss.ts`：独立Boss布局、十个开发局面、累计伤害及接触判定。
- `src/game/scoring.ts`、`rewards.ts`、`progression.ts`：评分账本、20%保底精确奖励及临时三布局成长衔接。
- `src/content/relics.ts`：开发局面的测试遗物，普通战斗不装配。
- `src/game/`：独立规则；`src/ui/`：纯展示；`src/main.ts`：输入绑定。

开发用固定局面通过地址参数访问，不在普通游戏界面显示调试文字：`?scenario=heal`（收尾治疗）、`?scenario=empty`（空牌堆）、`?scenario=lethal`（接触致死）、`?scenario=chain`（击退传递）；`?seed=0&encounter=2` 可指定种子与布局。开发专用测试卡不会加入正常牌组。

事件验收入口：`?scenario=events`（最后击杀遗物连锁）、`?scenario=snapshots`（资格与数值快照）、`?scenario=eventLethal`（代价致死）、`?scenario=eventTarget`（目标失效与独立治疗）。添加 `&debug=events` 可展开查看完整事件、队列及触发日志。用法与预期见[步骤2执行规格](docs/步骤2_事件执行规格与验收.md)。

伤害验收入口：`?scenario=damageFormula`（独立倍率）、`?scenario=damageMulti`（分段取整）、`?scenario=damageWave`（群体同步击杀）、`?scenario=damagePartial`（群体部分击杀）、`?scenario=damageKinds`（来源修正隔离）。添加 `&debug=events` 查看完整公式、伤害类别、实际扣血及批次。预期结果与暂定交叉事件顺序见[步骤3执行规格](docs/步骤3_伤害执行规格与验收.md)。

击退验收入口：`?scenario=pushTogether`（同向累加）、`?scenario=pushSplit`（双侧同步）、`?scenario=pushOpposed`（反向净余）、`?scenario=pushClash`（等量争格）、`?scenario=pushSandwich`（同位置排序）、`?scenario=pushChain`（连续传递）、`?scenario=pushLimits`（双侧边界）。添加 `&debug=events` 查看碰撞类别、发生拍次和守恒账本。反向冲突等可调整执行选择见[步骤4规格](docs/步骤4_同步击退执行规格与验收.md)。

天气验收入口：`?scenario=weatherSun`、`?scenario=weatherRain`、`?scenario=weatherWind`（各天气属性增伤），`?scenario=weatherCycle`（连续观察第4／7／10回合切换），`?scenario=weatherMultipliers`（适应与独立倍率），`?scenario=weatherSources`（伤害来源隔离）。添加 `&debug=events` 查看天气、属性及事件。正常入口也显示天气和倒计时，初始三项适应为0；战后指定属性成长已接入，实际奖励受评分和楼层上限约束。完整规则见[步骤5规格](docs/步骤5_天气与适应执行规格及验收.md)。

完整策划案已原样归档：[游戏策划案_最终整合版_V15.7.md](docs/游戏策划案_最终整合版_V15.7.md)。现有原型与V15.7的系统差异见[规则与代码对照表](docs/V15.7规则与代码对照表.md)。步骤1～8的数据模型、事件、伤害、同步击退、天气适应、评分奖励、Boss挑战和单局地图骨架已完成；选卡、招募、安全节点服务和存档仍按实施方案推进。天气采用用户确认的晴／雨／风及三项适应，覆盖旧昼夜设计。

评分奖励验收入口：`?scenario=scoreZero`、`scoreHalf`、`scoreSeventyFive`、`scoreFull`、`scoreCap`、`scoreDefeat`；操作与预期见[步骤6规格](docs/步骤6_非Boss评分奖励规格与验收.md)。普通战0%／50%／75%／100%评分分别获得4／12／16／20金币及1／3／4／5点指定适应，失败无奖励。实际选卡留待步骤9。

Boss独立入口：`?battle=boss&floor=1&seed=157`（floor为1／2／3，使用正常七张牌组）。固定验收入口：`?scenario=boss99`、`boss100`、`boss110`、`bossPush`、`bossMixed`、`bossMinionContact`、`boss600`、`bossFinal`、`bossMulti`、`bossLethal`，追加`&debug=events`查看实际扣血与独立累计。Boss归零后不死亡，首次接触按输出达标结算；一二层奖励最高5倍，第三层直接通关无奖励。Boss结果的“重新开局”回到普通初始战斗，不重试失败Boss。实际地图、选卡和遗物池仍待后续步骤，详见[步骤7规格](docs/步骤7_Boss输出挑战规格与验收.md)。

单局入口：点击“开始冒险”，或添加`?mode=run&seed=157`。三层共22个战斗节点＋18安全节点；当前层未完成节点任意选择，也可直接挑战Boss。普通节点完成后回到本层地图，已完成节点不可重打。第一、二层Boss成功确认结果后升层，跳过节点不完成、不补发奖励，也不能回到旧层；第三层Boss成功通关无奖励。战斗中可查看地图后返回，失败只能重新开局。每层总共且仅1商店、1火堆：5个随机位置名额为1商店＋4事件，唯一火堆在Boss下方附近、额外计数，访问不设前置。精英暂不默认生成，安全节点服务待后续步骤实现。刷新仍重开。详见[自由选点规格](docs/地图自由选点规格与验收.md)。

地图采用羊皮纸与墨线图标，同层节点采用带间距约束的随机散点，均匀且散乱，不排成规则行列。Boss固定在最高处，其余节点全部在其下方。没有路线和连线，直接点击任意可用节点进入；额外火堆在Boss下方附近。已完成节点保留原位置并显示勾。只展示当前层、地图铺满可用宽度；已移除标题进度、楼层切换、方向提示和整个侧栏。


奖励选卡／招募框架独立验收入口：`?mode=run&scenario=rewardRecruitment&seed=157&debug=events`。可操作普通战选卡／跳过、Boss旧队伍稀有卡、随机通用遗物和连续三轮招募，从1人到3人。此入口使用隔离验收角色与卡牌，正常游戏等待用户提供正式设计及未定规则后接入；重新开局／返回试战恢复现有正常内容，不把验收角色留在卡池。详见[步骤9规格](docs/步骤9_奖励选卡与角色招募框架及验收.md)。
