import { test, expect, type Page, type Locator } from '@playwright/test';
const cards = (page:Page) => page.locator('.hand .card');
async function center(locator:Locator) {
 const box=await locator.boundingBox(); if(!box)throw new Error('操作目标不可见');
 return {x:box.x+box.width/2,y:box.y+box.height/2};
}
async function emptySpot(page:Page) { const box=await page.locator('.scene-heading').boundingBox();return{x:box!.x+300,y:box!.y+80}; }
async function dragTo(page:Page,card:Locator,to:{x:number;y:number}) {
 await card.hover(); const from=await center(card);await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();
}
async function scenario(page:Page,name:string) {
 await page.getByText('开发用固定局面',{exact:true}).click();await page.getByRole('button',{name,exact:true}).click();
}
async function seed(page:Page,value:number) {
 await page.getByText('开发用固定局面',{exact:true}).click();await page.locator('#seed').fill(String(value));await page.locator('#seed').press('Tab');
}
test.beforeEach(async({page})=>{await page.setViewportSize({width:1440,height:1000});await page.goto('/');});

test('同一场景中展示完整尺寸卡牌，无独立手牌面板；无目标放置不消耗',async({page})=>{
 await expect(page.locator('.play-area, .hand-table')).toHaveCount(0);
 expect(await page.locator('.hand-overlay').evaluate(el=>el.parentElement?.classList.contains('arena'))).toBe(true);
 expect(await page.locator('.hand-overlay').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
 const height=await page.locator('.hand .card-combo').evaluate(el=>(el as HTMLElement).offsetHeight);expect(height).toBe(300);
 const card=page.locator('.hand .card-combo');await card.click();await expect(page.locator('.held-card')).toHaveCount(1);await expect(cards(page)).toHaveCount(3);
 const point=await emptySpot(page);await page.mouse.click(point.x,point.y);
 await expect(page.locator('.held-card')).toHaveCount(0);await expect(cards(page)).toHaveCount(3);await expect(page.locator('.discard-pile>b')).toHaveText('0');
 await expect(page.getByText('未选择合法目标，卡牌已返回手牌。',{exact:true})).toBeVisible();
});
test('左键拖到敌人身上直接出牌，不再需要确认按钮',async({page})=>{
 await dragTo(page,page.locator('.hand .card-strike'),await center(page.locator('[data-target="2"]')));
 await expect(page.locator('[data-target="2"] .hp-label')).toContainText('6/10');await expect(cards(page)).toHaveCount(2);await expect(page.locator('.discard-pile>b')).toHaveText('1');
 await expect(page.getByRole('button',{name:'确认出牌'})).toHaveCount(0);
});
test('拖出后没有敌人则返回；曾经指向敌人不会留下过期目标',async({page})=>{
 const card=page.locator('.hand .card-strike');await card.click();const target=await center(page.locator('[data-target="2"]'));
 await page.mouse.move(target.x,target.y);await expect(page.locator('[data-target="2"]')).toHaveClass(/targeted/);
 const blank=await emptySpot(page);await page.mouse.move(blank.x,blank.y);await expect(page.locator('.targeted')).toHaveCount(0);await page.mouse.click(blank.x,blank.y);
 await expect(cards(page)).toHaveCount(3);await expect(page.locator('[data-target="2"] .hp-label')).toContainText('10/10');
});
test('拖回手牌区域不出牌',async({page})=>{
 const rect=await page.locator('.game-shell').boundingBox();await dragTo(page,page.locator('.hand .card-strike'),{x:rect!.x+200,y:rect!.y+rect!.height*.85});
 await expect(page.locator('.held-card')).toHaveCount(0);await expect(cards(page)).toHaveCount(3);await expect(page.locator('.discard-pile>b')).toHaveText('0');
});
test('点击拿牌后移动再点击敌人，可打出且完成最后击杀治疗',async({page})=>{
 await scenario(page,'最后击杀后治疗');await cards(page).click();await page.locator('[data-target="1"]').click();
 await expect(page.getByRole('heading',{name:'战斗胜利'})).toBeVisible();await expect(page.getByText(/剩余生命 12\/20/)).toBeVisible();await expect(page.locator('.held-card')).toHaveCount(0);
 await page.getByRole('button',{name:'再战一次'}).click();await expect(cards(page)).toHaveCount(1);
});
test('右键取消点击拿牌和正在拖拽的牌，不造成伤害或消耗',async({page})=>{
 const card=page.locator('.hand .card-strike');await card.click();const target=await center(page.locator('[data-target="2"]'));await page.mouse.move(target.x,target.y);await page.mouse.click(target.x,target.y,{button:'right'});
 await expect(page.locator('.held-card')).toHaveCount(0);await expect(page.locator('.target-aim')).toHaveCount(0);
 await card.hover();const from=await center(card);await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:8});await page.mouse.click(target.x,target.y,{button:'right'});await page.mouse.up();
 await expect(cards(page)).toHaveCount(3);await expect(page.locator('[data-target="2"] .hp-label')).toContainText('10/10');await expect(page.locator('.discard-pile>b')).toHaveText('0');
});
test('整备拖到战场直接执行抽牌与消耗',async({page})=>{
 await scenario(page,'空牌堆与执行区');await dragTo(page,cards(page),await emptySpot(page));
 await expect(cards(page)).toHaveCount(2);await expect(page.locator('.discard-pile>span')).toHaveText('消耗 1 · 执行 0');
});
test('移动牌只在方向标记处执行；越界或被占据不消耗',async({page})=>{
 await seed(page,0);await page.locator('.hand .card-step').click();await page.locator('[data-play-direction="-1"]').click();
 await expect(page.locator('.player-cell .coordinate')).toHaveText('05');await expect(cards(page)).toHaveCount(2);
 await page.getByRole('button',{name:'切换测试战斗',exact:true}).click();await page.getByRole('button',{name:'切换测试战斗',exact:true}).click();
 await page.locator('.hand .card-step').click();await page.locator('[data-play-direction="-1"]').click();
 await expect(page.locator('.player-cell .coordinate')).toHaveText('01');await expect(cards(page)).toHaveCount(3);await expect(page.locator('.discard-pile>b')).toHaveText('0');
 await expect(page.getByText('移动终点被占据或超出边界，请选择其他方向。',{exact:true})).toBeVisible();
});
test('Esc、窗口失焦和回合切换清理拿牌状态',async({page})=>{
 await page.locator('.hand .card-strike').click();await page.keyboard.press('Escape');await expect(page.locator('.held-card')).toHaveCount(0);
 await page.locator('.hand .card-strike').click();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await expect(page.locator('.held-card')).toHaveCount(0);
 await page.locator('.hand .card-strike').click();await page.getByRole('button',{name:'结束回合 →'}).click();await expect(page.locator('.held-card')).toHaveCount(0);await expect(page.locator('.turn-status strong')).toHaveText('02');
});
test('接触失败仍可重开和切换战斗',async({page})=>{
 await scenario(page,'接触致死');await page.getByRole('button',{name:'结束回合 →'}).click();await expect(page.getByRole('heading',{name:'战斗失败'})).toBeVisible();
 await page.getByRole('button',{name:'切换测试战斗',exact:true}).click();await expect(page.getByRole('heading',{name:'双侧包围'})).toBeVisible();
});
for(const [index,name] of ['单侧追击','双侧包围','边界压力'].entries()){
 test(`${name}：通过新版拿牌操作打到胜利并重开`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(let i=0;i<index;i++)await page.getByRole('button',{name:'切换测试战斗',exact:true}).click();
  await expect(page.getByRole('heading',{name})).toBeVisible();
  if(index===0)await page.screenshot({path:'test-results/battlefield.png',fullPage:true});
  for(let turn=0;turn<15;turn++){
   if(await page.getByRole('heading',{name:'战斗胜利'}).count())break;
   for(let plays=0;plays<10;plays++){
    const playable=cards(page).filter({has:page.locator('h3',{hasText:/^(基础攻击|连击|整备)$/})}).first();if(!await playable.count())break;
    const isPrepare=await playable.locator('h3').innerText()==='整备';await playable.click();
    if(isPrepare){const blank=await emptySpot(page);await page.mouse.click(blank.x,blank.y);}
    else{
     const target=await page.locator('.battlefield').evaluate(el=>{const cells=[...el.children],player=cells.findIndex(c=>c.classList.contains('player-cell'));return cells.map((c,i)=>({button:c.querySelector<HTMLButtonElement>('[data-target]'),distance:Math.abs(i-player)})).filter(x=>x.button).sort((a,b)=>a.distance-b.distance)[0]?.button?.dataset.target;});
     if(target)await page.locator(`[data-target="${target}"]`).click();
    }
    if(await page.getByRole('heading',{name:'战斗胜利'}).count())break;
   }
   if(await page.getByRole('heading',{name:'战斗胜利'}).count())break;
   await page.getByRole('button',{name:'结束回合 →'}).click();
  }
  await expect(page.getByRole('heading',{name:'战斗胜利'})).toBeVisible();await page.getByRole('button',{name:'再战一次'}).click();await expect(cards(page)).toHaveCount(3);expect(errors).toEqual([]);
 });
}

