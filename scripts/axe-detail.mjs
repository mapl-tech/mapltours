import { chromium } from 'playwright'
import { readFileSync } from 'fs'
const axe=readFileSync('node_modules/axe-core/axe.min.js','utf8')
const b=await chromium.launch({headless:true})
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage()
for(const route of ['/transfers','/explore','/experience/ricks-cafe-cliff-diving-and-sunset']){
  await p.goto('http://localhost:3100'+route,{waitUntil:'networkidle'}); await p.waitForTimeout(1500)
  await p.evaluate(axe)
  const res=await p.evaluate(async()=>await window.axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21a','wcag21aa']}))
  for(const v of res.violations.filter(v=>v.impact==='critical'||v.impact==='serious')){
    console.log(`\n### ${route} :: ${v.id} (${v.impact})`)
    for(const n of v.nodes.slice(0,6)){
      console.log('  target:', n.target.join(' '))
      const fc=(n.any||[]).concat(n.all||[]).find(x=>x.data&&x.data.fgColor)
      if(fc) console.log('   ', 'fg',fc.data.fgColor,'bg',fc.data.bgColor,'ratio',fc.data.contrastRatio,'size',fc.data.fontSize)
      else console.log('   ', (n.failureSummary||'').replace(/\n/g,' ').slice(0,120))
    }
  }
}
await b.close()
