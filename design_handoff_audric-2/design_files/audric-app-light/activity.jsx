// activity.jsx — grouped by day
const Activity = () => {
  const [filter, setFilter] = useState('All');
  const [hoverTx, setHoverTx] = useState(null);
  const filters = ['All','Savings','Send','Swap','Pay','Store','Autonomous'];
  const rows = [
    { label:'TODAY', items:[
      { title:'Swapped $1.00 USDC', time:'14h ago', amount:'-$1.00', tx:'7oZfeZ…1DfeBQ', kind:'swap' },
      { title:'Saved $1.00 USDC into NAVI', time:'17h ago', amount:'-$1.00', tx:'E0Y0JS…13fXAU', kind:'save' },
    ]},
    { label:'YESTERDAY', items:[
      { title:'Saved $1.00 USDC into NAVI', time:'21h ago', amount:'-$1.00', tx:'Ey7v0g…uhZian', kind:'save' },
      { title:'Swapped $1.00 USDC', time:'21h ago', amount:'-$1.00', tx:'CZeWxh…pgbxSs', kind:'swap' },
      { title:'Saved $1.00 USDC into NAVI', time:'21h ago', amount:'-$1.00', tx:'2VUhp7…08y2sp', kind:'save' },
    ]},
    { label:'FRI, APR 17', items:[
      { title:'Suggestion confirmed', time:'1d ago', amount:null, tx:'EPeW1L…GXkxB', kind:'sug' },
      { title:'Suggestion snoozed 24h', time:'1d ago', amount:null, tx:null, kind:'sug' },
    ]},
  ];
  const iconOf = kind => kind==='swap'?'⇆' : kind==='save'?'↑' : '✎';
  const colorOf = kind => kind==='swap'?'var(--blue)' : kind==='save'?'var(--green)' : 'var(--text-3)';

  return (
    <div style={{padding:'24px 32px',overflow:'auto',height:'100%',display:'flex',flexDirection:'column',gap:18,maxWidth:820,margin:'0 auto',width:'100%'}}>
      <BalanceHeader/>

      <div style={{display:'flex',gap:6,justifyContent:'center',marginTop:4,flexWrap:'wrap'}}>
        {filters.map(f => (
          <Pill key={f} active={filter===f} onClick={()=>setFilter(f)}>{f}</Pill>
        ))}
      </div>

      {rows.map(section => (
        <div key={section.label}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
            <div className="mono" style={{fontSize:10,color:'var(--text-3)',letterSpacing:'.12em'}}>{section.label}</div>
            <div style={{flex:1,height:1,background:'var(--line)'}}/>
            <div className="mono" style={{fontSize:9,color:'var(--text-3)',letterSpacing:'.1em'}}>{section.items.length} TXN</div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {section.items.map((it,i) => (
              <div key={i} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 16px',background:'var(--panel-2)',border:'1px solid var(--line)',borderRadius:8}}>
                <div style={{width:28,height:28,borderRadius:'50%',background:'var(--line)',display:'grid',placeItems:'center',color:colorOf(it.kind),fontSize:14}}>{iconOf(it.kind)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14}}>{it.title}</div>
                  <div className="mono" style={{fontSize:9,color:'var(--text-3)',marginTop:4,letterSpacing:'.08em'}}>{it.time}</div>
                  <div className="mono" style={{fontSize:9,color:'var(--text-3)',marginTop:6,display:'flex',gap:8,letterSpacing:'.1em'}}>
                    <span>EXPLAIN ›</span>
                    {it.tx && <span style={{color:'var(--blue)'}}>SUISCAN ↗</span>}
                  </div>
                </div>
                {it.amount && <div style={{fontFamily:'var(--font-mono)',fontSize:13,color:'var(--red)'}}>{it.amount}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
window.Activity = Activity;
