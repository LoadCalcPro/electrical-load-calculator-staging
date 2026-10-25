const { chromium } = require('playwright');
const path = require('path');
const assert = require('node:assert/strict');

(async () => {
 const browser = await chromium.launch({headless:true});
 const page = await browser.newPage({viewport:{width:1440,height:900}});
 const errors = [];
 page.on('pageerror', error => errors.push(error.message));
 const checkErrors = stage => assert.deepEqual(errors, [], 'JavaScript errors after '+stage);
 try {
  await page.goto('file://' + path.resolve(__dirname, '../one-line/index.html'));
  await page.locator('#library [data-add="panel"]').waitFor();
  checkErrors('initial load');

  for (const [tab, type] of [['one','panel'], ['plan','planpanel']]) {
   await page.locator('[data-drawing-tab="'+tab+'"]').click();
   assert.equal(await page.locator('body').getAttribute('data-drawing-view'), tab);
   const add = page.locator('#library [data-add="'+type+'"]').first();
   await add.click();
   await page.locator('#svg [data-node]').first().waitFor();
   const props = page.locator('#properties');
   assert.ok((await props.innerText()).trim().length > 0, 'Properties empty for '+tab);
   const textEditor = page.locator('.equipment-text-editor');
   assert.ok(await textEditor.count(), 'Shared equipment editor missing for '+tab);
   assert.ok(await textEditor.locator('[data-shared-size]').count(), 'Font-size control missing for '+tab);
   assert.ok(await textEditor.locator('[data-shared-style]').count(), 'Font-style control missing for '+tab);
   assert.ok(await textEditor.locator('[data-shared-x]').count(), 'Horizontal offset missing for '+tab);
   assert.ok(await textEditor.locator('[data-shared-y]').count(), 'Vertical offset missing for '+tab);
   checkErrors(tab+' equipment Properties');
  }

  await page.locator('[data-drawing-tab="ladder"]').click();
  assert.equal(await page.locator('body').getAttribute('data-drawing-view'), 'ladder');
  await page.locator('#svg').waitFor();
  checkErrors('Ladder Diagram');

  await page.locator('[data-drawing-tab="one"]').click();
  checkErrors('return to One-Line');
  console.log('PASS: all drawing tabs, equipment Properties, shared formatting controls, no JavaScript errors');
 } finally {
  await browser.close();
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
