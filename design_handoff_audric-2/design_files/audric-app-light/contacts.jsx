// contacts.jsx — 3-pane: list → detail w/ tabbed actions
const CONTACTS_DATA = [
  { id:'funkii', name:'funkii', addr:'0x40cd…3e62', verified:true, saved:true, net:'Sui mainnet', lastSent:'—', added:'—', totalSent:'—', lastTx:'—' },
  { id:'funkiirabu', name:'funkiirabu', addr:'0x10f8…4410', verified:false, saved:true, net:'Sui mainnet', lastSent:'—', added:'—', totalSent:'—', lastTx:'—' },
];

const Contacts = () => {
  const [selId, setSelId] = useState('funkii');
  const [tab, setTab] = useState('CHAT');
  const [q, setQ] = useState('');
  const sel = CONTACTS_DATA.find(c => c.id === selId) || CONTACTS_DATA[0];
  const filtered = CONTACTS_DATA.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) || c.addr.includes(q));

  return (
    <div style={{display:'grid',gridTemplateColumns:'280px 1fr',height:'100%',overflow:'hidden'}}>
      {/* List pane */}
      <aside style={{borderRight:'1px solid var(--line)',background:'var(--panel-2)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{padding:'20px 20px 10px'}}>
          <div style={{fontSize:20,fontWeight:500,marginBottom:2}}>Contacts</div>
          <div style={{fontSize:12,color:'var(--text-3)'}}>One place to manage contacts.</div>
        </div>
        <div style={{padding:'6px 16px 10px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,border:'1px solid var(--line)',borderRadius:8,padding:'8px 10px',background:'var(--panel)'}}>
            <Icon name="search" size={13} color="var(--text-3)"/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…" style={{flex:1,fontSize:13}}/>
            <span className="mono" style={{fontSize:9,color:'var(--text-3)',padding:'1px 5px',border:'1px solid var(--line)',borderRadius:2}}>/</span>
          </div>
        </div>
        <div style={{padding:'0 16px 4px',display:'flex',justifyContent:'space-between'}}>
          <span className="mono" style={{fontSize:9,color:'var(--text-3)',letterSpacing:'.1em'}}>NAME</span>
          <span className="mono" style={{fontSize:9,color:'var(--text-3)',letterSpacing:'.1em'}}>LAST SENT</span>
        </div>
        <div style={{flex:1,overflow:'auto',padding:'4px 8px'}}>
          {filtered.map(c => (
            <button key={c.id} onClick={()=>setSelId(c.id)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'10px 8px',borderRadius:8,background:selId===c.id?'var(--line)':'transparent',textAlign:'left',marginBottom:2}}>
              <div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#D4D4D4,#8F8F8F)',display:'grid',placeItems:'center',fontSize:11,color:'#fff',fontWeight:600}}>{c.name[0].toUpperCase()}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,color:'var(--text)'}}>{c.name}</div>
                <div className="mono" style={{fontSize:10,color:'var(--text-3)',marginTop:1}}>{c.addr}</div>
              </div>
              <span style={{color:'var(--text-3)',fontSize:11}}>{c.lastSent}</span>
            </button>
          ))}
          <button style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'10px 8px',borderRadius:8,textAlign:'left',color:'var(--text-2)'}}>
            <div style={{width:28,height:28,borderRadius:'50%',border:'1px dashed var(--line-2)',display:'grid',placeItems:'center'}}><Icon name="plus" size={12}/></div>
            <span style={{fontSize:13}}>Add contact</span>
          </button>
        </div>
        <div style={{padding:'10px 16px',borderTop:'1px solid var(--line)'}}>
          <span className="mono" style={{fontSize:9,color:'var(--text-3)',letterSpacing:'.1em'}}>SHOWING {filtered.length} OF {CONTACTS_DATA.length}</span>
        </div>
      </aside>

      {/* Detail pane */}
      <section style={{overflow:'auto',padding:'28px 48px'}}>
        <BalanceHeader/>
        <div style={{maxWidth:640,margin:'8px auto 0'}}>
          <div style={{textAlign:'center'}}>
            <div style={{width:64,height:64,borderRadius:'50%',background:'linear-gradient(135deg,#D4D4D4,#8F8F8F)',display:'grid',placeItems:'center',fontSize:22,color:'#fff',fontWeight:600,margin:'0 auto 12px'}}>{sel.name[0].toUpperCase()}</div>
            <div style={{fontSize:22,fontWeight:500}}>{sel.name}</div>
            <div className="mono" style={{fontSize:11,color:'var(--text-3)',marginTop:4}}>{sel.addr}</div>
            <div style={{display:'flex',gap:6,justifyContent:'center',marginTop:10}}>
              {sel.verified && <Tag tone="green">VERIFIED</Tag>}
              {sel.saved && <Tag tone="neutral">SAVED</Tag>}
            </div>
          </div>

          <button className="mono" style={{width:'100%',marginTop:20,padding:'14px 20px',borderRadius:999,background:'var(--text)',color:'#fff',fontSize:11,letterSpacing:'.1em',display:'flex',justifyContent:'center',alignItems:'center',gap:8}}>
            SEND → 
          </button>

          <div style={{marginTop:22}}>
            <div className="mono" style={{fontSize:10,color:'var(--text-3)',marginBottom:10,letterSpacing:'.1em'}}>DETAILS</div>
            {[
              ['ADDRESS', sel.addr],
              ['ADDED', sel.added],
              ['TOTAL SENT', sel.totalSent],
              ['LAST TX', sel.lastTx],
              ['NETWORK', sel.net],
            ].map(([k,v]) => (
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--line)'}}>
                <span className="mono" style={{fontSize:10,color:'var(--text-3)',letterSpacing:'.1em'}}>{k}</span>
                <span style={{fontSize:13,color:'var(--text-2)',fontFamily:k==='ADDRESS'?'var(--font-mono)':'inherit'}}>{v}</span>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{display:'flex',gap:6,marginTop:24,borderBottom:'1px solid var(--line)'}}>
            {['CHAT','SEND','ACTIVITY','NOTES'].map(t => (
              <button key={t} onClick={()=>setTab(t)} className="mono" style={{padding:'10px 16px',fontSize:10,letterSpacing:'.1em',color:tab===t?'var(--text)':'var(--text-3)',borderBottom:tab===t?'2px solid var(--text)':'2px solid transparent',marginBottom:-1}}>{t}</button>
            ))}
          </div>

          <div style={{padding:'22px 0'}}>
            {tab==='CHAT' && (
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:15,fontWeight:500}}>Start a conversation</div>
                <div style={{fontSize:12,color:'var(--text-3)',marginTop:6,marginBottom:18,maxWidth:360,marginInline:'auto'}}>Ask about {sel.name}'s transactions, send money, or get a summary of your financial history together.</div>
                <button className="mono" style={{padding:'10px 18px',borderRadius:999,border:'1px solid var(--line-2)',fontSize:10,letterSpacing:'.1em',color:'var(--text)',background:'var(--panel)'}}>VIEW HISTORY WITH {sel.name.toUpperCase()} →</button>
              </div>
            )}
            {tab==='SEND' && (
              <div>
                <div className="mono" style={{fontSize:10,color:'var(--text-3)',marginBottom:10,letterSpacing:'.1em'}}>QUICK SEND</div>
                {[
                  {t:'Send $10 USDC',s:'quick · confirm in chat',i:'$'},
                  {t:'Send $50 USDC',s:'same as last time',i:'$'},
                  {t:'Custom amount',s:"I'll ask how much",i:'%'},
                ].map((r,i)=>(
                  <button key={i} style={{width:'100%',display:'flex',alignItems:'center',gap:14,padding:'14px 16px',background:'var(--panel-2)',border:'1px solid var(--line)',borderRadius:8,marginBottom:8,textAlign:'left'}}>
                    <div style={{width:28,height:28,borderRadius:'50%',background:'var(--line)',display:'grid',placeItems:'center',fontFamily:'var(--font-sans)',fontWeight:500,fontSize:13}}>{r.i}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14}}>{r.t}</div>
                      <div style={{fontSize:12,color:'var(--text-3)',marginTop:2}}>{r.s}</div>
                    </div>
                    <Icon name="chevron-right" size={14} color="var(--text-3)"/>
                  </button>
                ))}
              </div>
            )}
            {tab==='ACTIVITY' && <div style={{textAlign:'center',color:'var(--text-3)',fontSize:13,padding:'28px 0'}}>No transactions with {sel.name} yet.</div>}
            {tab==='NOTES' && <div style={{textAlign:'center',color:'var(--text-3)',fontSize:13,padding:'28px 0'}}>No notes — click to add.</div>}
          </div>

          <button className="mono" style={{marginTop:12,padding:'8px 14px',fontSize:10,letterSpacing:'.1em',color:'var(--red)',background:'transparent'}}>REMOVE CONTACT</button>
        </div>
      </section>
    </div>
  );
};
window.Contacts = Contacts;
