const { chromium } = require('playwright');
const path = require('path');
(async () => {
 const browser = await chromium.launch({headless:true});
 const page = await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 try {
  await page.goto('file://'+path.resolve(__dirname,'../one-line/index.html'));
  await page.waitForSelector('#library [data-add="panel"]');
  for(const [tab,type] of [['one','panel'],['plan','planpanel']]){
   await page.locator('[data-drawing-tab="'+tab+'"]').click();
   await page.locator('#library [data-add="'+type+'"]').first().click();
   await page.waitForSelector('#properties');
   if(await page.locator('#properties').innerText()==='')throw Error('Empty Properties for '+tab);
  }
  await page.locator('[data-drawing-tab="ladder"]').click();
  await page.waitForSelector('#svg');
  if(errors.length)throw Error('Browser JavaScript errors: '+errors.join(' | '));
  console.log('PASS: One-Line and Plan View equipment Properties; Ladder tab; no page errors');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
