// pay.jsx
const Pay = () => {
  return (
    <div style={{padding:'24px 32px',overflow:'auto',height:'100%',display:'flex',flexDirection:'column',gap:18,maxWidth:820,margin:'0 auto',width:'100%'}}>
      <BalanceHeader/>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:8}}>
        <button className="mono" style={{padding:'14px 20px',borderRadius:999,background:'var(--text)',color:'#fff',fontSize:11,letterSpacing:'.1em'}}>+ PAYMENT LINK</button>
        <button className="mono" style={{padding:'14px 20px',borderRadius:999,background:'transparent',color:'var(--text)',border:'1px solid var(--line-2)',fontSize:11,letterSpacing:'.1em'}}>+ INVOICE</button>
        <button className="mono" style={{padding:'14px 20px',borderRadius:999,background:'transparent',color:'var(--text-2)',border:'1px solid var(--line-2)',fontSize:11,letterSpacing:'.1em'}}>QR</button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
        {[
          {l:'LINKS',   v:'5',      s:'active · 5 paid'},
          {l:'INVOICES',v:'0',      s:'active · 0 overdue'},
          {l:'RECEIVED',v:'$63.30', s:'total via links + invoices', green:true},
          {l:'API SPEND',v:'—',     s:'today · 40+ services'},
        ].map(s => (
          <Card key={s.l} pad={14} style={{background:'var(--panel-2)'}}>
            <div className="mono" style={{fontSize:9,color:'var(--text-3)'}}>{s.l}</div>
            <div style={{fontSize:22,marginTop:10,letterSpacing:'-.02em',color:s.green?'var(--green)':'var(--text)'}}>{s.v}</div>
            <div style={{fontSize:11,color:'var(--text-3)',marginTop:4}}>{s.s}</div>
          </Card>
        ))}
      </div>

      <Card pad={16} style={{background:'rgba(40,128,52,0.06)',border:'1px solid rgba(40,128,52,0.3)'}}>
        <div className="mono" style={{fontSize:10,color:'var(--green)',marginBottom:8}}>WHERE YOUR INCOME GOES</div>
        <div style={{fontSize:13,color:'var(--text-2)',lineHeight:1.5,marginBottom:14}}>
          Every payment received adds to <span style={{fontFamily:'var(--font-mono)',color:'var(--text)'}}>balance.available</span> immediately. Audric then offers to save it, direct it to a goal, or leave it as working capital — your choice, one tap.
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="mono" style={{padding:'8px 14px',borderRadius:999,border:'1px solid var(--line-2)',fontSize:10,letterSpacing:'.1em',color:'var(--text)'}}>SAVE $63.30 →</button>
          <button className="mono" style={{padding:'8px 14px',borderRadius:999,border:'1px solid var(--line-2)',fontSize:10,letterSpacing:'.1em',color:'var(--text)'}}>GOAL →</button>
          <button className="mono" style={{padding:'8px 14px',borderRadius:999,border:'1px solid var(--line-2)',fontSize:10,letterSpacing:'.1em',color:'var(--text-2)'}}>KEEP</button>
        </div>
      </Card>

      <div>
        <div className="mono" style={{fontSize:10,color:'var(--text-3)',marginBottom:8}}>RECENT</div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {[
            {l:'Payment link · $5.00', s:'pay/ghsA6bk4 · active · 1d ago'},
            {l:'Payment link · $2.00', s:'pay/8xv4Umg · active · 2d ago'},
            {l:'Payment link · $0.20 received', s:'pay/eKnCeZfd · via wallet · 3d ago · sitting in wallet', tags:['VIA WALLET','SAVE IT →']},
            {l:'Payment link · $0.10 received', s:'pay/yPSZfLpD · via wallet · 3d ago · sitting in wallet', tags:['VIA WALLET','SAVE IT →']},
            {l:'Payment link · $2.00', s:'pay/Ru36uDk9 · active · 3d ago'},
            {l:'Payment link · $5.00 received', s:'pay/hef36sgv · via wallet · 3d ago · sitting in wallet', tags:['VIA WALLET','SAVE IT →']},
          ].map((r,i) => (
            <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:'var(--panel-2)',border:'1px solid var(--line)',borderRadius:8}}>
              <span style={{color:r.tags?'var(--green)':'var(--text-3)',fontSize:14}}>{r.tags?'✓':'🔗'}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:14}}>{r.l}</div>
                <div className="mono" style={{fontSize:10,color:'var(--text-3)',marginTop:3,letterSpacing:'.06em'}}>{r.s}</div>
              </div>
              {r.tags && r.tags.map((t,i) => (
                <Tag key={i} tone={i===0?'green':'neutral'} style={{fontSize:9}}>{t}</Tag>
              ))}
              <Icon name="chevron-right" size={14} color="var(--text-3)"/>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
window.Pay = Pay;
