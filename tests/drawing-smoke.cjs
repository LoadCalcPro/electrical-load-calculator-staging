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
  await page.locator('#library [data-add="panel"]').first().waitFor();
  checkErrors('initial load');

  for (const [tab, type] of [['one','panel'], ['plan','planpanel']]) {
   await page.locator('[data-drawing-tab="'+tab+'"]').click();
   assert.equal(await page.locator('body').getAttribute('data-drawing-view'), tab);
   const add = page.locator('#library [data-add="'+type+'"]').first();
   await add.click();
   await page.locator('#svg [data-node]').first().waitFor();
   const props = page.locator('#properties');
   assert.ok((await props.innerText()).trim().length > 0, 'Properties empty for '+tab);
   // Plan footprints currently use separate label fields; exercise shared text formatting on One-Line equipment only.
   if (tab === 'one') {
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
   const strokes = await page.locator('#svg [data-node]').last().locator('.equipment-symbol [stroke]').evaluateAll(elements => elements.map(el => el.getAttribute('stroke')?.toLowerCase()).filter(Boolean));
   assert.ok(strokes.includes('#2266aa'), 'SVG equipment outline did not reflect HEX color in '+tab+'; strokes: '+strokes.join(', '));
   // Formatting fields are intentionally disabled until a particular text label is selected.
   // Select a real SVG text element first; focusing a disabled input is not a valid test.
   const drawingText = page.locator('#svg [data-node]').last().locator('[data-inner-key]').first();
   assert.ok(await drawingText.count(), 'No selectable equipment text found for '+tab);
   await drawingText.click();
   const activeEditor = page.locator('.equipment-text-editor');
   const fontSize = activeEditor.locator('[data-shared-size]');
   assert.ok(await fontSize.isEnabled(), 'Font-size control did not enable after selecting equipment text in '+tab);
   const selectedKey = await drawingText.getAttribute('data-inner-key');
   const selectedNode = page.locator('#svg [data-node]').last();
   const selectedText = selectedNode.locator('[data-inner-key="'+selectedKey+'"]').first();
   const newSize = 17;
   await fontSize.fill(String(newSize));
   assert.equal(await fontSize.inputValue(), String(newSize), 'Font size control lost its edited value in '+tab);
   const renderedSize = await selectedText.getAttribute('font-size');
   assert.equal(Number(renderedSize), newSize, 'SVG text font size did not update in '+tab);
   assert.ok(await fontSize.isEnabled(), 'Selected equipment text was lost after changing font size in '+tab);
   const fontStyle = activeEditor.locator('[data-shared-style]');
   await fontStyle.selectOption('italic');
   assert.equal(await selectedText.getAttribute('font-style'), 'italic', 'SVG text did not change to italic in '+tab);
   assert.ok(await fontStyle.isEnabled(), 'Text selection was lost after changing font style in '+tab);
   await fontStyle.selectOption('bold');
   assert.equal(await selectedText.getAttribute('font-weight'), 'bold', 'SVG text did not change to bold in '+tab);
   assert.ok(await fontSize.isEnabled(), 'Text selection was lost after changing font weight in '+tab);
   // The same palette must format the selected label independently of the outline.
   const activeTarget = page.locator('.equipment-outline-palette select[aria-label="Choose equipment label or outline color target"]');
   await activeTarget.selectOption('label');
   assert.equal(await activeTarget.inputValue(), 'label', 'Label color target did not remain selected in '+tab);
   const labelHex = page.locator('.equipment-outline-palette input[aria-label="Color HEX color"]');
   await labelHex.fill('#BB3344');
   await labelHex.press('Tab');
   const labelFill = await selectedText.getAttribute('fill');
   assert.equal(labelFill?.toLowerCase(), '#bb3344', 'Selected SVG label color did not update in '+tab);
   const offsetX = activeEditor.locator('[data-shared-x]');
   const xBefore = Number(await selectedText.getAttribute('x'));
   await offsetX.fill('12');
   assert.equal(await offsetX.inputValue(), '12', 'Label horizontal offset control did not retain value in '+tab);
   const xAfter = Number(await selectedText.getAttribute('x'));
   assert.ok(Number.isFinite(xBefore)&&Number.isFinite(xAfter), 'Label X position is invalid in '+tab);
   assert.equal(xAfter-xBefore, 12, 'Label did not move horizontally by the requested offset in '+tab);
   const offsetY = activeEditor.locator('[data-shared-y]');
   const yBefore = Number(await selectedText.getAttribute('y'));
   await offsetY.fill('9');
   const yAfter = Number(await selectedText.getAttribute('y'));
   assert.ok(Number.isFinite(yBefore)&&Number.isFinite(yAfter), 'Label Y position is invalid in '+tab);
   assert.equal(yAfter-yBefore, 9, 'Label did not move vertically by the requested offset in '+tab);
   // Dragging must move only the selected label, not the entire equipment.
   const nodeTransformBefore = await selectedNode.getAttribute('transform');
   const textBox = await selectedText.boundingBox();
   assert.ok(textBox&&textBox.width>0&&textBox.height>0, 'Selected equipment label has no visible drag target in '+tab);
   const startX = textBox.x+textBox.width/2, startY=textBox.y+textBox.height/2;
   await page.mouse.move(startX,startY);
   await page.mouse.down();
   await page.mouse.move(startX+24,startY+15,{steps:5});
   await page.mouse.up();
   const draggedX = Number(await selectedText.getAttribute('x'));
   const draggedY = Number(await selectedText.getAttribute('y'));
   assert.ok(Math.abs(draggedX-xAfter)>0.5||Math.abs(draggedY-yAfter)>0.5, 'Mouse drag did not move the equipment label in '+tab);
   assert.equal(await selectedNode.getAttribute('transform'), nodeTransformBefore, 'Dragging a label moved the entire equipment in '+tab);
   assert.ok(await fontSize.isEnabled(), 'Text selection was lost after editing label color or offset in '+tab);
   // Equipment scale must affect the symbol and its labels together.
   const scaleControl = props.locator('[data-equipment-size]');
   assert.ok(await scaleControl.count(), 'Equipment size control missing in '+tab);
   const equipmentSymbol = page.locator('#svg [data-node]').last().locator('.equipment-symbol');
   const textWidthBeforeScale = (await selectedText.boundingBox())?.width;
   assert.ok(textWidthBeforeScale>0, 'Equipment text has no measurable width before resizing in '+tab);
   await scaleControl.fill('75');
   const symbolTransform = await equipmentSymbol.getAttribute('transform');
   assert.ok(symbolTransform?.includes('scale(0.75 0.75)'), 'Equipment did not resize to 75% in '+tab+': '+symbolTransform);
   assert.ok(await selectedText.count(), 'Equipment text disappeared after resizing in '+tab);
   const textWidthAfterScale = (await selectedText.boundingBox())?.width;
   assert.ok(textWidthAfterScale>0, 'Equipment text disappeared visually after resizing in '+tab);
   const widthRatio = textWidthAfterScale/textWidthBeforeScale;
   assert.ok(Math.abs(widthRatio-0.75)<0.08, 'Equipment label did not scale proportionally in '+tab+'; measured ratio '+widthRatio);
   checkErrors(tab+' palette and font-size/style edits');
   checkErrors(tab+' equipment Properties');
   } else {
    assert.ok(await props.locator('[data-plan-inside-label]').count(), 'Plan equipment inside-label field missing');
    assert.ok(await props.locator('[data-plan-outside-label]').count(), 'Plan equipment designation field missing');
    const insideLabel = props.locator('[data-plan-inside-label]');
    const outsideLabel = props.locator('[data-plan-outside-label]');
    await insideLabel.fill('PANEL TEST');
    assert.ok(await page.locator('#svg [data-node]').last().locator('text').filter({hasText:'PANEL TEST'}).count(), 'Plan inside label did not update drawing');
    await outsideLabel.fill('PLAN DESIGNATION');
    assert.ok(await page.locator('#svg [data-node]').last().locator('text').filter({hasText:'PLAN DESIGNATION'}).count(), 'Plan designation did not update drawing');
    const visibility = props.locator('[data-plan-outside-visible]');
    assert.ok(await visibility.count(), 'Plan designation visibility toggle missing');
    await visibility.uncheck();
    assert.equal(await page.locator('#svg [data-node]').last().locator('text').filter({hasText:'PLAN DESIGNATION'}).count(), 0, 'Hidden Plan designation remains visible');
    await visibility.check();
    assert.ok(await page.locator('#svg [data-node]').last().locator('text').filter({hasText:'PLAN DESIGNATION'}).count(), 'Plan designation did not reappear');
    const planScale = props.locator('[data-equipment-size]');
    assert.ok(await planScale.count(), 'Plan equipment scale control missing');
    await planScale.fill('75');
    const outsideSvg = page.locator('#svg [data-node]').last().locator('[data-plan-outside-text]');
    assert.ok((await outsideSvg.getAttribute('transform'))?.includes('scale(0.75 0.75)'), 'Plan designation did not scale with equipment');
    checkErrors('Plan View footprint properties');
   }
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
