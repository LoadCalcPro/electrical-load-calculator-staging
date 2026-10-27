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

  // Clipboard regression: external image and plain text paste, editable selection,
  // drawing-tab isolation, and preservation through tab switching.
  await page.evaluate(async ()=>{
    const canvas=document.createElement('canvas');canvas.width=120;canvas.height=80;
    const context=canvas.getContext('2d');context.fillStyle='#123456';context.fillRect(0,0,120,80);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const file=new File([blob],'copied.png',{type:'image/png'});
    const dt=new DataTransfer();dt.items.add(file);
    window.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
  });
  await page.locator('#svg [data-personal-image^="clipboard-"]').first().waitFor();
  const pastedImage=page.locator('#svg [data-personal-image^="clipboard-"]').first();
  await pastedImage.locator('rect').first().click({force:true});
  assert.ok(await page.locator('#svg [data-image-resize]').count(),'Pasted image lacks resize handle');
  const beforeResize=await pastedImage.locator('image').evaluate(el=>({width:Number(el.getAttribute('width')),height:Number(el.getAttribute('height'))}));
  const handle=page.locator('#svg [data-image-resize]').first();
  const handleBox=await handle.boundingBox();
  assert.ok(handleBox,'Pasted image resize handle is not visible');
  await page.mouse.move(handleBox.x+handleBox.width/2,handleBox.y+handleBox.height/2);
  await page.mouse.down();await page.mouse.move(handleBox.x+handleBox.width/2+35,handleBox.y+handleBox.height/2+35,{steps:5});await page.mouse.up();
  const afterResize=await pastedImage.locator('image').evaluate(el=>({width:Number(el.getAttribute('width')),height:Number(el.getAttribute('height'))}));
  assert.ok(afterResize.width>beforeResize.width,'Dragging image corner did not increase width');
  assert.ok(Math.abs(afterResize.width/afterResize.height-beforeResize.width/beforeResize.height)<0.02,'Resizing changed image aspect ratio');

  // The imported image layer must remain below conductors, equipment, and notes.
  const layers=await page.locator('#svg g[id]').evaluateAll(els=>els.map(el=>el.id));
  for(const id of ['wires','drawnLines','nodes','annotations']){
    assert.ok(layers.indexOf('personalImages')<layers.indexOf(id),'Imported image renders above '+id);
  }
  // Repeated right clicks must not accumulate duplicate menu actions.
  await pastedImage.locator('rect').first().click({button:'right',force:true});
  assert.equal(await page.locator('#drawingObjectMenu button').count(),5,'Object context menu lacks expected actions');
  await pastedImage.locator('rect').first().click({button:'right',force:true});
  assert.equal(await page.locator('#drawingObjectMenu button').count(),5,'Context menu duplicated actions on repeated opening');
  await page.locator('#drawingObjectMenu button', {hasText:'Duplicate'}).click();
  assert.equal(await page.locator('#svg [data-personal-image^="clipboard-"]').count(),2,'Duplicate did not create another image');
  await page.locator('#svg [data-personal-image^="clipboard-"]').last().locator('rect').first().click({button:'right',force:true});
  await page.locator('#drawingObjectMenu button', {hasText:'Delete'}).click();
  assert.equal(await page.locator('#svg [data-personal-image^="clipboard-"]').count(),1,'Delete did not remove duplicate image');

  // Cut/Paste should remove and restore the selected object, with a new identity.
  await page.locator('#svg [data-personal-image^="clipboard-"]').first().locator('rect').first().click({button:'right',force:true});
  await page.locator('#drawingObjectMenu button', {hasText:'Cut'}).click();
  assert.equal(await page.locator('#svg [data-personal-image^="clipboard-"]').count(),0,'Cut did not remove image');
  await page.locator('#svg').click({button:'right',position:{x:200,y:160},force:true});
  assert.equal(await page.locator('#drawingObjectMenu button', {hasText:'Paste'}).isDisabled(),false,'Paste disabled after Cut');
  await page.locator('#drawingObjectMenu button', {hasText:'Paste'}).click();
  assert.equal(await page.locator('#svg [data-personal-image^="clipboard-"]').count(),1,'Paste did not restore cut image');
  checkErrors('Cut and Paste context menu');
  // Locked background must not intercept mouse input and must preserve state.
  await page.evaluate(()=>{personalImages[0].locked=true;selected=null;render();});
  assert.equal(await page.locator('#svg [data-personal-image^="clipboard-"] rect').first().getAttribute('pointer-events'),null);
  assert.ok((await page.locator('#svg [data-personal-image^="clipboard-"] rect').first().getAttribute('style')).includes('pointer-events:none'),'Locked image still intercepts clicks');
  assert.ok((await page.locator('#svg [data-personal-image^="clipboard-"] image').first().getAttribute('style')).includes('pointer-events:none'),'Locked image bitmap still intercepts clicks');
  assert.equal(await page.locator('#svg [data-image-resize]').count(),0,'Locked background still has a resize handle');
  // A locked imported plan must allow electrical equipment underneath the cursor
  // to receive pointer events instead of the background image.
  const hitTest=await page.evaluate(()=>{
    const image=document.querySelector('#svg [data-personal-image^="clipboard-"] image');
    const box=image.getBoundingClientRect();
    const target=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
    return !!target&&!image.contains(target)&&target!==image;
  });
  assert.ok(hitTest,'Locked background is still the mouse hit target');

  // The toolbar manager must allow a locked PDF/image to be selected and unlocked.
  await page.locator('#manageBackgrounds').click();
  assert.equal(await page.locator('#imgLocked').isChecked(),true,'Manage Backgrounds did not select the locked image');

  // Repeated clicks should cycle through images without opening modal dialogs.
  await page.evaluate(()=>{
    const source=personalImages[0];
    personalImages.push({...source,kind:'clipboard-test-second',x:source.x+40,locked:true});
    render();
  });
  await page.locator('#manageBackgrounds').click();
  assert.equal(await page.evaluate(()=>selected?.id),'clipboard-test-second','Manage Backgrounds did not advance to next image');
  await page.locator('#manageBackgrounds').click();
  assert.notEqual(await page.evaluate(()=>selected?.id),'clipboard-test-second','Manage Backgrounds did not wrap to first image');
  await page.evaluate(()=>{personalImages=personalImages.filter(im=>im.kind!=='clipboard-test-second');render();});
  await page.locator('#imgLocked').uncheck();
  assert.equal(await page.locator('#imgLocked').isChecked(),false,'Background could not be unlocked through Properties');
  assert.ok(!(await page.locator('#svg [data-personal-image^="clipboard-"] image').first().getAttribute('style')).includes('pointer-events:none'),'Unlocked image still ignores mouse selection');
  await page.locator('#imgLocked').check();
  assert.equal(await page.locator('#imgLocked').isChecked(),true,'Background could not be locked again');
  checkErrors('Manage Backgrounds lock and unlock');
  await page.evaluate(()=>{personalImages[0].locked=false;render();});
  checkErrors('context menu, image layering, and background lock');


  await page.locator('[data-drawing-tab="plan"]').click();
  assert.equal(await page.locator('#svg [data-personal-image^="clipboard-"]').count(),0,'Pasted image leaked into Plan View');
  await page.locator('[data-drawing-tab="one"]').click();
  assert.equal(await page.locator('#svg [data-personal-image^="clipboard-"]').count(),1,'Pasted image lost when switching tabs');
  await page.evaluate(()=>{
    const dt=new DataTransfer();dt.setData('text/plain','PASTED CLIPBOARD NOTE');
    window.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
  });
  assert.ok(await page.locator('#svg [data-annotation]').count(),'Clipboard text did not create an annotation');
  // Save/Open must preserve the pasted image and text on the correct tab.
  await page.locator('#printToggle').click();
  await page.locator('#save').waitFor({state:'visible'});
  const [clipboardDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);
  const clipboardPath=await clipboardDownload.path();
  const clipboardProject=JSON.parse(fs.readFileSync(clipboardPath,'utf8'));
  assert.equal(clipboardProject.drawingViews.one.personalImages.filter(im=>im.kind.startsWith('clipboard-')).length,1,'Saved One-Line image missing');
  assert.equal((clipboardProject.drawingViews.plan?.personalImages||[]).length,0,'Saved Plan View contains One-Line image');
  assert.ok(clipboardProject.drawingViews.one.annotations.some(a=>a.text==='PASTED CLIPBOARD NOTE'),'Saved clipboard note missing');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#new').click();
  assert.equal(await page.locator('#svg [data-personal-image^="clipboard-"]').count(),0,'New Drawing did not clear pasted image');
  await page.locator('#file').setInputFiles(clipboardPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Project opened.'));
  assert.equal(await page.locator('#svg [data-personal-image^="clipboard-"]').count(),1,'Reopened project lost pasted image');
  assert.ok((await page.locator('#svg #annotations').textContent()).includes('PASTED CLIPBOARD NOTE'),'Reopened project lost pasted text');
  await page.locator('[data-drawing-tab="plan"]').click();
  assert.equal(await page.locator('#svg [data-personal-image^="clipboard-"]').count(),0,'Reopened image leaked into Plan View');
  await page.locator('[data-drawing-tab="one"]').click();
  await page.locator('#svg [data-personal-image^="clipboard-"] rect').first().click({force:true});
  await page.locator('#imgRemove').click();
  assert.equal(await page.locator('#svg [data-personal-image^="clipboard-"]').count(),0,'Remove from drawing did not delete pasted image');

  checkErrors('clipboard paste and tab isolation');

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

  // Verify the One-Line conductor's middle handle responds to real mouse dragging.
  await page.locator('[data-drawing-tab="one"]').click();
  await page.locator('#library [data-add="panel"]').first().click();
  await page.locator('#library [data-add="panel"]').first().click();
  const conductorNodes = page.locator('#svg [data-node]');
  assert.ok(await conductorNodes.count() >= 2, 'Need two equipment items for conductor drag test');
  await page.locator('#connectMode').click();
  await conductorNodes.nth(0).click();
  await conductorNodes.nth(1).click();
  const wire = page.locator('#svg [data-wire]').last();
  assert.ok(await wire.count(), 'Connect tool did not create a conductor');
  await page.locator('#selectMode').click();
  await wire.locator('path[stroke="transparent"]').first().click({force:true});
  assert.ok(await wire.locator('[data-port-handle]').count() === 2, 'Both endpoint handles must appear');
  checkErrors('One-Line conductor creation and selection');
  // Drag an endpoint with real pointer events and verify its rendered position changes.
  // Keep the conductor selected: clicking its route a second time can initiate a route drag.
  // The endpoint was already verified after the first selection above.
  const endpoint = page.locator('#svg [data-port-handle][data-port-end="from"]').last();
  assert.ok(await endpoint.count(), 'Endpoint handle missing after selecting conductor; visible wire handles: '+await page.locator('#svg [data-port-handle]').count()+'; selected wire markup: '+(await page.locator('#svg [data-wire]').last().getAttribute('data-wire')));
  const beforeX = Number(await endpoint.getAttribute('cx'));
  const beforeY = Number(await endpoint.getAttribute('cy'));
  const endpointBox = await endpoint.boundingBox();
  assert.ok(endpointBox, 'Endpoint has no mouse hit area');
  const ex = endpointBox.x + endpointBox.width/2, ey = endpointBox.y + endpointBox.height/2;
  await page.mouse.move(ex, ey);
  await page.mouse.down();
  await page.mouse.move(ex+18, ey+12, {steps:6});
  await page.mouse.up();
  const movedEndpoint = page.locator('#svg [data-port-handle][data-port-end="from"]').last();
  assert.ok(await movedEndpoint.count(), 'Endpoint vanished after drag; remaining handles: '+await page.locator('#svg [data-port-handle]').count()+'; wire id: '+await page.locator('#svg [data-wire]').last().getAttribute('data-wire'));
  const afterX = Number(await movedEndpoint.getAttribute('cx'));
  const afterY = Number(await movedEndpoint.getAttribute('cy'));
  assert.ok(Math.hypot(afterX-beforeX,afterY-beforeY)>0.5, 'Mouse dragging did not move the conductor endpoint');
  assert.equal(await wire.locator('[data-port-handle]').count(), 2, 'Dragging removed an endpoint handle');
  // Exercise the opposite endpoint as well; it must remain independently draggable.
  const otherEndpoint = page.locator('#svg [data-port-handle][data-port-end="to"]').last();
  assert.ok(await otherEndpoint.count(), 'Opposite conductor endpoint is not selectable');
  const otherBeforeX = Number(await otherEndpoint.getAttribute('cx'));
  const otherBeforeY = Number(await otherEndpoint.getAttribute('cy'));
  const otherBox = await otherEndpoint.boundingBox();
  assert.ok(otherBox, 'Opposite endpoint has no mouse hit area');
  const ox = otherBox.x + otherBox.width / 2, oy = otherBox.y + otherBox.height / 2;
  await page.mouse.move(ox, oy);
  await page.mouse.down();
  await page.mouse.move(ox - 18, oy + 12, {steps:6});
  await page.mouse.up();
  const otherMoved = page.locator('#svg [data-port-handle][data-port-end="to"]').last();
  assert.ok(await otherMoved.count(), 'Opposite endpoint disappeared after dragging');
  const otherAfterX = Number(await otherMoved.getAttribute('cx'));
  const otherAfterY = Number(await otherMoved.getAttribute('cy'));
  assert.ok(Math.hypot(otherAfterX-otherBeforeX, otherAfterY-otherBeforeY)>0.5, 'Opposite endpoint did not move with the mouse');
  assert.equal(await wire.locator('[data-port-handle]').count(), 2, 'Dragging opposite endpoint removed conductor handles');
  checkErrors('One-Line endpoint mouse dragging');
  // Selected conductor route controls must remain available after editing both endpoints.
  // U-shaped routes expose the middle and side grips; automatic/straight routes may not.
  await page.locator('#newConnectionStyle').selectOption('up');
  const routeControls = page.locator('#svg [data-route-handle], #svg [data-wire-side-handle]');
  assert.ok(await routeControls.count() > 0, 'No middle or side routing handles appeared for selected conductor');
  assert.ok(await page.locator('#svg [data-route-handle]').count() > 0, 'U-shaped conductor is missing its middle routing grip');
  assert.equal(await page.locator('#svg [data-wire-side-handle]').count(), 2, 'U-shaped conductor must show a side grip for each endpoint');
  // A click on a visible routing grip must never be stolen by the
  // nearby invisible endpoint hit area.
  const gripHitPriority=await page.evaluate(()=>{
    const grip=document.querySelector('#svg [data-route-handle]');
    if(!grip)return false;
    const rect=grip.getBoundingClientRect();
    const target=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    return !!target?.closest('[data-route-handle]');
  });
  assert.equal(gripHitPriority,true,'Middle routing grip is obscured by another hit target');
  // Side grips must remain independently draggable, with their offsets
  // constrained to the equipment boundary.
  const firstSideGrip=page.locator('#svg [data-wire-side-handle]').first();
  const sideGripBox=await firstSideGrip.boundingBox();
  assert.ok(sideGripBox,'Connect side grip is missing a mouse hit area');
  const sideGripStart={x:sideGripBox.x+sideGripBox.width/2,y:sideGripBox.y+sideGripBox.height/2};
  const sideGripEnd={x:sideGripStart.x+10,y:sideGripStart.y+18};
  await page.mouse.move(sideGripStart.x,sideGripStart.y);
  await page.mouse.down();
  await page.mouse.move(sideGripEnd.x,sideGripEnd.y,{steps:4});
  await page.mouse.up();
  assert.ok(await page.locator('#svg [data-wire-side-handle]').count()===2,
    'Connect side handles disappeared after dragging');
  checkErrors('Connect side handle drag');
  const routeControl = page.locator('#svg [data-route-handle]').first();
  const routeBox = await routeControl.boundingBox();
  assert.ok(routeBox, 'Conductor routing handle has no pointer hit area');
  const rx = routeBox.x + routeBox.width/2, ry = routeBox.y + routeBox.height/2;
  await page.mouse.move(rx,ry);
  await page.mouse.down();
  await page.mouse.move(rx+14,ry+14,{steps:5});
  await page.mouse.up();
  const movedRouteGrip = page.locator('#svg [data-route-handle]').first();
  assert.ok(await movedRouteGrip.count(), 'Middle routing grip disappeared after dragging');
  const movedRouteBox = await movedRouteGrip.boundingBox();
  assert.ok(movedRouteBox, 'Middle routing grip lost its mouse hit area');
  const rmx=movedRouteBox.x+movedRouteBox.width/2, rmy=movedRouteBox.y+movedRouteBox.height/2;
  assert.ok(Math.hypot(rmx-rx,rmy-ry)>0.5,'Middle routing grip did not move with mouse drag');
  assert.equal(await wire.locator('[data-port-handle]').count(),2,'Route adjustment lost conductor selection');
  checkErrors('One-Line conductor route adjustment');
  // Verify each side grip accepts a real mouse drag while retaining the wire selection.
  for (const end of ['from','to']) {
    const sideGrip = page.locator('#svg [data-wire-side-handle][data-wire-side-end="'+end+'"]').last();
    assert.ok(await sideGrip.count(), 'Missing '+end+' U-route side grip');
    const gripBox = await sideGrip.boundingBox();
    assert.ok(gripBox, end+' U-route side grip has no pointer hit area');
    const gx = gripBox.x+gripBox.width/2, gy=gripBox.y+gripBox.height/2;
    await page.mouse.move(gx,gy);
    await page.mouse.down();
    await page.mouse.move(gx+12,gy+12,{steps:5});
    await page.mouse.up();
    const movedSideGrip = page.locator('#svg [data-wire-side-handle][data-wire-side-end="'+end+'"]').last();
    assert.ok(await movedSideGrip.count(), 'Dragging '+end+' U-route side grip removed it');
    const movedSideBox = await movedSideGrip.boundingBox();
    assert.ok(movedSideBox, 'Dragging '+end+' U-route side grip removed its hit area');
    const mx=movedSideBox.x+movedSideBox.width/2, my=movedSideBox.y+movedSideBox.height/2;
    assert.ok(Math.hypot(mx-gx,my-gy)>0.5,'Dragging '+end+' U-route side grip did not change its position');
    assert.equal(await wire.locator('[data-port-handle]').count(),2,'Dragging '+end+' U-route side grip lost conductor selection');
  }
  checkErrors('One-Line U-route side handle mouse dragging');
  // Feeder labels must move independently of the conductor.
  const labelInput = page.locator('#properties [data-prop="label"]').first();
  assert.ok(await labelInput.count(), 'Selected conductor has no feeder label field');
  await labelInput.fill('FEEDER TEST');
  await labelInput.dispatchEvent('input');
  await labelInput.dispatchEvent('change');
  const feederText = page.locator('#svg [data-feeder-text]').last();
  assert.ok(await feederText.count(), 'Feeder label did not render after editing its text');
  const labelBox = await feederText.boundingBox();
  assert.ok(labelBox, 'Feeder label has no mouse hit area');
  const lx=labelBox.x+labelBox.width/2,ly=labelBox.y+labelBox.height/2;
  await page.mouse.move(lx,ly);
  await page.mouse.down();
  await page.mouse.move(lx+22,ly+15,{steps:5});
  await page.mouse.up();
  const movedLabelBox = await feederText.boundingBox();
  assert.ok(movedLabelBox, 'Feeder label disappeared after dragging');
  assert.ok(Math.hypot(movedLabelBox.x-labelBox.x,movedLabelBox.y-labelBox.y)>0.5,'Feeder label did not move independently');
  assert.equal(await wire.locator('[data-port-handle]').count(),2,'Dragging feeder label lost conductor selection');
  checkErrors('One-Line feeder label mouse dragging');
  // Regression: endpoint dragging must remain usable when the drawing is zoomed.
  // The page boundary stays fixed; only the drawing objects are magnified.
  await page.locator('#zoomIn').click();
  assert.notEqual((await page.locator('#zoomPercent').innerText()).trim(), '100%', 'Zoom control did not magnify the drawing');
  const zoomEndpoint = page.locator('#svg [data-port-handle][data-port-end="from"]').last();
  assert.ok(await zoomEndpoint.count(), 'Zooming removed the selected conductor endpoint');
  const zoomBeforeX = Number(await zoomEndpoint.getAttribute('cx'));
  const zoomBeforeY = Number(await zoomEndpoint.getAttribute('cy'));
  const zoomBox = await zoomEndpoint.boundingBox();
  assert.ok(zoomBox, 'Zoomed endpoint has no mouse hit area');
  const zx=zoomBox.x+zoomBox.width/2, zy=zoomBox.y+zoomBox.height/2;
  await page.mouse.move(zx,zy);
  await page.mouse.down();
  await page.mouse.move(zx+16,zy+10,{steps:6});
  await page.mouse.up();
  const zoomMoved = page.locator('#svg [data-port-handle][data-port-end="from"]').last();
  assert.ok(zoomMoved.count(), 'Zoomed endpoint vanished after mouse drag');
  assert.ok(Math.hypot(Number(await zoomMoved.getAttribute('cx'))-zoomBeforeX,Number(await zoomMoved.getAttribute('cy'))-zoomBeforeY)>0.5,
    'Mouse drag did not move endpoint while zoomed');
  assert.equal(await wire.locator('[data-port-handle]').count(),2,'Zoomed drag lost conductor selection');
  await page.locator('#zoomOut').click();
  checkErrors('One-Line endpoint mouse dragging after zoom');

  // Regression: after zooming, panning via the drawing scrollbar must not break
  // pointer hit-testing or conductor endpoint dragging.
  await page.locator('#zoomIn').click();
  const horizontalScroll = page.locator('#drawingScrollX');
  assert.ok(await horizontalScroll.count(), 'Drawing horizontal pan control missing');
  await horizontalScroll.fill('750');
  await horizontalScroll.dispatchEvent('input');
  const pannedEndpoint = page.locator('#svg [data-port-handle][data-port-end="from"]').last();
  assert.ok(await pannedEndpoint.count(), 'Panning removed the conductor endpoint');
  const panBeforeX = Number(await pannedEndpoint.getAttribute('cx'));
  const panBeforeY = Number(await pannedEndpoint.getAttribute('cy'));
  const panBox = await pannedEndpoint.boundingBox();
  assert.ok(panBox, 'Panned endpoint has no mouse hit area');
  const px=panBox.x+panBox.width/2, py=panBox.y+panBox.height/2;
  await page.mouse.move(px,py);
  await page.mouse.down();
  await page.mouse.move(px+12,py+10,{steps:6});
  await page.mouse.up();
  const panMoved = page.locator('#svg [data-port-handle][data-port-end="from"]').last();
  assert.ok(panMoved.count(), 'Panned endpoint disappeared after dragging');
  assert.ok(Math.hypot(Number(await panMoved.getAttribute('cx'))-panBeforeX,Number(await panMoved.getAttribute('cy'))-panBeforeY)>0.5,
    'Endpoint did not move after panning');
  assert.equal(await wire.locator('[data-port-handle]').count(),2,'Panned drag lost conductor selection');
  await page.locator('#zoomOut').click();
  checkErrors('One-Line endpoint dragging after panning');

  // Regression: moving connected equipment should update the conductor's rendered path.
  // Use the equipment group's pointer hit area rather than a text label.
  const attachedNode = conductorNodes.nth(0);
  const attachedBefore = await attachedNode.getAttribute('transform');
  const wirePathBefore = await wire.locator('path[stroke="transparent"]').first().getAttribute('d');
  const nodeBox = await attachedNode.boundingBox();
  assert.ok(nodeBox, 'Connected equipment has no pointer hit area');
  const nx=nodeBox.x+nodeBox.width/2, ny=nodeBox.y+nodeBox.height/2;
  await page.mouse.move(nx,ny);
  await page.mouse.down();
  await page.mouse.move(nx+32,ny+24,{steps:8});
  await page.mouse.up();
  const attachedAfter = await attachedNode.getAttribute('transform');
  const wirePathAfter = await wire.locator('path[stroke="transparent"]').first().getAttribute('d');
  assert.notEqual(attachedAfter,attachedBefore,'Connected equipment did not move with mouse drag');
  assert.notEqual(wirePathAfter,wirePathBefore,'Conductor route did not follow moved equipment');
  checkErrors('One-Line connected equipment drag');

  // Regression: a selected endpoint can be moved to each of the four faces
  // of its equipment, and remains selectable after each drag.
  const equipmentBox = await conductorNodes.nth(0).boundingBox();
  assert.ok(equipmentBox, 'Equipment boundary unavailable for four-side port test');
  const cx=equipmentBox.x+equipmentBox.width/2,cy=equipmentBox.y+equipmentBox.height/2;
  const faceTargets=[
    {side:'top',x:cx,y:equipmentBox.y+3},
    {side:'right',x:equipmentBox.x+equipmentBox.width-3,y:cy},
    {side:'bottom',x:cx,y:equipmentBox.y+equipmentBox.height-3},
    {side:'left',x:equipmentBox.x+3,y:cy}
  ];
  for (const target of faceTargets) {
    const port = page.locator('#svg [data-port-handle][data-port-end="from"]').last();
    const before = await port.boundingBox();
    assert.ok(before,'Port handle unavailable before '+target.side+' drag');
    await page.mouse.move(before.x+before.width/2,before.y+before.height/2);
    await page.mouse.down();
    await page.mouse.move(target.x,target.y,{steps:10});
    await page.mouse.up();
    const after = page.locator('#svg [data-port-handle][data-port-end="from"]').last();
    const afterBox = await after.boundingBox();
    assert.ok(afterBox,'Port handle disappeared on '+target.side+' face');
    assert.ok(Math.hypot(afterBox.x+afterBox.width/2-target.x,afterBox.y+afterBox.height/2-target.y)<22,
      'Port handle did not reach the '+target.side+' equipment face');
    assert.equal(await wire.locator('[data-port-handle]').count(),2,
      'Conductor selection lost after moving port to '+target.side);
  }
  checkErrors('One-Line conductor attachment on all equipment faces');

  // Regression: moving the middle U-route grip must not change either
  // equipment attachment point. Read actual rendered endpoint coordinates.
  await page.locator('#newConnectionStyle').selectOption('up');
  const attachment = async end => {
    const p=page.locator('#svg [data-port-handle][data-port-end="'+end+'"]').last();
    assert.ok(await p.count(), 'Missing '+end+' endpoint before route adjustment');
    return {x:Number(await p.getAttribute('cx')),y:Number(await p.getAttribute('cy'))};
  };
  const fixedFrom=await attachment('from'),fixedTo=await attachment('to');
  const middle=page.locator('#svg [data-route-handle]').first();
  assert.ok(await middle.count(),'Missing middle U-route grip');
  const middleBefore=await middle.boundingBox();
  assert.ok(middleBefore,'Middle grip has no mouse hit area');
  const mx0=middleBefore.x+middleBefore.width/2,my0=middleBefore.y+middleBefore.height/2;
  await page.mouse.move(mx0,my0);
  await page.mouse.down();
  await page.mouse.move(mx0+18,my0-16,{steps:8});
  await page.mouse.up();
  const middleAfter=await page.locator('#svg [data-route-handle]').first().boundingBox();
  assert.ok(middleAfter,'Middle grip vanished after drag');
  assert.ok(Math.hypot(middleAfter.x+middleAfter.width/2-mx0,middleAfter.y+middleAfter.height/2-my0)>0.5,
    'Middle U-route grip did not move');
  for(const [end,expected] of [['from',fixedFrom],['to',fixedTo]]){
    const actual=await attachment(end);
    assert.ok(Math.hypot(actual.x-expected.x,actual.y-expected.y)<0.01,
      'Moving the middle U-route grip changed the '+end+' attachment');
  }
  checkErrors('One-Line middle routing grip preserves attachments');

  // Regression: a conductor must remain selectable even when another
  // conductor occupies the same route. Select the uppermost hit path, then
  // verify that the chosen wire receives its own endpoint handles.
  await page.locator('#connectMode').click();
  await conductorNodes.nth(0).click();
  await conductorNodes.nth(1).click();
  await page.locator('#selectMode').click();
  const allWires=page.locator('#svg [data-wire]');
  assert.ok(await allWires.count()>=2,'Overlapping conductor setup did not create a second wire');
  const topWire=allWires.last();
  const topWireId=await topWire.getAttribute('data-wire');
  const topHit=topWire.locator('path[stroke="transparent"]').first();
  assert.ok(await topHit.count(),'Overlapping wire lacks selectable hit path');
  await topHit.click({force:true});
  assert.equal(await page.locator('#svg [data-wire="'+topWireId+'"] [data-port-handle]').count(),2,
    'Upper overlapping conductor could not be selected independently');
  checkErrors('One-Line overlapping conductor selection');

  // Regression: the feeder label remains independently draggable at a
  // magnified and panned viewport position, without shifting its wire.
  await page.locator('#zoomIn').click();
  await page.locator('#drawingScrollX').fill('650');
  await page.locator('#drawingScrollX').dispatchEvent('input');
  const zoomedFeeder = page.locator('#svg [data-feeder-text]').last();
  assert.ok(await zoomedFeeder.count(),'Feeder label missing after zoom and pan');
  const feederBefore=await zoomedFeeder.boundingBox();
  assert.ok(feederBefore,'Zoomed feeder label has no hit area');
  const feederWireBefore=await wire.locator('path[stroke="transparent"]').first().getAttribute('d');
  const fx=feederBefore.x+feederBefore.width/2,fy=feederBefore.y+feederBefore.height/2;
  await page.mouse.move(fx,fy);
  await page.mouse.down();
  await page.mouse.move(fx+20,fy+12,{steps:8});
  await page.mouse.up();
  const feederAfter=await page.locator('#svg [data-feeder-text]').last().boundingBox();
  assert.ok(feederAfter,'Feeder label disappeared after zoomed drag');
  assert.ok(Math.hypot(feederAfter.x-feederBefore.x,feederAfter.y-feederBefore.y)>0.5,
    'Feeder label did not move after zoom and pan');
  assert.equal(await wire.locator('path[stroke="transparent"]').first().getAttribute('d'),feederWireBefore,
    'Dragging feeder label changed the conductor route');
  await page.locator('#zoomOut').click();
  checkErrors('One-Line feeder label drag after zoom and pan');

  // Regression: exported JSON must retain the edited conductor endpoints,
  // routing and feeder label, and importing it must restore them.
  // Save is inside the collapsed Print / Save menu; reveal it before clicking.
  await page.locator('#printToggle').click();
  await page.locator('#save').waitFor({state:'visible'});
  const [projectDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#save').click()
  ]);
  const projectPath = await projectDownload.path();
  assert.ok(projectPath,'Save Project did not produce a downloadable file');
  const savedProject = JSON.parse(require('fs').readFileSync(projectPath,'utf8'));
  assert.equal(savedProject.format,'LoadCalcProX-OneLine','Unexpected project file format');
  const savedWires = savedProject.drawingViews?.one?.wires || savedProject.wires;
  assert.ok(savedWires.length>=2,'Saved project omitted conductors');
  const savedEditedWire = savedWires.find(w=>String(w.id)===String(topWireId));
  assert.ok(savedEditedWire,'Saved project omitted the overlapping conductor');
  const savedLabelWire = savedWires.find(w=>w.label==='FEEDER TEST');
  assert.ok(savedLabelWire,'Saved project omitted the edited feeder label');
  assert.ok(savedLabelWire.fromSide || savedLabelWire.toSide,
    'Saved project omitted the conductor attachment edits');
  const savedAttachment = {
    fromSide:savedLabelWire.fromSide, toSide:savedLabelWire.toSide,
    fromOffset:savedLabelWire.fromOffset, toOffset:savedLabelWire.toOffset,
    routeStyle:savedLabelWire.routeStyle,
    routeOffset:savedLabelWire.routeOffset,
    label:savedLabelWire.label,
    labelX:savedLabelWire.labelX, labelY:savedLabelWire.labelY
  };
  // Import is asynchronous: wait for its completion status, not merely for
  // existing wires (which were already present before importing).
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#new').click();
  assert.equal(await page.locator('#svg [data-wire]').count(),0,
    'New Drawing did not clear conductors before reopening saved project');
  await page.locator('#file').setInputFiles(projectPath);
  await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Project opened.'));
  await page.waitForFunction(() => document.querySelectorAll('#svg [data-wire]').length >= 2);
  const reopenedLabel = page.locator('#svg [data-feeder-text]').filter({hasText:'FEEDER TEST'});
  assert.ok(await reopenedLabel.count(),'Opening project did not restore feeder label');
  // A visible label alone does not prove the conductor's edited geometry survived.
  // Save again after import and compare the serialized attachment/route fields.
  const [reopenedDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#save').click()
  ]);
  const reopenedPath=await reopenedDownload.path();
  const reopenedProject=JSON.parse(fs.readFileSync(reopenedPath,'utf8'));
  const reopenedWires=reopenedProject.drawingViews?.one?.wires || reopenedProject.wires;
  const reopenedEdited=reopenedWires.find(w=>String(w.id)===String(savedLabelWire.id));
  assert.ok(reopenedEdited,'Reopened project lost edited conductor ID');
  for(const [key,expected] of Object.entries(savedAttachment)){
    assert.deepEqual(reopenedEdited[key],expected,'Reopened conductor changed '+key);
  }
  assert.ok(await page.locator('#svg [data-wire="'+topWireId+'"]').count(),
    'Opening project did not restore the second conductor');
  checkErrors('One-Line project export and reopen');

  // Deselect and reselect the connection to catch hit-testing regressions.
  await conductorNodes.nth(0).click();
  assert.equal(await wire.locator('[data-port-handle]').count(),0,'Conductor handles stayed active after selecting equipment');
  // Re-import clears selection and rebuilds SVG nodes. Select the restored
  // edited conductor by its saved ID rather than relying on an old .last() locator.
  const restoredWire = page.locator('#svg [data-wire="'+savedLabelWire.id+'"]');
  assert.equal(await restoredWire.count(),1,'Edited conductor missing after reopen');
  await restoredWire.locator('path[stroke="transparent"]').first().click({force:true});
  assert.equal(await restoredWire.locator('[data-port-handle]').count(),2,
    'Could not reselect the restored conductor after selecting equipment');
  assert.ok(await page.locator('#svg [data-route-handle]').count()>0,
    'Reselected restored U-route lost its middle handle');
  checkErrors('One-Line conductor re-selection');

  // Conductor right-click editing: duplicate must retain endpoint IDs,
  // and removing the duplicate must leave the original feeder intact.
  const wireCountBefore=await page.locator('#svg [data-wire]').count();
  await restoredWire.locator('path[stroke="transparent"]').first().click({button:'right',force:true});
  assert.equal(await page.locator('#drawingObjectMenu button').count(),5,'Conductor context menu did not open');
  await page.locator('#drawingObjectMenu button', {hasText:'Duplicate'}).click();
  assert.equal(await page.locator('#svg [data-wire]').count(),wireCountBefore+1,'Conductor Duplicate did not create a feeder');
  const duplicatedWire=page.locator('#svg [data-wire]').last();
  await duplicatedWire.locator('path[stroke="transparent"]').first().click({button:'right',force:true});
  await page.locator('#drawingObjectMenu button', {hasText:'Delete'}).click();
  assert.equal(await page.locator('#svg [data-wire]').count(),wireCountBefore,'Deleting duplicated conductor changed original conductor count');
  assert.equal(await restoredWire.count(),1,'Original conductor was removed with its duplicate');
  checkErrors('Conductor context menu duplicate and delete');

  // A new user should be able to right-click an existing feeder directly,
  // even if Connect is still active; unfinished connection state must clear.
  await page.evaluate(()=>{mode='connect';start=nodes[0]?.id??null;connectStartSide={side:'right',offset:0};});
  await restoredWire.locator('path[stroke="transparent"]').first().click({button:'right',force:true});
  assert.equal(await page.evaluate(()=>mode),'select','Right-click did not switch back to Select');
  assert.equal(await page.evaluate(()=>start),null,'Right-click left a pending Connect start');
  assert.equal(await page.evaluate(()=>connectStartSide),null,'Right-click left a pending Connect port');
  assert.equal(await page.locator('#drawingObjectMenu button').count(),5,'Right-click editing failed while Connect was active');
  await page.keyboard.press('Escape');
  checkErrors('Right-click editing from Connect mode');

  // A simple line should support the same right-click actions as equipment.
  // Use the existing One-Line sheet to avoid introducing another toolbar workflow.
  const sampleLineId=await page.evaluate(()=>{
    const id=next++;
    drawnLines.push({id,x1:190,y1:180,x2:340,y2:180,color:'#222222',width:2});
    mode='select';render();
    return id;
  });
  const sampleLine=page.locator('#svg [data-drawn-line="'+sampleLineId+'"]');
  await sampleLine.locator('path[stroke="transparent"]').first().click({button:'right',force:true});
  assert.equal(await page.evaluate(()=>selected?.kind),'line','Right-click did not select the drawing line');
  assert.equal(await page.locator('#drawingObjectMenu button').count(),5,'Line context menu is incomplete');
  await page.locator('#drawingObjectMenu button', {hasText:'Duplicate'}).click();
  const duplicateLineId=await page.evaluate(()=>selected?.id);
  assert.notEqual(duplicateLineId,sampleLineId,'Line duplicate reused the original ID');
  const linePositions=await page.evaluate(ids=>ids.map(id=>{
    const line=drawnLines.find(v=>v.id===id);
    return {x1:line.x1,y1:line.y1,x2:line.x2,y2:line.y2};
  }),[sampleLineId,duplicateLineId]);
  assert.equal(linePositions[1].x1-linePositions[0].x1,24,'Line duplicate was not offset horizontally');
  assert.equal(linePositions[1].y1-linePositions[0].y1,24,'Line duplicate was not offset vertically');
  const duplicateLine=page.locator('#svg [data-drawn-line="'+duplicateLineId+'"]');
  await duplicateLine.locator('path[stroke="transparent"]').first().click({button:'right',force:true});
  await page.locator('#drawingObjectMenu button', {hasText:'Delete'}).click();
  assert.equal(await sampleLine.count(),1,'Deleting duplicate removed original drawing line');
  assert.equal(await duplicateLine.count(),0,'Deleting duplicate did not remove its line');
  await page.evaluate(id=>{drawnLines=drawnLines.filter(v=>v.id!==id);selected=null;selectedLineIds.clear();render();},sampleLineId);
  checkErrors('Line right-click duplicate and delete');

  // Right-click must not leave an unrelated line in the multi-selection.
  await page.evaluate(id=>{
    selectedLineIds.add(id);
    selectedNodeIds.add(nodes[0].id);
    render();
  },sampleLineId);
  await restoredWire.locator('path[stroke="transparent"]').first().click({button:'right',force:true});
  assert.deepEqual(await page.evaluate(()=>[selectedLineIds.size,selectedNodeIds.size]),[0,0],
    'Right-click on a conductor left stale line or equipment multi-selection');
  await page.keyboard.press('Escape');
  checkErrors('Right-click clears unrelated multi-selection');

  // Keyboard Delete should remove a selected line but never delete while typing.
  const keyboardLineId=await page.evaluate(()=>{
    const id=next++;drawnLines.push({id,x1:180,y1:240,x2:330,y2:240,width:2});
    selected={kind:'line',id};selectedLineIds.clear();selectedLineIds.add(id);render();
    return id;
  });
  await page.locator('#status').click({force:true});
  await page.keyboard.press('Delete');
  assert.equal(await page.locator('#svg [data-drawn-line="'+keyboardLineId+'"]').count(),0,'Delete key did not remove selected line');
  checkErrors('Keyboard Delete on drawing object');




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
