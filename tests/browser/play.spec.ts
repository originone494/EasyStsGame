import { test, expect } from '@playwright/test';
test('实际点击：目标、治疗收尾、失败、重开、切换及空牌堆',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:'单侧追击'})).toBeVisible();
 await page.getByText('开发用固定局面',{exact:true}).click();
 await page.getByRole('button',{name:'最后击杀后治疗',exact:true}).click();
 await page.getByRole('button',{name:/开发用 · 不进入正式牌组/}).click();
 await page.getByRole('button',{name:'确认出牌'}).click();await expect(page.getByText('请先选择一个存活的敌人。',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:/选择敌人 #1/}).click();await page.getByRole('button',{name:'确认出牌'}).click();
 await expect(page.getByRole('heading',{name:'战斗胜利'})).toBeVisible();await expect(page.getByText(/剩余生命 12\/20/)).toBeVisible();
 await page.getByRole('button',{name:'再战一次'}).click();await expect(page.getByRole('heading',{name:'战斗胜利'})).toHaveCount(0);
 await page.getByText('开发用固定局面',{exact:true}).click();await page.getByRole('button',{name:'接触致死',exact:true}).click();
 await page.getByRole('button',{name:'结束回合 →'}).click();await expect(page.getByRole('heading',{name:'战斗失败'})).toBeVisible();
 await page.getByRole('button',{name:'切换测试战斗',exact:true}).first().click();await expect(page.getByRole('heading',{name:'双侧包围'})).toBeVisible();
 await page.getByText('开发用固定局面',{exact:true}).click();await page.getByRole('button',{name:'空牌堆与执行区',exact:true}).click();
 await page.getByRole('button',{name:/角色 · 技能/}).click();await page.getByRole('button',{name:'确认出牌'}).click();await expect(page.locator('.card')).toHaveCount(2);
 expect(errors).toEqual([]);
});
for(const [index,name] of ['单侧追击','双侧包围','边界压力'].entries()){
 test(`${name}：通过界面打到胜利并重开`,async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  for(let i=0;i<index;i++)await page.getByRole('button',{name:'切换测试战斗',exact:true}).first().click();
  await expect(page.getByRole('heading',{name})).toBeVisible();
  if(index===0)await page.screenshot({path:'test-results/battlefield.png',fullPage:true});
  for(let turn=0;turn<15;turn++){
   if(await page.getByRole('heading',{name:'战斗胜利'}).count())break;
   for(let plays=0;plays<10;plays++){
    const playable=page.locator('.card').filter({has:page.locator('h3', {hasText:/^(基础攻击|连击|整备)$/})}).first();
    if(!await playable.count())break;
    await playable.click();
    const target=await page.locator('.battlefield').evaluate(el=>{
     const cells=[...el.children];const player=cells.findIndex(c=>c.classList.contains('player-cell'));
     return cells.map((c,i)=>({button:c.querySelector<HTMLButtonElement>('[data-target]'),distance:Math.abs(i-player)})).filter(x=>x.button).sort((a,b)=>a.distance-b.distance)[0]?.button?.dataset.target;
    });
    if(target)await page.locator(`[data-target="${target}"]`).click();
    await page.getByRole('button',{name:'确认出牌'}).click();
    if(await page.getByRole('heading',{name:'战斗胜利'}).count())break;
   }
   if(await page.getByRole('heading',{name:'战斗胜利'}).count())break;
   await page.getByRole('button',{name:'结束回合 →'}).click();
  }
  await expect(page.getByRole('heading',{name:'战斗胜利'})).toBeVisible();
  await page.getByRole('button',{name:'再战一次'}).click();
  await expect(page.getByRole('heading',{name:'战斗胜利'})).toHaveCount(0);await expect(page.locator('.card')).toHaveCount(3);
 });
}
