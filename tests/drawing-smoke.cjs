const { chromium } = require('playwright');
const path = require('path');
const assert = require('node:assert/strict');
const fs = require('node:fs');

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
   const palette = page.locator('.equipment-outline-palette');
   assert.ok(await palette.count(), 'Shared equipment color palette missing for '+tab);
   const target = palette.locator('select[aria-label="Choose equipment label or outline color target"]');
   assert.ok(await target.count(), 'Palette target selector missing for '+tab);
   await target.selectOption('outline');
   assert.equal(await target.inputValue(), 'outline', 'Could not select equipment outline for '+tab);
   const outlineHex = palette.locator('input[aria-label="Color HEX color"]');
   assert.ok(await outlineHex.count(), 'Outline HEX color input missing for '+tab);
   await outlineHex.fill('#2266AA');
   await outlineHex.press('Tab');
   assert.equal((await outlineHex.inputValue()).toLowerCase(), '#2266aa', 'Outline HEX color did not persist for '+tab);
   const colorAfterEdit = await page.locator('#svg [data-node]').last().getAttribute('data-node');
   assert.ok(colorAfterEdit, 'Equipment disappeared after outline color edit in '+tab);
   const symbolStroke = await page.locator('#svg [data-node]').last().locator('.equipment-symbol [stroke]').first().getAttribute('stroke');
   assert.equal(symbolStroke?.toLowerCase(), '#2266aa', 'SVG equipment outline did not reflect HEX color in '+tab);
   await textEditor.locator('[data-shared-size]').focus();
   checkErrors(tab+' palette and font focus');
   checkErrors(tab+' equipment Properties');
  }

  await page.locator('[data-drawing-tab="ladder"]').click();
  assert.equal(await page.locator('body').getAttribute('data-drawing-view'), 'ladder');
  await page.locator('#svg').waitFor();
  checkErrors('Ladder Diagram');

  await page.locator('[data-drawing-tab="one"]').click();
  checkErrors('return to One-Line');
  console.log('PASS: all drawing tabs, equipment Properties, shared formatting controls, no JavaScript errors');
 } catch (error) {
  fs.mkdirSync('test-results', {recursive:true});
  await page.screenshot({path:'test-results/drawing-smoke-failure.png',fullPage:true}).catch(()=>{});
  fs.writeFileSync('test-results/failure.txt', String(error?.stack||error)+'\nPage errors:\n'+errors.join('\n'));
  throw error;
 } finally {
  await browser.close();
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
