// portfolio.jsx
const Portfolio = () => {
  const [tab, setTab] = useState('OVERVIEW');
  const [allocHover, setAllocHover] = useState(null);
  const tabs = ['OVERVIEW','TIMELINE','ACTIVITY','SIMULATE'];
  return (
    <div style={{padding:'24px 32px',overflow:'auto',height:'100%',display:'flex',flexDirection:'column',gap:18,maxWidth:820,margin:'0 auto',width:'100%'}}>
      <BalanceHeader/>

      {/* Tabs */}
      <div style={{display:'flex',gap:6,justifyContent:'center',borderBottom:'1px solid var(--line)'}}>
        {tabs.map(t => (
          <button key={t} onClick={()=>setTab(t)} className="mono" style={{padding:'10px 16px',fontSize:11,letterSpacing:'.1em',color:tab===t?'var(--text)':'var(--text-3)',borderBottom:tab===t?'2px solid var(--text)':'2px solid transparent',marginBottom:-1}}>
            {t}
          </button>
        ))}
      </div>

      {/* 4 stat cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
        <Card pad={14} style={{background:'var(--panel-2)'}}>
          <div className="mono" style={{fontSize:9,color:'var(--text-3)',display:'flex',justifyContent:'space-between'}}>SAVINGS <span>NAVI ↗</span></div>
          <div style={{color:'var(--green)',fontSize:22,marginTop:10,letterSpacing:'-.02em'}}>$32.01</div>
          <div style={{fontSize:11,color:'var(--text-3)',marginTop:4}}>4.0% APY</div>
          <div style={{fontSize:11,color:'var(--text-3)'}}>$0.0035/day</div>
        </Card>
        <Card pad={14} style={{background:'var(--panel-2)'}}>
          <div className="mono" style={{fontSize:9,color:'var(--text-3)',display:'flex',justifyContent:'space-between'}}>HEALTH <span>Simulate ↗</span></div>
          <div style={{color:'var(--green)',fontSize:22,marginTop:10,letterSpacing:'-.02em'}}>54974.2</div>
          <div style={{fontSize:11,color:'var(--text-3)',marginTop:4}}>$0.00 debt</div>
          <div style={{fontSize:11,color:'var(--text-3)'}}>No liquidation risk</div>
        </Card>
        <Card pad={14} style={{background:'var(--panel-2)'}}>
          <div className="mono" style={{fontSize:9,color:'var(--text-3)',display:'flex',justifyContent:'space-between'}}>ACTIVITY (30D) <span>Heatmap ↗</span></div>
          <div style={{fontSize:22,marginTop:10,letterSpacing:'-.02em'}}>20+</div>
          <div style={{fontSize:11,color:'var(--text-3)',marginTop:4}}>transactions</div>
        </Card>
        <Card pad={14} style={{background:'var(--panel-2)'}}>
          <div className="mono" style={{fontSize:9,color:'var(--text-3)',display:'flex',justifyContent:'space-between'}}>SPENDING <span>Breakdown ↗</span></div>
          <div style={{fontSize:22,marginTop:10,letterSpacing:'-.02em'}}>—</div>
          <div style={{fontSize:11,color:'var(--text-3)',marginTop:4}}>40+ services</div>
          <div style={{fontSize:11,color:'var(--text-3)'}}>This month</div>
        </Card>
      </div>

      {/* Allocation */}
      <div>
        <div className="mono" style={{fontSize:10,color:'var(--text-3)',marginBottom:10}}>ALLOCATION</div>
        {(() => {
          const alloc = [
            {k:'usdc', l:'Wallet USDC', pct:67, color:'var(--text)'},
            {k:'sui',  l:'SUI',         pct:3,  color:'var(--blue)'},
            {k:'navi', l:'NAVI Savings',pct:29, color:'var(--green)'},
            {k:'other',l:'Other',       pct:1,  color:'#8866FF'},
          ];
          const [hov, setHov] = [tab==='OVERVIEW' && allocHover, setAllocHover];
          return (
            <>
              <div style={{display:'flex',height:8,borderRadius:4,overflow:'hidden',background:'var(--line)'}}>
                {alloc.map(a => (
                  <div key={a.k}
                    onMouseEnter={()=>setAllocHover(a.k)}
                    onMouseLeave={()=>setAllocHover(null)}
                    style={{width:`${a.pct}%`,background:a.color,opacity: allocHover && allocHover!==a.k ? .25 : 1,transition:'opacity .15s'}}/>
                ))}
              </div>
              <div style={{display:'flex',gap:16,flexWrap:'wrap',marginTop:10,fontSize:11,color:'var(--text-2)'}}>
                {alloc.map(a => (
                  <span key={a.k}
                    onMouseEnter={()=>setAllocHover(a.k)}
                    onMouseLeave={()=>setAllocHover(null)}
                    style={{opacity: allocHover && allocHover!==a.k ? .35 : 1,transition:'opacity .15s',cursor:'default'}}>
                    <span style={{display:'inline-block',width:8,height:8,background:a.color,borderRadius:'50%',marginRight:6}}/>{a.l} {a.pct}%
                  </span>
                ))}
              </div>
            </>
          );
        })()}
      </div>

      {/* Holdings */}
      <div>
        <div className="mono" style={{fontSize:10,color:'var(--text-3)',marginBottom:10}}>HOLDINGS</div>
        <Card pad={0} style={{background:'var(--panel-2)'}}>
          {[
            {sym:'SUI', qty:'4.0748', usd:'$3.86'},
            {sym:'USDC', qty:'74.34', usd:'$74.34'},
            {sym:'MANIFEST', qty:'2855.0241', usd:'$1.32'},
          ].map((h,i,arr) => (
            <div key={h.sym} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',borderBottom:i<arr.length-1?'1px solid var(--line)':'none'}}>
              <span style={{fontSize:14}}>{h.sym}</span>
              <div style={{textAlign:'right'}}>
                <div style={{fontFamily:'var(--font-mono)',fontSize:14}}>{h.qty}</div>
                <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text-3)'}}>{h.usd}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* Savings positions */}
      <div>
        <div className="mono" style={{fontSize:10,color:'var(--text-3)',marginBottom:10}}>SAVINGS POSITIONS</div>
        <Card pad={0} style={{background:'var(--panel-2)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px'}}>
            <span style={{fontSize:14}}>NAVI Protocol</span>
            <div style={{textAlign:'right'}}>
              <div style={{fontFamily:'var(--font-mono)',fontSize:14}}>$32.01</div>
              <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--green)'}}>4.0% APY</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Interactive tools */}
      <div>
        <div className="mono" style={{fontSize:10,color:'var(--text-3)',marginBottom:10}}>INTERACTIVE TOOLS</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          {[
            {cat:'ANALYTICS', title:'Net worth timeline', sub:'Wallet / savings / debt over time', r:'7D 30D 90D 1Y →'},
            {cat:'SIMULATOR', title:'Yield projector', sub:'Simulate compound returns', r:'Adjust amount + APY →'},
            {cat:'ANALYTICS', title:'Spending breakdown', sub:'Categorized across services', r:'This month →'},
            {cat:'SIMULATOR', title:'Health simulator', sub:'Test borrow scenarios', r:'Debt + collateral →'},
          ].map((t,i)=>(
            <Card key={i} pad={14} style={{background:'var(--panel-2)'}}>
              <div className="mono" style={{fontSize:9,color:'var(--text-3)'}}>{t.cat}</div>
              <div style={{fontSize:14,marginTop:6}}>{t.title}</div>
              <div style={{fontSize:12,color:'var(--text-3)',marginTop:2}}>{t.sub}</div>
              <div className="mono" style={{fontSize:9,color:'var(--text-3)',marginTop:14,letterSpacing:'.12em'}}>{t.r}</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
window.Portfolio = Portfolio;
