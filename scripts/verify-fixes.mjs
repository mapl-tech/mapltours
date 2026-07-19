import { chromium } from 'playwright'
const BASE='http://localhost:3100'
const b=await chromium.launch({headless:true})
const out=[]
// H6: gifts no horizontal overflow at 390
{ const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); const p=await c.newPage()
  await p.goto(BASE+'/gifts',{waitUntil:'networkidle'}); await p.waitForTimeout(1200)
  const o=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)
  out.push(['H6 /gifts mobile overflow px (want <=1)', o]); await c.close() }
// H8: /transfers SSR reserves hero height — check via CLS proxy: measure layout-shift over load at 390 throttled
{ const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); const p=await c.newPage()
  const cdp=await c.newCDPSession(p); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:180*1024,uploadThroughput:80*1024})
  await p.addInitScript(()=>{window.__cls=0;new PerformanceObserver(l=>{for(const e of l.getEntries()){if(!e.hadRecentInput)window.__cls+=e.value}}).observe({type:'layout-shift',buffered:true})})
  await p.goto(BASE+'/transfers',{waitUntil:'load'}); await p.waitForTimeout(6000)
  const cls=await p.evaluate(()=>window.__cls||0)
  out.push(['H8 /transfers CLS mobile fast-3g (want <0.1)', Math.round(cls*1000)/1000]); await c.close() }
// H3: itinerary drawer role=dialog after seeding cart + opening (desktop)
{ const c=await b.newContext({viewport:{width:1440,height:900}}); const p=await c.newPage()
  await p.goto(BASE+'/',{waitUntil:'domcontentloaded'})
  await p.evaluate(()=>localStorage.setItem('mapl-cart',JSON.stringify({state:{items:[{id:1,title:'X',destination:'Negril',parish:'W',price:85,travelers:2,date:'2026-08-20',duration:'4 hrs',image:'',category:'Adventure',rating:5,reviews:1,creator:'x',followers:'1',highlights:[],tags:[]}]},version:0})))
  await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1500)
  // click the itinerary nav button
  const btn=await p.locator('text=/Itinerary/i').first()
  let dialog=0
  if(await btn.count()){ await btn.click(); await p.waitForTimeout(600); dialog=await p.locator('[role="dialog"][aria-modal="true"]').count() }
  out.push(['H3 itinerary opens role=dialog (want 1)', dialog]); await c.close() }
// comment contrast: check computed alpha on a comment timestamp is >=0.6 (proxy) — just confirm no 0.3/0.35 remain rendered
{ const c=await b.newContext({viewport:{width:1440,height:900}}); const p=await c.newPage()
  await p.goto(BASE+'/experience/ricks-cafe-cliff-diving-and-sunset',{waitUntil:'networkidle'}); await p.waitForTimeout(2500)
  const lowAlpha=await p.evaluate(()=>{let n=0;document.querySelectorAll('*').forEach(el=>{const c=getComputedStyle(el).color;const m=c.match(/rgba?\([^)]*?,\s*(0?\.\d+)\)/);if(m&&parseFloat(m[1])<0.55&&el.textContent.trim().length>0&&el.offsetParent){n++}});return n})
  out.push(['comment panel: text nodes with color alpha<0.55 (informational)', lowAlpha]); await c.close() }
await b.close()
for(const [k,v] of out) console.log((typeof v==='number'&&(k.includes('overflow')?v<=1:k.includes('CLS')?v<0.1:k.includes('dialog')?v===1:true)?'✓':'·')+' '+k+' = '+v)
