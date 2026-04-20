// goals.jsx
const Goals = () => (
  <div style={{padding:'24px 32px',overflow:'auto',height:'100%',display:'flex',flexDirection:'column',gap:18,maxWidth:820,margin:'0 auto',width:'100%'}}>
    <BalanceHeader/>

    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div style={{fontSize:24,fontWeight:500}}>Goals</div>
      <button className="mono" style={{padding:'8px 14px',borderRadius:999,border:'1px solid var(--line-2)',background:'var(--panel-2)',color:'var(--text)',fontSize:10,letterSpacing:'.1em',display:'flex',gap:6,alignItems:'center'}}>
        <Icon name="plus" size={11}/> NEW GOAL
      </button>
    </div>

    <Card pad={16} style={{background:'var(--panel-2)'}}>
      <div className="mono" style={{fontSize:10,color:'var(--text-3)'}}>TOTAL SAVINGS</div>
      <div style={{fontFamily:'var(--font-serif)',fontWeight:500,fontSize:32,lineHeight:1,marginTop:6,letterSpacing:'-0.01em'}}>$32.01</div>
    </Card>

    {[
      { flag:'🇹🇭', title:'Trip to Thailand — $500 goal', eta:'Sept 2026', have:'$32.01 of $500', pct:6, rate:'earning $0.0038/day toward goal' },
      { flag:'💍', title:'Ring — $100 goal', eta:'Aug 2025', have:'$32.01 of $100', pct:32, rate:'earning $0.0038/day toward goal' },
    ].map((g,i)=>(
      <Card key={i} pad={16} style={{background:'var(--panel-2)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
          <Tag tone="green">ON TRACK</Tag>
          <span className="mono" style={{fontSize:10,color:'var(--text-3)'}}>{g.eta.toUpperCase()}</span>
        </div>
        <div style={{fontSize:17,fontWeight:500,marginBottom:6}}>{g.flag} {g.title}</div>
        <div style={{fontSize:12,color:'var(--text-3)',marginBottom:12}}>{g.have} · {g.pct}% · {g.rate}</div>
        <div style={{height:4,borderRadius:2,background:'var(--line)',overflow:'hidden',marginBottom:16}}>
          <div style={{width:`${g.pct}%`,height:'100%',background:'var(--green)'}}/>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="mono" style={{padding:'9px 16px',borderRadius:999,background:'var(--text)',color:'var(--on-text)',fontSize:10,letterSpacing:'.1em'}}>SAVE TOWARD GOAL</button>
          <button className="mono" style={{padding:'9px 16px',borderRadius:999,background:'transparent',color:'var(--text)',border:'1px solid var(--line-2)',fontSize:10,letterSpacing:'.1em'}}>EDIT</button>
          <button className="mono" style={{padding:'9px 16px',borderRadius:999,background:'transparent',color:'var(--blue)',border:'1px solid rgba(9,104,246,0.35)',fontSize:10,letterSpacing:'.1em'}}>CHECK PACE →</button>
        </div>
      </Card>
    ))}

    <div>
      <div className="mono" style={{fontSize:10,color:'var(--text-3)',marginBottom:8}}>MORE GOAL TYPES</div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {[
          {i:'💎', t:'Wealth goal', s:'Track total portfolio value — savings + wallet'},
          {i:'💰', t:'Earning goal', s:'Track yield earned + store revenue'},
        ].map((g,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:'var(--panel-2)',border:'1px solid var(--line)',borderRadius:8}}>
            <span style={{fontSize:18}}>{g.i}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:14}}>{g.t}</div>
              <div style={{fontSize:12,color:'var(--text-3)',marginTop:2}}>{g.s}</div>
            </div>
            <span className="mono" style={{fontSize:9,color:'var(--text-3)'}}>SOON</span>
          </div>
        ))}
      </div>
    </div>

    <Card pad={14} style={{background:'transparent',border:'1px dashed var(--line-2)'}}>
      <div className="mono" style={{fontSize:10,color:'var(--text-3)'}}>NEW GOAL</div>
      <div style={{fontSize:13,color:'var(--text-2)',marginTop:6}}>"Save $500 for a trip by August" — tell Audric to create one →</div>
    </Card>
  </div>
);
window.Goals = Goals;
