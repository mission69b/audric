// sidebar.jsx
const Sidebar = ({ route, setRoute, collapsed, setCollapsed }) => {
  const nav = [
    { id:'dashboard', label:'DASHBOARD', icon:'dashboard' },
    { id:'portfolio', label:'PORTFOLIO', icon:'portfolio' },
    { id:'activity',  label:'ACTIVITY',  icon:'activity', badge:true },
    { id:'pay',       label:'PAY',       icon:'pay' },
    { id:'goals',     label:'GOALS',     icon:'goals' },
    { id:'contacts',  label:'CONTACTS',  icon:'contacts' },
    { id:'store',     label:'STORE',     icon:'store', tag:'SOON' },
    { id:'settings',  label:'SETTINGS',  icon:'settings' },
  ];

  const recents = [
    { t:'Show me my wallet addres…', n:'10 msgs · 2h' },
    { t:'swap 1 usd to sui',          n:'6 msgs · 14h' },
    { t:'Show my activity heatmap',   n:'4 msgs · 16h' },
    { t:'save 1 usd to savings',      n:'8 msgs · 17h' },
  ];

  if (collapsed) {
    return (
      <aside style={{width:48,flex:'0 0 48px',borderRight:'1px solid var(--line)',background:'var(--panel)',display:'flex',flexDirection:'column',alignItems:'center',padding:'14px 0',gap:4}}>
        <button onClick={()=>setCollapsed(false)} style={{padding:8,color:'var(--text-2)'}}><Icon name="panel-left" size={16}/></button>
        <button onClick={()=>setRoute('dashboard')} style={{padding:8,color:'var(--text-2)'}}><Icon name="plus" size={16}/></button>
        <div style={{height:8}}/>
        {nav.map(n => (
          <button key={n.id} onClick={()=>setRoute(n.id)} style={{padding:8,color:route===n.id?'var(--text)':'var(--text-3)',position:'relative'}} title={n.label}>
            <Icon name={n.icon} size={16}/>
            {n.badge && <span style={{position:'absolute',top:8,right:6,width:5,height:5,borderRadius:'50%',background:'var(--blue)'}}/>}
          </button>
        ))}
        <div style={{marginTop:'auto'}}>
          <div style={{width:24,height:24,borderRadius:'50%',background:'linear-gradient(#555,#999,#fff)'}}/>
        </div>
      </aside>
    );
  }

  return (
    <aside style={{width:240,flex:'0 0 240px',borderRight:'1px solid var(--line)',background:'var(--panel)',display:'flex',flexDirection:'column'}}>
      {/* Brand */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px 10px'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{fontWeight:500,fontSize:15,letterSpacing:'-0.01em'}}>Audric</div>
          <Tag tone="neutral" style={{fontSize:8}}>BETA</Tag>
        </div>
        <button onClick={()=>setCollapsed(true)} style={{color:'var(--text-3)'}}><Icon name="panel-left" size={14}/></button>
      </div>

      {/* New conversation */}
      <button onClick={()=>setRoute('dashboard')} className="mono" style={{margin:'4px 12px 14px',display:'flex',alignItems:'center',gap:8,padding:'10px 10px',borderRadius:4,border:'1px solid var(--line)',background:'transparent',color:'var(--text-2)',fontSize:10,letterSpacing:'.1em'}}>
        <Icon name="plus" size={12}/> NEW CONVERSATION
      </button>

      {/* Nav */}
      <div style={{padding:'0 8px',display:'flex',flexDirection:'column',gap:2}}>
        {nav.map(n => (
          <NavRow key={n.id} {...n} active={route===n.id} onClick={()=>setRoute(n.id)}/>
        ))}
      </div>

      {/* Recents */}
      <div style={{padding:'20px 16px 8px'}}>
        <div className="mono" style={{fontSize:9,color:'var(--text-3)',letterSpacing:'.1em',marginBottom:10}}>RECENTS</div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {recents.map((r,i) => (
            <button key={i} style={{textAlign:'left',padding:'4px 2px'}}>
              <div style={{fontSize:12,color:'var(--text-2)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.t}</div>
              <div className="mono" style={{fontSize:9,color:'var(--text-3)',marginTop:2}}>{r.n}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{marginTop:'auto',padding:14,borderTop:'1px solid var(--line)',display:'flex',alignItems:'center',gap:10}}>
        <div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#3CC14E,#288034)',display:'grid',placeItems:'center',fontSize:11,color:'#fff',fontWeight:600}}>F</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,color:'var(--text-2)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>funkiirabu@gmail.com</div>
          <div className="mono" style={{fontSize:9,color:'var(--text-3)',marginTop:2}}>0x7f20…f6dc</div>
        </div>
      </div>
    </aside>
  );
};

window.Sidebar = Sidebar;
