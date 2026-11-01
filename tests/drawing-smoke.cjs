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

  // Laptop layout and equipment-library accordion regression.
  const categories=page.locator('#library > details.equipment-category');
  assert.ok(await categories.count()>=4,'Equipment categories were not rendered');
  const service=page.locator('#library > details.equipment-category').filter({has:page.locator('summary:text-is("Service & Distribution")')});
  const grounding=page.locator('#library > details.equipment-category').filter({has:page.locator('summary:text-is("Grounding & Bonding")')});
  assert.equal(await service.count(),1,'Service category missing');
  assert.equal(await grounding.count(),1,'Grounding category missing');
  assert.equal(await service.getAttribute('open'),'','Service should start expanded');
  await grounding.locator('summary').click();
  assert.equal(await grounding.getAttribute('open'),'','Grounding should expand');
  await page.waitForFunction(()=>!document.querySelector('#library > details.equipment-category[open] summary')?.textContent?.includes('Service & Distribution'),null,{timeout:3000});
  assert.equal(await service.getAttribute('open'),null,'Opening grounding should collapse service');
  for(const type of ['ground','groundterminal','neutralterminal','electrode'])
    assert.equal(await grounding.locator('[data-add="'+type+'"]').count(),1,'Grounding item missing: '+type);
  await grounding.locator('summary').click();
  assert.equal(await grounding.getAttribute('open'),null,'Clicking expanded category should close it');
  await service.locator('summary').click();
  for(const width of [1366,1280]){
    await page.setViewportSize({width,height:768});
    const layout=await page.evaluate(()=>{
      const main=document.querySelector('main');
      const sections=[...main.children].slice(0,3);
      const rects=sections.map(e=>e.getBoundingClientRect());
      return {columns:getComputedStyle(main).gridTemplateColumns.split(' ').length,
        sideBySide:rects[0].right<=rects[1].left && rects[1].right<=rects[2].left,
        scrollable:sections[0].scrollHeight>=sections[0].clientHeight,
        widths:rects.map(r=>r.width)};
    });
    assert.ok(layout.columns>=3 && layout.sideBySide,'Laptop three-column layout failed at '+width+'px: '+JSON.stringify(layout));
    assert.ok(layout.widths[1]>layout.widths[0] && layout.widths[1]>layout.widths[2],
      'Drawing must be wider than side panels at '+width+'px');
  }
  // Scrolling the drawing must not scroll either side panel out of place.
  await page.setViewportSize({width:1366,height:768});
  const scrollLayout=await page.evaluate(()=>{
    const main=document.querySelector('main');
    const left=main.children[0],center=main.children[1],right=main.children[2];
    const toolbar=document.getElementById('drawingStickyToolbar');
    const before=[left,right].map(el=>el.getBoundingClientRect().top);
    center.scrollTop=Math.max(0,center.scrollHeight-center.clientHeight);
    const after=[left,right].map(el=>el.getBoundingClientRect().top);
    const toolbarRect=toolbar.getBoundingClientRect(),centerRect=center.getBoundingClientRect();
    return {fixedPanels:before.every((top,i)=>Math.abs(top-after[i])<2),
      stickyToolbar:toolbarRect.top>=centerRect.top-2&&toolbarRect.top<centerRect.bottom,
      panelOverflow:[left,right].map(el=>getComputedStyle(el).overflowY)};
  });
  assert.ok(scrollLayout.fixedPanels,'Side panels moved while drawing scrolled');
  assert.ok(scrollLayout.stickyToolbar,'Drawing toolbar left visible center workspace');
  assert.ok(scrollLayout.panelOverflow.every(v=>v==='auto'),'Side panels must scroll internally');
  await page.setViewportSize({width:1440,height:900});
  console.log('PASS: laptop three-panel layout and exclusive grounding accordion');
  checkErrors('laptop layout and library accordion');

  // Audit every equipment type at multiple reduced sizes.
  const typesToAudit = await page.locator('#library [data-add]').evaluateAll(
    elements => [...new Set(elements.map(el => el.dataset.add))].filter(Boolean));
  for (const type of typesToAudit) {
    for (const percent of [100, 75, 50, 25]) {
      const result = await page.evaluate(({type,percent}) => {
        const previousCount=nodes.length;
        document.getElementById('newEquipmentSize').value=String(percent);
        add(type,500,350);
        const item=nodes[nodes.length-1];
        const symbol=document.querySelector('#svg [data-node="'+item.id+'"] .equipment-symbol');
        const box=symbol?.getBoundingClientRect();
        const output={visible:!!box&&box.width>0&&box.height>0,
          sx:item.scaleX,sy:item.scaleY};
        nodes.splice(previousCount);
        selected=null;
        render();
        return output;
      }, {type,percent});
      assert.ok(result.visible, 'Equipment missing at '+percent+'%: '+type);
      assert.ok(Math.abs(result.sx-percent/100)<0.001,
        'Incorrect horizontal scale for '+type+' at '+percent+'%');
      assert.ok(Math.abs(result.sy-percent/100)<0.001,
        'Incorrect vertical scale for '+type+' at '+percent+'%');
    }
  }
  console.log('PASS: equipment scaling audit across '+typesToAudit.length+' types');
  checkErrors('equipment scaling audit');

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
  const sideGripBefore=await page.evaluate(()=>{
    const id=Number(document.querySelector('#svg [data-wire-side-handle]').dataset.wireSideHandle);
    const end=document.querySelector('#svg [data-wire-side-handle]').dataset.wireSideEnd;
    const wire=wires.find(w=>w.id===id);
    return {id,end,offset:Number(wire[end==='from'?'fromOffset':'toOffset'])||0};
  });
  await page.mouse.move(sideGripStart.x,sideGripStart.y);
  await page.mouse.down();
  await page.mouse.move(sideGripEnd.x,sideGripEnd.y,{steps:4});
  await page.mouse.up();
  assert.ok(await page.locator('#svg [data-wire-side-handle]').count()===2,
    'Connect side handles disappeared after dragging');
  const sideGripAfter=await page.evaluate(({id,end})=>{
    const wire=wires.find(w=>w.id===id);
    return Number(wire[end==='from'?'fromOffset':'toOffset'])||0;
  },sideGripBefore);
  assert.ok(Number.isFinite(sideGripAfter)&&Math.abs(sideGripAfter)<=.95,'Side grip produced an invalid endpoint offset');
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
  await page.evaluate(()=>document.activeElement?.blur());
  await page.keyboard.press('Delete');
  assert.equal(await page.locator('#svg [data-drawn-line="'+keyboardLineId+'"]').count(),0,'Delete key did not remove selected line');
  checkErrors('Keyboard Delete on drawing object');




  // Save/Open must retain appearance metadata across all four drawing object families.
  const appearanceIds=await page.evaluate(()=>{
    const id=()=>next++;
    const node={id:id(),type:'panel',x:180,y:140,installationStatus:'existing',strokePattern:'dotted'};
    const destination={id:id(),type:'disconnect',x:360,y:140};
    const wire={id:id(),from:node.id,to:destination.id,installationStatus:'remove',strokePattern:'dashdot'};
    const line={id:id(),x1:100,y1:100,x2:240,y2:100,installationStatus:'existing',strokePattern:'dashed'};
    const poly={id:id(),points:[{x:100,y:180},{x:240,y:180}],installationStatus:'remove',strokePattern:'dotted'};
    nodes.push(node,destination);wires.push(wire);drawnLines.push(line);polyRoutes.push(poly);render();
    return {node:node.id,wire:wire.id,line:line.id,poly:poly.id};
  });
  const [appearanceDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#save').click()]);
  const appearancePath=await appearanceDownload.path();
  const appearanceProject=JSON.parse(fs.readFileSync(appearancePath,'utf8'));
  const savedState=appearanceProject.drawingViews?.[appearanceProject.activeDrawingView||'one']||appearanceProject;
  for(const [kind,key,status,pattern] of [
    ['node','nodes','existing','dotted'],['wire','wires','remove','dashdot'],
    ['line','drawnLines','existing','dashed'],['poly','polyRoutes','remove','dotted']
  ]){
    const saved=savedState[key].find(item=>item.id===appearanceIds[kind]);
    assert.equal(saved?.installationStatus,status,kind+' status missing from saved project');
    assert.equal(saved?.strokePattern,pattern,kind+' pattern missing from saved project');
  }
  await page.locator('#file').setInputFiles(appearancePath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Project opened.'));
  const reopened=await page.evaluate(ids=>Object.fromEntries([
    ['node',nodes],['wire',wires],['line',drawnLines],['poly',polyRoutes]
  ].map(([key,items])=>[key,items.find(item=>item.id===ids[key])])),appearanceIds);
  for(const [kind,status,pattern] of [
    ['node','existing','dotted'],['wire','remove','dashdot'],
    ['line','existing','dashed'],['poly','remove','dotted']
  ]){
    assert.equal(reopened[kind]?.installationStatus,status,kind+' status lost on reopening');
    assert.equal(reopened[kind]?.strokePattern,pattern,kind+' pattern lost on reopening');
  }
  checkErrors('Appearance metadata Save/Open round trip');

  // Verify the actual SVG carries the saved appearance into print output.
  const svgAppearance=await page.evaluate(ids=>{
    const node=document.querySelector('#svg [data-node="'+ids.node+'"]');
    const line=document.querySelector('#svg [data-drawn-line="'+ids.line+'"]');
    const equipmentOutline=node?.querySelector('[stroke-dasharray="1 5"]');
    const lineOutline=line?.querySelector('path[stroke-dasharray="6 4"]');
    return {nodePresent:!!node,nodeDotted:!!equipmentOutline,
      linePresent:!!line,lineDashed:!!lineOutline,
      lineGray:lineOutline?.getAttribute('stroke')};
  },appearanceIds);
  assert(svgAppearance.nodePresent&&svgAppearance.nodeDotted,
    'Existing equipment dotted outline missing from SVG');
  assert(svgAppearance.linePresent&&svgAppearance.lineDashed,
    'Existing drawn line dashed pattern missing from SVG');
  assert.equal(svgAppearance.lineGray,'#929aa3',
    'Existing drawn line not rendered in status gray');
  checkErrors('Printable SVG appearance');

  // Print preparation must preserve drawing appearance and restore the grid afterward.
  await page.evaluate(()=>{window.__printCalls=0;window.print=()=>{window.__printCalls++;};});
  if(!(await page.locator('#print').isVisible()))await page.locator('#printToggle').click();
  await page.locator('#print').waitFor({state:'visible'});
  const beforePrint=await page.evaluate(()=>({
    grid:document.querySelector('#gridBackground').getAttribute('fill'),
    svg:document.querySelector('#svg').innerHTML
  }));
  await page.locator('#print').click();
  const afterPrint=await page.evaluate(()=>({
    calls:window.__printCalls,
    grid:document.querySelector('#gridBackground').getAttribute('fill'),
    css:document.querySelector('#drawingPrintPageSize')?.textContent||'',
    svg:document.querySelector('#svg').innerHTML
  }));
  assert.equal(afterPrint.calls,1,'Print command was not invoked');
  assert.equal(afterPrint.grid,beforePrint.grid,'Print did not restore grid background');
  assert(afterPrint.css.includes('@media print')&&afterPrint.css.includes('@page'),
    'Print stylesheet did not define page size');
  assert.equal(afterPrint.svg,beforePrint.svg,'Print changed drawing geometry or styling');
  checkErrors('Print preparation and grid restoration');
  // A failed print dialog must not leave the editor's grid background white.
  const failedPrint=await page.evaluate(()=>{
    const grid=document.querySelector('#gridBackground');
    const before=grid.getAttribute('fill');
    window.print=()=>{throw new Error('Simulated print failure')};
    let threw=false;
    try{document.querySelector('#print').click()}catch(e){threw=true}
    const after=grid.getAttribute('fill');
    window.print=()=>{window.__printCalls++};
    return {before,after,threw};
  });
  assert.equal(failedPrint.after,failedPrint.before,
    'Failed print left the drawing background modified');


  // Installation status and line patterns must remain independent and persist in the drawing model.
  const appearance=await page.evaluate(()=>{
    const cases=['solid','dashed','dotted','dashdot'].map(pattern=>{
      const item={strokePattern:pattern,installationStatus:'existing'};
      return {pattern,dash:drawingDashPattern(item),ink:installationStroke(item,'#111111')};
    });
    const legacy=drawingDashPattern({dashed:true});
    const newInk=installationStroke({installationStatus:'new'},'#123456');
    return {cases,legacy,newInk};
  });
  assert.deepEqual(appearance.cases.map(v=>v.dash),['','6 4','1 5','10 4 2 4']);
  assert(appearance.cases.every(v=>v.ink==='#929aa3'),'Existing line status did not override stroke');
  assert.equal(appearance.legacy,'6 4','Legacy dashed drawings lost their pattern');
  assert.equal(appearance.newInk,'#123456','New line status changed user-selected colors');
  checkErrors('Line patterns and installation status');

  // New-line Properties must expose settings before drawing, and new
  // segments must inherit those settings instead of resetting to defaults.
  await page.evaluate(()=>{mode='line';selected=null;render();});
  await page.locator('#newLineArrow').selectOption('both');
  await page.locator('#newLineWeight').fill('3');
  await page.locator('#newLineWeight').dispatchEvent('change');
  await page.locator('#newLinePattern').selectOption('dashed');
  const newLineDefaults=await page.evaluate(()=>({
    arrow:newDrawingLineArrow,weight:newDrawingLineWeight,pattern:newDrawingLinePattern
  }));
  assert.deepEqual(newLineDefaults,{arrow:'both',weight:3,pattern:'dashed'},
    'Add Line Properties did not save pre-drawing settings');
  await page.evaluate(()=>{mode='select';selected=null;render();});
  checkErrors('Pre-drawing line defaults');

  // Regression: drawing-line arrow selections must survive Properties rerender.
  const arrowLineId=await page.evaluate(()=>{
    const id=next++;
    drawnLines.push({id,x1:230,y1:280,x2:410,y2:280,color:'#222222',width:2});
    selected={kind:'line',id};selectedLineIds.clear();selectedLineIds.add(id);render();
    return id;
  });
  // The line label must be moved only relative to direct Properties children.
  // Previously a nested label was passed to insertBefore, crashing the editor.
  const lineLabelField=page.locator('#properties > label.field:has([data-line-prop="label"])');
  assert.equal(await lineLabelField.count(),1,
    'Drawing-line label was not placed as a direct Properties field');
  assert.equal(await page.locator('#properties [data-line-prop="arrow"]').count(),1,
    'Drawing-line Properties did not initialize after label reordering');
  checkErrors('Drawing-line Properties startup and label ordering');
  await page.locator('#properties [data-line-prop="arrow"]').selectOption('both');
  assert.equal(await page.evaluate(id=>drawnLines.find(l=>l.id===id)?.arrow,arrowLineId),'both',
    'Line arrow selection was not saved');
  await page.evaluate(()=>render());
  assert.equal(await page.locator('#properties [data-line-prop="arrow"]').inputValue(),'both',
    'Line arrow selection reverted after Properties rerender');
  const arrows=page.locator('#svg [data-drawn-line="'+arrowLineId+'"] [data-line-arrow]');
  assert.equal(await arrows.count(),2,'Both ends must render two actual arrowheads');
  assert.equal(await arrows.nth(0).getAttribute('data-line-arrow'),'start');
  assert.equal(await arrows.nth(1).getAttribute('data-line-arrow'),'end');
  // Vertical lines must render arrowheads too; a horizontal-only test missed
  // the reported failure.
  await page.evaluate(id=>{const l=drawnLines.find(x=>x.id===id);l.x2=l.x1;l.y2=l.y1+300;render();},arrowLineId);
  assert.equal(await arrows.count(),2,'Vertical line lost one or both arrowheads');
  for(const end of ['start','end']){
    const arrow=page.locator('#svg [data-drawn-line="'+arrowLineId+'"] [data-line-arrow="'+end+'"]');
    assert((await arrow.getAttribute('d'))?.includes(' Z'),'Vertical arrowhead is not a closed shape');
    assert.notEqual(await arrow.getAttribute('fill'),'none','Vertical arrowhead is not filled');
  }
  checkErrors('Drawing-line arrow persistence');
  // Exercise a second Properties rebuild and switching between selected
  // object kinds; this used to expose invalid insertBefore references.
  await page.evaluate(id=>{
    selected={kind:'line',id};render();
    selected=null;render();
    selected={kind:'line',id};render();
  },arrowLineId);
  assert.equal(await page.locator('#properties [data-line-prop="arrow"]').inputValue(),'both',
    'Line arrow selection was lost after clearing and restoring selection');
  checkErrors('Drawing-line Properties selection transitions');


  // Polyline regression: shared pre-draw settings, selected Properties, and
  // finishing via double-click must not create an extra point.
  await page.locator('#polyMode').click();
  assert.equal(await page.locator('#newLineWeight').count(),1,
    'Polyline thickness is missing before drawing');
  assert.equal(await page.locator('#newLinePattern').count(),1,
    'Polyline pattern is missing before drawing');
  await page.locator('#newLineWeight').fill('2.4');
  await page.locator('#newLineWeight').dispatchEvent('change');
  await page.locator('#newLinePattern').selectOption('dotted');
  const polyId=await page.evaluate(()=>{
    const id=next++;
    polyRoutes.push({id,kind:'polyline',points:[{x:160,y:150},{x:260,y:150},{x:260,y:250}],
      colors:['#111111'],spacing:8,lineStyle:'custom',lineWeight:newDrawingLineWeight,
      width:newDrawingLineWeight,strokePattern:newDrawingLinePattern});
    selected={kind:'polyroute',id};mode='select';render();
    return id;
  });
  assert.equal(await page.locator('#properties #polyLabel').count(),1,
    'Polyline Properties did not render after selection');
  assert.equal(await page.locator('#properties #polyThickness').count(),0,
    'Duplicate Polyline thickness field returned');
  assert.equal(await page.locator('#properties [data-weight-value]').count(),1,
    'Shared Polyline line-weight field is missing');
  assert.equal(await page.locator('#properties #polySpacing').count(),0,
    'Single-conductor Polyline must not show spacing');
  assert.equal(await page.evaluate(id=>polyRoutes.find(p=>p.id===id)?.lineWeight,polyId),2.4);
  assert.equal(await page.evaluate(id=>polyRoutes.find(p=>p.id===id)?.strokePattern,polyId),'dotted');
  await page.evaluate(id=>{
    const p=polyRoutes.find(p=>p.id===id);
    p.colors.push('#ff0000');selected={kind:'polyroute',id};render();
  },polyId);
  assert.equal(await page.locator('#properties #polySpacing').count(),1,
    'Multi-conductor Polyline must show spacing');
  checkErrors('Polyline Properties consistency');

  // Connect routing regression: Automatic must produce a single straight
  // segment for vertically or horizontally aligned equipment, not a 90 bend.
  const connectPaths=await page.evaluate(()=>{
    const upper={id:-11,type:'panel',x:400,y:200,scaleX:1,scaleY:1};
    const lower={id:-12,type:'panel',x:400,y:500,scaleX:1,scaleY:1};
    const left={id:-13,type:'panel',x:180,y:350,scaleX:1,scaleY:1};
    const right={id:-14,type:'panel',x:650,y:350,scaleX:1,scaleY:1};
    return {
      vertical:feederPath(upper,lower,{routeStyle:'auto',fromSide:'bottom',toSide:'top'}),
      horizontal:feederPath(left,right,{routeStyle:'auto',fromSide:'right',toSide:'left'}),
      straight:feederPath(left,right,{routeStyle:'straight',fromSide:'right',toSide:'left'})
    };
  });
  for(const [name,path] of Object.entries(connectPaths)){
    assert.equal(path.handle,null,name+' Connect should not have a bend handle');
    assert.match(path.d,/^M[-\\d.]+ [-\\d.]+L[-\\d.]+ [-\\d.]+$/,
      name+' Connect should consist of one straight segment');
  }
  checkErrors('Connect automatic horizontal and vertical routing');

  // Selected Connect must retain Properties and selection when changing
  // between all routing modes, including after a vertical U-shape.
  const routeWireId=await page.evaluate(()=>{
    const a={id:next++,type:'panel',x:380,y:170,scaleX:1,scaleY:1};
    const b={id:next++,type:'panel',x:380,y:510,scaleX:1,scaleY:1};
    nodes.push(a,b);
    const id=next++;
    wires.push({id,from:a.id,to:b.id,fromSide:'right',toSide:'right',
      routeStyle:'right',routeOffset:550,label:'vertical test'});
    selected={kind:'wire',id};mode='select';render();
    return id;
  });
  for(const style of ['auto','straight','bend','up','down','left','right','auto']){
    await page.locator('#properties [data-route-style]').selectOption(style);
    assert.deepEqual(await page.evaluate(id=>selected&&{kind:selected.kind,id:selected.id},routeWireId),
      {kind:'wire',id:routeWireId},'Connect selection disappeared after '+style);
    assert.equal(await page.locator('#properties [data-route-style]').count(),1,
      'Connect routing Properties disappeared after '+style);
    assert.equal(await page.evaluate(id=>wires.find(w=>w.id===id)?.routeStyle,routeWireId),style);
    checkErrors('Connect routing transition '+style);
  }
  // After cycling through U and bend modes, Automatic must restore a single
  // vertical segment and must not expose the unwanted middle bend handle.
  const restoredAuto=await page.evaluate(id=>{
    const w=wires.find(w=>w.id===id);
    const a=nodes.find(n=>n.id===w.from),b=nodes.find(n=>n.id===w.to);
    return {path:feederPath(a,b,w),fromSide:w.fromSide,toSide:w.toSide};
  },routeWireId);
  assert.equal(restoredAuto.fromSide,'bottom');
  assert.equal(restoredAuto.toSide,'top');
  assert.equal(restoredAuto.path.handle,null,'Restored vertical Automatic route has an unwanted bend handle');
  assert.match(restoredAuto.path.d,/^M-?[0-9.]+ -?[0-9.]+L-?[0-9.]+ -?[0-9.]+$/,
    'Restored vertical Automatic route is not a single segment');
  checkErrors('Connect Automatic after U-route transitions');

  // Exercise the real Delete key handler, not a direct test-only array edit.
  await page.locator('#svg').focus();
  await page.keyboard.press('Delete');
  assert.equal(await page.evaluate(id=>wires.some(w=>w.id===id),routeWireId),false,
    'Delete key did not remove the selected Connect wire');
  assert.equal(await page.evaluate(()=>selected),null,
    'Delete key left stale Connect selection');
  assert.equal(await page.locator('#properties').count(),1,
    'Properties panel disappeared after deleting a Connect wire');
  checkErrors('Connect deletion through keyboard');

  // Regression: conductor Properties must initialize parallel-count handlers
  // even when the wire has no label.
  const unlabeledWireId=await page.evaluate(()=>{
    // Create known equipment so this regression cannot silently skip itself.
    const a={id:next++,type:'panel',x:200,y:410,scaleX:1,scaleY:1};
    const b={id:next++,type:'panel',x:520,y:410,scaleX:1,scaleY:1};
    nodes.push(a,b);
    const id=next++;
    wires.push({id,from:a.id,to:b.id,fromSide:'right',toSide:'left',
      routeStyle:'straight',label:'',parallelCount:1,parallelSpacing:8});
    selected={kind:'wire',id};render();
    return id;
  });
  {
    const parallelControl=page.locator('#properties [data-parallel-count]');
    await parallelControl.waitFor();
    await parallelControl.selectOption('2');
    assert.equal(await page.evaluate(id=>wires.find(w=>w.id===id)?.parallelCount,unlabeledWireId),2,
      'Unlabeled conductor lost its parallel-count handler');
    checkErrors('Unlabeled conductor Properties');
  }

  // Plan View: nearest-wall selection must compare full rotated wall segments,
  // not only wall centers. The long wall is closest at its far endpoint.
  await page.locator('[data-drawing-tab="plan"]').click();
  const nearestDimensionId=await page.evaluate(()=>{
    const px=planUnitsPerInch();
    const longWall={id:next++,type:'planwall',x:400,y:300,wallLengthIn:240,wallAngle:0,scaleX:1,scaleY:1};
    const dimension={id:next++,type:'plandimension',x:400+100*px,y:300,dimensionLengthIn:12,dimensionAngle:0,dimensionOffset:25};
    const misleadingWall={id:next++,type:'planwall',x:dimension.x+12,y:dimension.y+40,wallLengthIn:24,wallAngle:0,scaleX:1,scaleY:1};
    nodes.push(longWall,misleadingWall,dimension);
    selected={kind:'node',id:dimension.id};mode='select';render();
    return {dimensionId:dimension.id,longWallId:longWall.id};
  });
  await page.locator('#properties [data-dimension-match-wall]').click();
  assert.equal(await page.evaluate(ids=>nodes.find(n=>n.id===ids.dimensionId).dimensionWallId,nearestDimensionId),nearestDimensionId.longWallId,
    'Measure Nearest Wall selected a closer center instead of the closest wall segment');
  checkErrors('Plan View Measure Nearest Wall');

  // A diagonal wall must be selected by segment proximity, not center proximity.
  const diagonalResult=await page.evaluate(()=>{
    const px=planUnitsPerInch();
    const wall={id:next++,type:'planwall',x:500,y:460,wallLengthIn:160,wallAngle:45};
    const offset=65*px/Math.sqrt(2);
    const dim={id:next++,type:'plandimension',x:500+offset,y:460+offset,dimensionLengthIn:10,dimensionAngle:0};
    const decoy={id:next++,type:'planwall',x:dim.x+18,y:dim.y+45,wallLengthIn:12,wallAngle:0};
    nodes.push(wall,decoy,dim);selected={kind:'node',id:dim.id};render();
    return {wallId:wall.id,dimensionId:dim.id};
  });
  await page.locator('#properties [data-dimension-match-wall]').click();
  const diagonalMeasurement=await page.evaluate(ids=>{
    const n=nodes.find(v=>v.id===ids.dimensionId);
    return {wallId:n.dimensionWallId,length:n.dimensionLengthIn,angle:n.dimensionAngle};
  },diagonalResult);
  assert.equal(diagonalMeasurement.wallId,diagonalResult.wallId,
    'Nearest-wall measurement missed a diagonal wall');
  assert.equal(diagonalMeasurement.length,160);
  assert.equal(diagonalMeasurement.angle,45);
  checkErrors('Plan View diagonal nearest-wall measurement');

  // Two-point measurement must enter its own Plan View mode and cancel cleanly.
  await page.locator('#planTwoPointDimension').click();
  assert.equal(await page.evaluate(()=>mode),'plan-two-point-dimension',
    'Two-point dimension tool did not activate');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>mode),'select',
    'Escape did not cancel two-point measurement');
  checkErrors('Plan View two-point dimension mode');

  // Exercise the real two-click measurement path in the drawing's coordinate system.
  await page.locator('#planTwoPointDimension').click();
  const measured=await page.evaluate(()=>{
    const svg=document.querySelector('#svg'),matrix=svg.getScreenCTM();
    const toClient=(x,y)=>{const p=svg.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(matrix);return {clientX:q.x,clientY:q.y};};
    const before=new Set(nodes.map(n=>n.id));
    for(const [x,y] of [[300,250],[420,250]]){
      svg.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0,...toClient(x,y)}));
    }
    const n=nodes.find(n=>n.type==='plandimension'&&!before.has(n.id));
    return {created:!!n,length:n?.dimensionLengthIn,angle:n?.dimensionAngle,mode};
  });
  assert.equal(measured.created,true,'Two clicks did not create a dimension');
  assert.ok(Math.abs(measured.length-120*await page.evaluate(()=>1/planUnitsPerInch()))<0.02,
    'Two-point dimension did not convert drawing units to inches');
  assert.ok(Math.abs(measured.angle)<0.01,'Horizontal two-point dimension has incorrect angle');
  assert.equal(measured.mode,'select','Two-point measurement did not return to selection mode');
  checkErrors('Plan View two-point measurement with real pointer events');

  // Background calibration must refuse to start without a selected imported plan.
  await page.locator('#calibrateBackground').click();
  assert.equal(await page.evaluate(()=>mode),'select',
    'Background calibration activated without an imported background');
  checkErrors('Plan View calibration requires a selected background');

  // Calibrate a synthetic imported background against a known 120-inch span.
  const calibration=await page.evaluate(()=>{
    const im={kind:'calibration-smoke',src:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',x:200,y:200,w:200,h:100,locked:false,opacity:1};
    personalImages.push(im);selected={kind:'personalImage',id:im.kind};render();
    document.querySelector('#calibrationInches').value='120';
    document.querySelector('#calibrateBackground').click();
    const svg=document.querySelector('#svg'),matrix=svg.getScreenCTM();
    for(const [x,y] of [[220,220],[320,220]]){
      const p=svg.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(matrix);
      svg.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0,clientX:q.x,clientY:q.y}));
    }
    const result={mode,width:im.w,height:im.h,expectedWidth:200*120*planUnitsPerInch()/100};
    personalImages=personalImages.filter(v=>v.kind!==im.kind);selected=null;render();
    return result;
  });
  assert.equal(calibration.mode,'select','Calibration did not return to select mode');
  assert.ok(Math.abs(calibration.width-calibration.expectedWidth)<0.01,
    'Background calibration did not scale by the known distance');
  assert.ok(Math.abs(calibration.width/calibration.height-2)<0.001,
    'Background calibration distorted image aspect ratio');
  checkErrors('Plan View known-distance calibration');

  // Persistent wall joints: moving one joined wall should move its neighbor,
  // and an attached opening must continue to follow the neighbor.
  await page.evaluate(()=>{
    const px=planUnitsPerInch();
    const first={id:next++,type:'planwall',x:350,y:400,wallLengthIn:120,wallAngle:0};
    const second={id:next++,type:'planwall',x:350+60*px,y:400+60*px,wallLengthIn:120,wallAngle:90};
    const door={id:next++,type:'plandoor',x:second.x,y:second.y,doorWidthIn:36,doorAngle:90,attachedWallId:second.id,wallOffset:0};
    nodes.push(first,second,door);
    registerPlanWallJoint(first,second,1,-1);
    const before={x:second.x,y:second.y};
    first.x+=20;first.y+=10;syncPlanWallJoints(first);
    if(Math.abs(second.x-before.x-20)>0.001||Math.abs(second.y-before.y-10)>0.001)
      throw Error('Connected wall did not follow moved wall');
    if(Math.abs(door.x-second.x)>0.001||Math.abs(door.y-second.y)>0.001)
      throw Error('Attached door did not follow connected wall');
    nodes=nodes.filter(n=>![first.id,second.id,door.id].includes(n.id));
    render();
  });
  checkErrors('Plan View persistent wall joints');

  // A three-wall chain must propagate endpoint motion without moving a wall twice.
  await page.evaluate(()=>{
    const px=planUnitsPerInch(),length=100*px;
    const a={id:next++,type:'planwall',x:250,y:300,wallLengthIn:100,wallAngle:0};
    const b={id:next++,type:'planwall',x:250+length,y:300,wallLengthIn:100,wallAngle:0};
    const d={id:next++,type:'planwall',x:250+2*length,y:300,wallLengthIn:100,wallAngle:0};
    nodes.push(a,b,d);
    registerPlanWallJoint(a,b,1,-1);
    registerPlanWallJoint(b,d,1,-1);
    const original={bx:b.x,dx:d.x};
    a.x+=17;syncPlanWallJoints(a);
    if(Math.abs(b.x-original.bx-17)>0.001||Math.abs(d.x-original.dx-17)>0.001)
      throw Error('Three-wall joint chain failed to propagate translation');
    nodes=nodes.filter(n=>![a.id,b.id,d.id].includes(n.id));
    removeInvalidPlanWallJoints();render();
  });
  checkErrors('Plan View three-wall joint chain');

  // A closed rectangular wall loop must remain joined under translation.
  await page.evaluate(()=>{
    const px=planUnitsPerInch(),half=60*px;
    const top={id:next++,type:'planwall',x:480,y:350,wallLengthIn:120,wallAngle:0};
    const right={id:next++,type:'planwall',x:480+half,y:350+half,wallLengthIn:120,wallAngle:90};
    const bottom={id:next++,type:'planwall',x:480,y:350+2*half,wallLengthIn:120,wallAngle:0};
    const left={id:next++,type:'planwall',x:480-half,y:350+half,wallLengthIn:120,wallAngle:90};
    nodes.push(top,right,bottom,left);
    registerPlanWallJoint(top,right,1,-1);
    registerPlanWallJoint(right,bottom,1,1);
    registerPlanWallJoint(bottom,left,-1,1);
    registerPlanWallJoint(left,top,-1,-1);
    const before=[right,bottom,left].map(w=>({x:w.x,y:w.y}));
    top.x+=13;top.y+=9;
    if(syncPlanWallJoints(top)!==true)throw Error('Closed room rejected a rigid translation');
    [right,bottom,left].forEach((w,i)=>{
      if(Math.abs(w.x-before[i].x-13)>0.01||Math.abs(w.y-before[i].y-9)>0.01)
        throw Error('Closed room translation did not preserve all corners');
    });
    nodes=nodes.filter(n=>![top.id,right.id,bottom.id,left.id].includes(n.id));
    removeInvalidPlanWallJoints();render();
  });
  checkErrors('Plan View closed wall loop translation');

  // A closed room must reject a one-wall rotation instead of shifting other
  // walls into a broken loop.
  await page.evaluate(()=>{
    const px=planUnitsPerInch(),h=40*px;
    const top={id:next++,type:'planwall',x:420,y:260,wallLengthIn:80,wallAngle:0};
    const right={id:next++,type:'planwall',x:420+h,y:260+h,wallLengthIn:80,wallAngle:90};
    const bottom={id:next++,type:'planwall',x:420,y:260+2*h,wallLengthIn:80,wallAngle:0};
    const left={id:next++,type:'planwall',x:420-h,y:260+h,wallLengthIn:80,wallAngle:90};
    nodes.push(top,right,bottom,left);
    registerPlanWallJoint(top,right,1,-1);
    registerPlanWallJoint(right,bottom,1,1);
    registerPlanWallJoint(bottom,left,-1,1);
    registerPlanWallJoint(left,top,-1,-1);
    const original=[right,bottom,left].map(w=>({x:w.x,y:w.y}));
    top.wallAngle=15;
    if(syncPlanWallJoints(top)!==false)throw Error('Inconsistent closed-room rotation was accepted');
    [right,bottom,left].forEach((w,i)=>{
      if(Math.hypot(w.x-original[i].x,w.y-original[i].y)>0.001)
        throw Error('Rejected closed-room edit still moved adjoining walls');
    });
    nodes=nodes.filter(n=>![top.id,right.id,bottom.id,left.id].includes(n.id));
    removeInvalidPlanWallJoints();render();
  });
  checkErrors('Plan View reject inconsistent closed-room rotation');

  // Free walls should accept geometry changes without a joint graph.
  await page.evaluate(()=>{
    const wall={id:next++,type:'planwall',x:350,y:380,wallLengthIn:120,wallAngle:0};
    nodes.push(wall);
    wall.wallLengthIn=144;wall.wallAngle=30;
    if(syncPlanWallJoints(wall)!==true)throw Error('Free wall geometry update was rejected');
    if(wall.wallLengthIn!==144||wall.wallAngle!==30)throw Error('Free wall geometry changed unexpectedly');
    nodes=nodes.filter(n=>n.id!==wall.id);render();
  });
  checkErrors('Plan View free wall geometry');

  // One endpoint must not be joined to two different wall endpoints.
  await page.evaluate(()=>{
    const a={id:next++,type:'planwall',x:250,y:300,wallLengthIn:60,wallAngle:0};
    const b={id:next++,type:'planwall',x:330,y:300,wallLengthIn:60,wallAngle:0};
    const c={id:next++,type:'planwall',x:330,y:370,wallLengthIn:60,wallAngle:90};
    nodes.push(a,b,c);
    if(registerPlanWallJoint(a,b,1,-1)!==true)throw Error('Valid wall joint rejected');
    if(registerPlanWallJoint(a,c,1,-1)!==false)throw Error('Conflicting wall endpoint joint accepted');
    if(registerPlanWallJoint(a,b,1,-1)!==true)throw Error('Duplicate existing wall joint rejected');
    if(a.wallJoints.length!==1||b.wallJoints.length!==1||c.wallJoints?.length)
      throw Error('Conflicting wall joint mutated the connection graph');
    nodes=nodes.filter(n=>![a.id,b.id,c.id].includes(n.id));render();
  });
  checkErrors('Plan View conflicting wall endpoint prevention');

  // Disconnecting a wall from Properties must clear both ends of the joint.
  const disconnectIds=await page.evaluate(()=>{
    const a={id:next++,type:'planwall',x:320,y:380,wallLengthIn:100,wallAngle:0};
    const b={id:next++,type:'planwall',x:320+100*planUnitsPerInch(),y:380,wallLengthIn:100,wallAngle:0};
    nodes.push(a,b);registerPlanWallJoint(a,b,1,-1);
    selected={kind:'node',id:a.id};render();
    return {a:a.id,b:b.id};
  });
  await page.locator('#properties [data-wall-disconnect]').click();
  const disconnected=await page.evaluate(ids=>{
    const a=nodes.find(n=>n.id===ids.a),b=nodes.find(n=>n.id===ids.b);
    const result={a:a.wallJoints?.length||0,b:b.wallJoints?.length||0};
    nodes=nodes.filter(n=>n.id!==ids.a&&n.id!==ids.b);selected=null;render();
    return result;
  },disconnectIds);
  assert.deepEqual(disconnected,{a:0,b:0},'Wall disconnect left stale reciprocal joints');
  checkErrors('Plan View disconnect wall joints');

  // Resize a closed rectangular wall group and retain joints and opening sizes.
  await page.evaluate(()=>{
    const px=planUnitsPerInch(),h=48*px;
    const top={id:next++,type:'planwall',x:480,y:330,wallLengthIn:96,wallAngle:0};
    const right={id:next++,type:'planwall',x:480+h,y:330+h,wallLengthIn:96,wallAngle:90};
    const bottom={id:next++,type:'planwall',x:480,y:330+2*h,wallLengthIn:96,wallAngle:0};
    const left={id:next++,type:'planwall',x:480-h,y:330+h,wallLengthIn:96,wallAngle:90};
    const door={id:next++,type:'plandoor',x:top.x,y:top.y,doorWidthIn:36,doorAngle:0,attachedWallId:top.id,wallOffset:0};
    nodes.push(top,right,bottom,left,door);
    registerPlanWallJoint(top,right,1,-1);
    registerPlanWallJoint(right,bottom,1,1);
    registerPlanWallJoint(bottom,left,-1,1);
    registerPlanWallJoint(left,top,-1,-1);
    if(resizeConnectedPlanWalls(top,125)!==true)throw Error('Connected-room resizing failed');
    for(const wall of [top,right,bottom,left]){
      if(Math.abs(wall.wallLengthIn-120)>0.001)throw Error('Wall length not resized uniformly');
      for(const joint of wall.wallJoints){
        const other=nodes.find(n=>n.id===joint.wallId);
        const a=planWallEndpoint(wall,joint.side),b=planWallEndpoint(other,joint.otherSide);
        if(Math.hypot(a.x-b.x,a.y-b.y)>0.01)throw Error('Connected-room resize broke a corner');
      }
    }
    if(door.doorWidthIn!==36||Math.hypot(door.x-top.x,door.y-top.y)>0.01)
      throw Error('Door changed width or lost wall attachment');
    nodes=nodes.filter(n=>![top.id,right.id,bottom.id,left.id,door.id].includes(n.id));render();
  });
  checkErrors('Plan View connected-room uniform resize');

  // Exercise the actual connected-wall resize button in Properties.
  const groupIds=await page.evaluate(()=>{
    const px=planUnitsPerInch(),h=50*px;
    const a={id:next++,type:'planwall',x:420,y:350,wallLengthIn:100,wallAngle:0};
    const b={id:next++,type:'planwall',x:420+h,y:350+h,wallLengthIn:100,wallAngle:90};
    nodes.push(a,b);registerPlanWallJoint(a,b,1,-1);
    selected={kind:'node',id:a.id};mode='select';render();
    return {a:a.id,b:b.id};
  });
  await page.locator('#properties [data-wall-group-percent]').fill('150');
  await page.locator('#properties [data-wall-group-resize]').click();
  const resized=await page.evaluate(ids=>{
    const a=nodes.find(n=>n.id===ids.a),b=nodes.find(n=>n.id===ids.b);
    const result={lengthA:a.wallLengthIn,lengthB:b.wallLengthIn,
      gap:Math.hypot(planWallEndpoint(a,1).x-planWallEndpoint(b,-1).x,
        planWallEndpoint(a,1).y-planWallEndpoint(b,-1).y)};
    nodes=nodes.filter(n=>n.id!==ids.a&&n.id!==ids.b);selected=null;render();
    return result;
  },groupIds);
  assert.ok(Math.abs(resized.lengthA-150)<0.01&&Math.abs(resized.lengthB-150)<0.01,
    'Properties resize did not update both connected walls');
  assert.ok(resized.gap<0.01,'Properties resize broke the shared wall endpoint');
  checkErrors('Plan View Properties connected-wall resize');

  // A room resize extending outside the sheet must roll back every wall and opening.
  await page.evaluate(()=>{
    const px=planUnitsPerInch(),half=40*px;
    const a={id:next++,type:'planwall',x:950-half,y:260,wallLengthIn:80,wallAngle:0};
    const b={id:next++,type:'planwall',x:950,y:260+half,wallLengthIn:80,wallAngle:90};
    const opening={id:next++,type:'planwindow',x:a.x,y:a.y,windowWidthIn:24,windowAngle:0,attachedWallId:a.id,wallOffset:0};
    nodes.push(a,b,opening);registerPlanWallJoint(a,b,1,-1);
    const original=[a.x,a.y,a.wallLengthIn,b.x,b.y,b.wallLengthIn,opening.wallOffset];
    if(resizeConnectedPlanWalls(a,200)!==false)throw Error('Out-of-bounds resize was accepted');
    const after=[a.x,a.y,a.wallLengthIn,b.x,b.y,b.wallLengthIn,opening.wallOffset];
    if(original.some((value,i)=>value!==after[i]))throw Error('Failed room resize did not roll back all changes');
    if(opening.attachedWallId!==a.id||opening.windowWidthIn!==24)throw Error('Failed resize detached or resized window');
    nodes=nodes.filter(n=>![a.id,b.id,opening.id].includes(n.id));render();
  });
  checkErrors('Plan View room resize boundary rollback');

  // Shrinking below an opening's physical width must reject and roll back.
  await page.evaluate(()=>{
    const wall={id:next++,type:'planwall',x:450,y:300,wallLengthIn:60,wallAngle:0};
    const door={id:next++,type:'plandoor',x:450,y:300,doorWidthIn:36,doorAngle:0,attachedWallId:wall.id,wallOffset:0};
    nodes.push(wall,door);
    if(resizeConnectedPlanWalls(wall,50)!==false)throw Error('Wall resized below attached door width');
    if(wall.wallLengthIn!==60||door.attachedWallId!==wall.id||door.doorWidthIn!==36)
      throw Error('Rejected resize changed wall length or detached the door');
    nodes=nodes.filter(n=>n.id!==wall.id&&n.id!==door.id);render();
  });
  checkErrors('Plan View resize smaller than attached door');

  // Independent X/Y room resizing must preserve the four connected corners.
  await page.evaluate(()=>{
    const px=planUnitsPerInch(),hx=60*px,hy=40*px;
    const top={id:next++,type:'planwall',x:490,y:320,wallLengthIn:120,wallAngle:0};
    const right={id:next++,type:'planwall',x:490+hx,y:320+hy,wallLengthIn:80,wallAngle:90};
    const bottom={id:next++,type:'planwall',x:490,y:320+2*hy,wallLengthIn:120,wallAngle:0};
    const left={id:next++,type:'planwall',x:490-hx,y:320+hy,wallLengthIn:80,wallAngle:90};
    const window={id:next++,type:'planwindow',x:top.x,y:top.y,windowWidthIn:30,windowAngle:0,attachedWallId:top.id,wallOffset:0};
    nodes.push(top,right,bottom,left,window);
    registerPlanWallJoint(top,right,1,-1);
    registerPlanWallJoint(right,bottom,1,1);
    registerPlanWallJoint(bottom,left,-1,1);
    registerPlanWallJoint(left,top,-1,-1);
    if(resizeConnectedPlanWallsAxes(top,125,75)!==true)throw Error('Independent rectangular room resize rejected');
    if(Math.abs(top.wallLengthIn-150)>0.01||Math.abs(bottom.wallLengthIn-150)>0.01||
       Math.abs(left.wallLengthIn-60)>0.01||Math.abs(right.wallLengthIn-60)>0.01)
      throw Error('Independent room dimensions incorrect');
    for(const wall of [top,right,bottom,left])for(const joint of wall.wallJoints){
      const other=nodes.find(n=>n.id===joint.wallId),a=planWallEndpoint(wall,joint.side),b=planWallEndpoint(other,joint.otherSide);
      if(Math.hypot(a.x-b.x,a.y-b.y)>0.01)throw Error('Independent room resize separated corners');
    }
    if(window.windowWidthIn!==30||window.attachedWallId!==top.id)throw Error('Window width or attachment lost');
    nodes=nodes.filter(n=>![top.id,right.id,bottom.id,left.id,window.id].includes(n.id));render();
  });
  checkErrors('Plan View independent rectangular room dimensions');

  // Angled walls must not be distorted by independent X/Y scaling.
  await page.evaluate(()=>{
    const wall={id:next++,type:'planwall',x:470,y:330,wallLengthIn:120,wallAngle:45};
    nodes.push(wall);
    const original={x:wall.x,y:wall.y,length:wall.wallLengthIn,angle:wall.wallAngle};
    if(resizeConnectedPlanWallsAxes(wall,150,75)!==false)
      throw Error('Non-axis-aligned wall accepted independent X/Y resizing');
    if(wall.x!==original.x||wall.y!==original.y||
       wall.wallLengthIn!==original.length||wall.wallAngle!==original.angle)
      throw Error('Rejected angled-wall resize modified geometry');
    nodes=nodes.filter(n=>n.id!==wall.id);render();
  });
  checkErrors('Plan View angled-wall resize rejection');

  // Exercise the independent width/height controls in the Properties panel.
  const axesIds=await page.evaluate(()=>{
    const wall={id:next++,type:'planwall',x:450,y:320,wallLengthIn:100,wallAngle:0};
    nodes.push(wall);selected={kind:'node',id:wall.id};mode='select';render();
    return wall.id;
  });
  await page.locator('#properties [data-wall-group-width]').fill('140');
  await page.locator('#properties [data-wall-group-height]').fill('80');
  await page.locator('#properties [data-wall-group-axes]').click();
  const axesLength=await page.evaluate(id=>{
    const wall=nodes.find(n=>n.id===id),length=wall.wallLengthIn;
    nodes=nodes.filter(n=>n.id!==id);selected=null;render();return length;
  },axesIds);
  assert.ok(Math.abs(axesLength-140)<0.01,'Properties independent width control did not resize horizontal wall');
  checkErrors('Plan View independent width and height Properties control');

  // An off-center opening must not be silently moved by a room shrink.
  await page.evaluate(()=>{
    const px=planUnitsPerInch();
    const wall={id:next++,type:'planwall',x:450,y:320,wallLengthIn:100,wallAngle:0};
    const window={id:next++,type:'planwindow',x:450+35*px,y:320,windowWidthIn:30,windowAngle:0,attachedWallId:wall.id,wallOffset:35*px};
    nodes.push(wall,window);
    const before={length:wall.wallLengthIn,offset:window.wallOffset,x:window.x};
    if(resizeConnectedPlanWalls(wall,50)!==false)throw Error('Resize accepted an opening that no longer fits at its position');
    if(wall.wallLengthIn!==before.length||window.wallOffset!==before.offset||
       window.x!==before.x||window.attachedWallId!==wall.id)
      throw Error('Rejected resize moved or detached the off-center window');
    nodes=nodes.filter(n=>n.id!==wall.id&&n.id!==window.id);render();
  });
  checkErrors('Plan View preserve off-center opening on resize');

  // Invalid room scale inputs must not change any wall geometry.
  await page.evaluate(()=>{
    const wall={id:next++,type:'planwall',x:450,y:300,wallLengthIn:96,wallAngle:0};
    nodes.push(wall);
    for(const [x,y] of [[0,100],[100,0],[-50,100],[100,Infinity],[NaN,100],[301,100]]){
      if(resizeConnectedPlanWallsAxes(wall,x,y)!==false)
        throw Error('Invalid room scale accepted: '+x+', '+y);
      if(wall.x!==450||wall.y!==300||wall.wallLengthIn!==96)
        throw Error('Invalid room scale changed wall geometry');
    }
    if(resizeConnectedPlanWallsAxes(wall,100,100)!==true)
      throw Error('100% resize should be a safe no-op');
    nodes=nodes.filter(n=>n.id!==wall.id);render();
  });
  checkErrors('Plan View invalid and no-op resize percentages');

  // A rotated wall's teal selection outline and handle must rotate together.
  await page.evaluate(()=>{
    const wall={id:next++,type:'planwall',x:470,y:330,wallLengthIn:120,wallThicknessIn:6,wallAngle:90,name:'Wall'};
    nodes.push(wall);selected={kind:'node',id:wall.id};mode='select';render();
    const g=document.querySelector('#nodes [data-node="'+wall.id+'"]');
    const selection=g?.querySelector('rect[data-resize]')?.parentElement;
    if(!selection||selection.tagName.toLowerCase()!=='g'||selection.getAttribute('transform')!=='rotate(90)')
      throw Error('Wall selection outline and handle do not rotate with wall');
    wall.wallAngle=0;render();
    const reset=document.querySelector('#nodes [data-node="'+wall.id+'"] rect[data-resize]')?.parentElement;
    if(!reset||reset.getAttribute('transform')!=='rotate(0)')
      throw Error('Wall selection did not return to horizontal');
    nodes=nodes.filter(n=>n.id!==wall.id);selected=null;render();
  });
  checkErrors('Plan View rotated wall selection outline');

  // Wall outline, hit bounds and endpoints must share one geometry model.
  await page.evaluate(()=>{
    const wall={id:next++,type:'planwall',x:450,y:330,wallLengthIn:120,wallThicknessIn:6,wallAngle:0};
    nodes.push(wall);selected={kind:'node',id:wall.id};mode='select';
    for(const angle of [0,45,90,180,270]){
      wall.wallAngle=angle;render();
      const geometry=planWallGeometry(wall),boundsValue=bounds(wall);
      const expectedWidth=2*(Math.abs(geometry.cos)*geometry.halfLength+Math.abs(geometry.sin)*geometry.halfThickness);
      const expectedHeight=2*(Math.abs(geometry.sin)*geometry.halfLength+Math.abs(geometry.cos)*geometry.halfThickness);
      if(Math.abs(boundsValue.l+boundsValue.r-expectedWidth)>0.01||
         Math.abs(boundsValue.t+boundsValue.b-expectedHeight)>0.01)
        throw Error('Wall hit bounds mismatch at '+angle+' degrees');
      const selection=document.querySelector('#nodes [data-node="'+wall.id+'"] rect[data-resize]')?.parentElement;
      if(selection?.getAttribute('transform')!=='rotate('+angle+')')
        throw Error('Wall selection rotation mismatch at '+angle+' degrees');
      const left=planWallEndpoint(wall,-1),right=planWallEndpoint(wall,1);
      if(Math.abs(Math.hypot(right.x-left.x,right.y-left.y)-2*geometry.halfLength)>0.01)
        throw Error('Wall endpoint length mismatch at '+angle+' degrees');
    }
    nodes=nodes.filter(n=>n.id!==wall.id);selected=null;render();
  });
  checkErrors('Plan View shared wall geometry across rotations');

  // Wall label font and placement must not change physical wall geometry.
  const wallLabelId=await page.evaluate(()=>{
    const wall={id:next++,type:'planwall',x:450,y:330,wallLengthIn:120,wallThicknessIn:6,wallAngle:90,name:'Wall'};
    nodes.push(wall);selected={kind:'node',id:wall.id};mode='select';render();return wall.id;
  });
  await page.locator('#properties [data-wall-name]').fill('EXTERIOR WALL');
  await page.locator('#properties [data-wall-name-size]').fill('24');
  await page.locator('#properties [data-wall-name-x]').fill('30');
  await page.locator('#properties [data-wall-name-y]').fill('-20');
  await page.evaluate(id=>{
    const wall=nodes.find(n=>n.id===id),text=document.querySelector('#nodes [data-plan-name="'+id+'"]');
    if(!text||text.textContent!=='EXTERIOR WALL'||text.getAttribute('font-size')!=='24'||
       text.getAttribute('x')!=='30'||text.getAttribute('y')!=='-20')
      throw Error('Wall label formatting was not applied');
    if(wall.wallAngle!==90||wall.wallLengthIn!==120||wall.wallThicknessIn!==6)
      throw Error('Wall label editing changed physical geometry');
    if(text.hasAttribute('transform'))throw Error('Wall label rotated or scaled with wall');
    nodes=nodes.filter(n=>n.id!==id);selected=null;render();
  },wallLabelId);
  checkErrors('Plan View independent wall label formatting');

  // Wall symbol and teal outline must use identical rotation and physical dimensions.
  await page.evaluate(()=>{
    const wall={id:next++,type:'planwall',x:450,y:330,wallLengthIn:132,wallThicknessIn:8,wallAngle:0,name:'Wall'};
    nodes.push(wall);selected={kind:'node',id:wall.id};mode='select';
    for(const angle of [0,30,90,135,270]){
      wall.wallAngle=angle;render();
      const group=document.querySelector('#nodes [data-node="'+wall.id+'"]');
      const symbol=group?.querySelector('.equipment-symbol > g');
      const outline=group?.querySelector('rect[data-resize]')?.parentElement;
      if(symbol?.getAttribute('transform')!=='rotate('+angle+')'||
         outline?.getAttribute('transform')!=='rotate('+angle+')')
        throw Error('Wall and selection rotations disagree at '+angle);
      const g=planWallGeometry(wall),rect=outline.querySelector('rect');
      if(Math.abs(Number(rect.getAttribute('width'))-(2*g.halfLength+4))>0.01||
         Math.abs(Number(rect.getAttribute('height'))-(2*g.halfThickness+4))>0.01)
        throw Error('Wall outline dimensions disagree with geometry at '+angle);
    }
    nodes=nodes.filter(n=>n.id!==wall.id);selected=null;render();
  });
  checkErrors('Plan View wall renderer and selection alignment');

  // Regression: hit targets and resize controls follow the visual rotation.
  await page.evaluate(()=>{
    const wall={id:next++,type:'planwall',x:480,y:330,wallLengthIn:120,wallThicknessIn:6,wallAngle:90,name:'Wall'};
    const equipment={id:next++,type:'panel',x:600,y:350,drawingRotation:90,scaleX:1,scaleY:1,name:'Panel'};
    nodes.push(wall,equipment);
    for(const item of [wall,equipment]){
      selected={kind:'node',id:item.id};render();
      const node=document.querySelector('#nodes [data-node="'+item.id+'"]');
      const hit=node?.querySelector(':scope > g > rect[fill="transparent"]');
      const outline=node?.querySelector('[data-resize="'+item.id+'"]')?.parentElement;
      if(!hit||!outline)throw Error('Missing transformed selection or hit target: '+item.type);
      const transform=hit.parentElement.getAttribute('transform')||'';
      if(!transform.includes('rotate(90)'))throw Error('Hit target did not rotate: '+item.type);
      if(!(outline.getAttribute('transform')||'').includes('rotate(90)'))throw Error('Resize handle did not rotate: '+item.type);
    }
    nodes=nodes.filter(n=>n.id!==wall.id&&n.id!==equipment.id);selected=null;render();
  });
  checkErrors('Rotated selection hit targets and resize handles');

  // Real pointer regression: a rotated panel must move and resize at its
  // visible handle, not merely display the correct selection outline.
  const pointerNodeId=await page.evaluate(()=>{
    const item={id:next++,type:'panel',name:'Panel',x:530,y:340,drawingRotation:90,scaleX:1,scaleY:1};
    nodes.push(item);selected={kind:'node',id:item.id};mode='select';render();
    return item.id;
  });
  const pointerNode=page.locator('#nodes [data-node="'+pointerNodeId+'"]');
  const pointerHit=pointerNode.locator('g > rect[fill="transparent"]').first();
  const hitBox=await pointerHit.boundingBox();
  assert.ok(hitBox&&hitBox.height>hitBox.width,'Rotated panel hit target should be vertical');
  const center={x:hitBox.x+hitBox.width/2,y:hitBox.y+hitBox.height/2};
  await page.mouse.move(center.x,center.y);
  await page.mouse.down();
  await page.mouse.move(center.x+24,center.y+17,{steps:6});
  await page.mouse.up();
  const moved=await page.evaluate(id=>{const n=nodes.find(n=>n.id===id);return {x:n.x,y:n.y}},pointerNodeId);
  assert.ok(Math.abs(moved.x-554)<3&&Math.abs(moved.y-357)<3,'Rotated panel should follow pointer movement');
  const handleBox=await pointerNode.locator('[data-resize="'+pointerNodeId+'"]').boundingBox();
  assert.ok(handleBox,'Rotated panel resize handle should exist');
  const hx=handleBox.x+handleBox.width/2,hy=handleBox.y+handleBox.height/2;
  await page.mouse.move(hx,hy);
  await page.mouse.down();
  await page.mouse.move(hx-20,hy+18,{steps:6});
  await page.mouse.up();
  const resized=await page.evaluate(id=>{const n=nodes.find(n=>n.id===id);return {sx:n.scaleX,sy:n.scaleY}},pointerNodeId);
  assert.ok(Math.abs(resized.sx-1)>.03||Math.abs(resized.sy-1)>.03,'Rotated panel resize should respond to pointer');
  await page.evaluate(id=>{nodes=nodes.filter(n=>n.id!==id);selected=null;render()},pointerNodeId);
  checkErrors('Rotated equipment pointer drag and resize');

  // Architectural window symbol keeps its measured width and orientation.
  await page.evaluate(()=>{
    const windowNode={id:next++,type:'planwindow',x:470,y:330,windowWidthIn:48,windowAngle:0,name:'Window'};
    nodes.push(windowNode);selected={kind:'node',id:windowNode.id};mode='select';
    for(const angle of [0,90,180]){
      windowNode.windowAngle=angle;render();
      const symbol=document.querySelector('#nodes [data-node="'+windowNode.id+'"] [data-plan-window-symbol]');
      if(!symbol||symbol.getAttribute('transform')!=='rotate('+angle+')')
        throw Error('Architectural window symbol rotation mismatch');
      const path=symbol.querySelector('path');
      const expected=48*planUnitsPerInch()/(Number(windowNode.scaleX)||1);
      if(!path?.getAttribute('d')?.includes(String(-expected/2)))
        throw Error('Architectural window width no longer follows scale');
    }
    nodes=nodes.filter(n=>n.id!==windowNode.id);selected=null;render();
  });
  checkErrors('Plan View architectural window symbol');

  // Architectural door: retain swing hand, angle and measured leaf length.
  await page.evaluate(()=>{
    const door={id:next++,type:'plandoor',x:470,y:330,doorWidthIn:36,doorAngle:0,doorHand:'left',name:'Door'};
    nodes.push(door);selected={kind:'node',id:door.id};mode='select';
    for(const angle of [0,90,180]){
      for(const hand of ['left','right']){
        door.doorAngle=angle;door.doorHand=hand;render();
        const symbol=document.querySelector('#nodes [data-node="'+door.id+'"] [data-plan-door-symbol]');
        if(!symbol||symbol.getAttribute('transform')!=='rotate('+angle+')')
          throw Error('Architectural door rotation mismatch');
        const paths=symbol.querySelectorAll('path');
        const width=36*planUnitsPerInch()/(Number(door.scaleX)||1);
        if(paths.length!==3||!paths[1].getAttribute('d').includes('H'+width))
          throw Error('Architectural door leaf width mismatch');
        const arc=paths[2].getAttribute('d');
        if(!arc.includes('0 '+(hand==='right'?-width:width)))
          throw Error('Architectural door swing hand mismatch');
      }
    }
    nodes=nodes.filter(n=>n.id!==door.id);selected=null;render();
  });
  checkErrors('Plan View architectural door symbol');

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