test('1280×720 不把卡牌压缩进四分之一面板，点击拿牌可正常使用',async({page})=>{
 await page.setViewportSize({width:1280,height:720});
 await expect(page.locator('.play-area')).toHaveCount(0);
 expect(await page.locator('.hand .card-strike').evaluate(el=>(el as HTMLElement).offsetHeight)).toBe(270);
 await page.locator('.hand .card-strike').click();await page.locator('[data-target="2"]').click();
 await expect(page.locator('[data-target="2"] .hp-label')).toContainText('6/10');
});
test('键盘可拿牌、选敌人和使用无目标牌',async({page})=>{
 await page.locator('.hand .card-strike').focus();await page.keyboard.press('Enter');await expect(page.locator('.held-card')).toHaveCount(1);
 await page.locator('[data-target="2"]').focus();await page.keyboard.press('Enter');await expect(page.locator('[data-target="2"] .hp-label')).toContainText('6/10');
 await page.locator('.hand .card-prepare').focus();await page.keyboard.press('Enter');await page.keyboard.press('Enter');
 await expect(page.locator('.held-card')).toHaveCount(0);await expect(page.locator('.discard-pile>span')).toHaveText('消耗 1 · 执行 0');
});

for(const [width,height] of [[640,720],[800,600],[1280,720],[1920,1080]]){
 test(`${width}×${height}：战场边界等于窗口边界，13 格全部可见，无滚动`,async({page})=>{
  await page.setViewportSize({width,height});
  const geometry=await page.locator('.battlefield').evaluate(el=>{
   const rect=el.getBoundingClientRect();
   return {left:rect.left,right:rect.right,width:rect.width,client:el.clientWidth,scroll:el.scrollWidth,cells:[...el.children].map(c=>{const r=c.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};})};
  });
  expect(geometry.left).toBeCloseTo(0,0);expect(geometry.right).toBeCloseTo(width,0);expect(geometry.cells).toHaveLength(13);expect(geometry.scroll).toBeLessThanOrEqual(geometry.client+1);
  for(const cell of geometry.cells){expect(cell.left).toBeGreaterThanOrEqual(-1);expect(cell.right).toBeLessThanOrEqual(width+1);expect(cell.width).toBeCloseTo(width/13,0);}
  const scene=await page.locator('.arena').boundingBox();expect(scene).toEqual({x:0,y:0,width,height});
  await page.getByRole('button',{name:'切换测试战斗',exact:true}).click();await page.getByRole('button',{name:'切换测试战斗',exact:true}).click();
  await expect(page.locator('.cell').first().locator('[data-target]')).toBeInViewport({ratio:1});
  await page.locator('.cell').first().locator('[data-target]').click();
  expect(await page.locator('.battlefield-track').evaluate(el=>el.scrollLeft)).toBe(0);
 });
}
