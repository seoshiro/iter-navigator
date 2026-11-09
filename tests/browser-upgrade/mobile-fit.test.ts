import { test, expect } from '@playwright/test';
for(const viewport of [{width:390,height:844},{width:375,height:667}])test(`expanded route stays inside real projection ${viewport.width}`,async({browser},testInfo)=>{
 const context=await browser.newContext({viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true});const page=await context.newPage();
 await page.goto('http://127.0.0.1:5269/');await page.locator('.view-switch button').first().click();const scene=page.locator('.diorama');await expect(scene).toHaveAttribute('data-animating','false');
 // Start from actual manual orbit/zoom, matching the mobile report sequence.
 await scene.scrollIntoViewIfNeeded();const box=(await scene.boundingBox())!;await page.mouse.move(box.x+box.width*.45,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.55,{steps:10});await page.mouse.up();
 const before=JSON.parse((await scene.getAttribute('data-camera'))!);expect(before.yaw).not.toBe(-38);
 await scene.scrollIntoViewIfNeeded();await page.getByRole('button',{name:'Показать весь маршрут',exact:true}).evaluate(button=>(button as HTMLButtonElement).click());
 await page.waitForTimeout(80);await expect(scene).toHaveAttribute('data-animating','true');await scene.screenshot({path:testInfo.outputPath('transition.png')});
 await expect(scene).toHaveAttribute('data-animating','false');
 // These bounds are calculated from live Three.js mesh vertices/bounding boxes projected by the actual render camera.
 for(const attribute of ['data-route-screen-bounds','data-model-screen-bounds']){
  const bounds=JSON.parse((await scene.getAttribute(attribute))!);for(const coordinate of Object.values(bounds) as number[])expect(Math.abs(coordinate)).toBeLessThan(.98);
 }
 // Whole-route intentionally restores the readable oblique section instead of preserving an occluding manual angle.
 const after=JSON.parse((await scene.getAttribute('data-camera'))!);expect(after.preset).toBe('overview');expect(after.yaw).toBe(-38);expect(after.tilt??0).toBe(0);await expect(scene).toHaveAttribute('data-route-reveal','true');
 await scene.screenshot({path:testInfo.outputPath('settled.png')});await expect(page.getByTestId('route-result')).toContainText('40');
 await context.close();
});
