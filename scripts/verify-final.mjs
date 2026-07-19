import { chromium } from 'playwright'
import { readFileSync } from 'fs'
const axe = readFileSync('node_modules/axe-core/axe.min.js','utf8')
const BASE='http://localhost:3100'
const ROUTES=['/','/explore','/transfers','/experience/ricks-cafe-cliff-diving-and-sunset','/login','/gifts','/checkout','/contact']
const b=await chromium.launch({headless:true})
const NOISE=/google|gtag|hotjar|youtube|doubleclick|facebook|posthog|supabase|ERR_NAME|ipapi|gas-price/i
let totalCritical=0, statusFails=[], consoleFails=[], numFails=0, sizeFails=0
for(const vp of [['desktop',1440,900,false],['mobile',390,844,true]]){
  const c=await b.newContext({viewport:{width:vp[1],height:vp[2]},isMobile:vp[3],hasTouch:vp[3]})
  const p=await c.newPage()
  const errs=[]
  p.on('pageerror',e=>{if(!NOISE.test(e.message))errs.push(e.message.slice(0,80))})
  p.on('console',m=>{if(m.type()==='error'){const t=m.text();if(!NOISE.test(t))errs.push(t.slice(0,80))}})
  for(const route of ROUTES){
    const r=await p.goto(BASE+route,{waitUntil:'networkidle',timeout:30000}).catch(()=>null)
    if(r && r.status()>=400) statusFails.push(vp[0]+' '+route+' '+r.status())
    await p.waitForTimeout(1200)
    // axe
    await p.evaluate(axe)
    const res=await p.evaluate(async()=>await window.axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21a','wcag21aa']}))
    const crit=res.violations.filter(v=>v.impact==='critical'||v.impact==='serious')
    if(crit.length){ totalCritical+=crit.reduce((n,v)=>n+v.nodes.length,0)
      for(const v of crit) console.log(`  axe[${vp[0]} ${route}] ${v.id} (${v.impact}) x${v.nodes.length}`) }
    // numbers + floor
    const typo=await p.evaluate(()=>{
      const numRe=/^[\s$€£¥]*[\d][\d,.\s]*(%|\/5\.?0?|K|\+)?\s*$/
      let nb=0,sb=0
      const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); let n
      while((n=w.nextNode())){const t=n.textContent.trim(); if(!t)continue; const el=n.parentElement; if(!el||!el.offsetParent)continue
        const cs=getComputedStyle(el); const fam=cs.fontFamily; const fs=parseFloat(cs.fontSize)
        if(numRe.test(t)&&t.length<=14&&!/DM[ _]Sans/i.test(fam))nb++
        if(fs<10.9&&cs.textTransform!=='uppercase')sb++}
      return {nb,sb}
    })
    numFails+=typo.nb; sizeFails+=typo.sb
  }
  if(errs.length) consoleFails.push(vp[0]+': '+[...new Set(errs)].slice(0,3).join(' | '))
  await c.close()
}
await b.close()
console.log('\n════ SUMMARY ════')
console.log((statusFails.length?'✗':'✓')+' HTTP: '+(statusFails.join(', ')||'all 200'))
console.log((consoleFails.length?'✗':'✓')+' first-party console/page errors: '+(consoleFails.join(' || ')||'none'))
console.log((totalCritical===0?'✓':'✗')+' axe serious/critical violations: '+totalCritical)
console.log((numFails===0?'✓':'✗')+' numbers not DM Sans: '+numFails)
console.log((sizeFails===0?'✓':'✗')+' readable text < 11px: '+sizeFails)
