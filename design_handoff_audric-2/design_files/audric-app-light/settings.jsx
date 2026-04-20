// settings.jsx — two-pane Settings w/ Passport / Safety / Memory / Goals / Contacts
const Settings = ({ setRoute }) => {
  const [sub, setSub] = useState('PASSPORT');
  const SUBS = ['PASSPORT','SAFETY','MEMORY','GOALS','CONTACTS'];

  return (
    <div style={{height:'100%',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header strip */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'18px 32px',borderBottom:'1px solid var(--line)'}}>
        <button onClick={()=>setRoute && setRoute('dashboard')} style={{display:'flex',alignItems:'center',gap:6,color:'var(--text-2)',fontSize:13}}>
          <Icon name="chevron-left" size={14}/> Back to chat
        </button>
        <span className="mono" style={{fontSize:10,color:'var(--text-2)',letterSpacing:'.2em'}}>SETTINGS</span>
      </div>

      <div style={{flex:1,display:'grid',gridTemplateColumns:'220px 1fr',overflow:'hidden'}}>
        {/* Sub-nav */}
        <aside style={{borderRight:'1px solid var(--line)',padding:'20px 14px',display:'flex',flexDirection:'column',gap:2}}>
          {SUBS.map(s => (
            <button key={s} onClick={()=>setSub(s)} className="mono" style={{
              padding:'9px 14px',textAlign:'left',
              borderRadius:999,
              background: sub===s ? 'var(--line)' : 'transparent',
              color: sub===s ? 'var(--text)' : 'var(--text-3)',
              fontSize:10,letterSpacing:'.1em'
            }}>{s}</button>
          ))}
        </aside>

        {/* Content */}
        <section style={{overflow:'auto',padding:'28px 40px'}}>
          <div style={{maxWidth:640,margin:'0 auto'}}>
            <div className="mono" style={{fontSize:10,color:'var(--text-3)',letterSpacing:'.1em',paddingBottom:10,borderBottom:'1px solid var(--line)'}}>{sub}</div>
            <div style={{paddingTop:22}}>
              {sub==='PASSPORT' && <Passport/>}
              {sub==='SAFETY' && <Safety/>}
              {sub==='MEMORY' && <Memory/>}
              {sub==='GOALS' && <GoalsSub/>}
              {sub==='CONTACTS' && <ContactsSub/>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const Passport = () => (
  <div style={{display:'flex',flexDirection:'column',gap:0}}>
    <Card pad={14} style={{background:'var(--panel-2)',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
        <Tag tone="green">ZKLOGIN</Tag>
        <span style={{fontSize:13,color:'var(--text)'}}>No seed phrase, ever</span>
      </div>
      <div style={{fontSize:12,color:'var(--text-2)',lineHeight:1.55}}>
        Your wallet is controlled by your Google login via Sui zkLogin. There is no seed phrase to lose. Sign out and sign back in any time — your wallet and funds remain.
      </div>
    </Card>

    {[
      ['Wallet address', <span style={{display:'flex',alignItems:'center',gap:8}}><span style={{fontFamily:'var(--font-mono)',fontSize:13}}>0x7f20…f6dc</span><span className="mono" style={{fontSize:9,color:'var(--text-3)',letterSpacing:'.12em',border:'1px solid var(--line)',padding:'2px 6px',borderRadius:3}}>COPY</span></span>],
      ['Network', <span style={{fontSize:13,color:'var(--text)'}}>Mainnet</span>],
      ['Sign-in session', <span style={{fontSize:13,color:'var(--text)'}}>Expires 26/04/2026 (7d)</span>],
      ['Public report', <span className="mono" style={{fontSize:10,color:'var(--text-2)',letterSpacing:'.1em'}}>VIEW REPORT →</span>],
    ].map(([k,v],i,arr) => (
      <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 0',borderBottom:i<arr.length-1?'1px solid var(--line)':'none'}}>
        <span style={{fontSize:13,color:'var(--text-2)'}}>{k}</span>
        {v}
      </div>
    ))}

    <div style={{display:'flex',gap:8,marginTop:24}}>
      <button className="mono" style={{padding:'10px 16px',borderRadius:4,border:'1px solid var(--line-2)',fontSize:10,letterSpacing:'.1em',color:'var(--text)'}}>REFRESH SESSION</button>
      <button className="mono" style={{padding:'10px 16px',borderRadius:4,border:'1px solid var(--line-2)',fontSize:10,letterSpacing:'.1em',color:'var(--text)'}}>SIGN OUT</button>
    </div>
  </div>
);

const Safety = () => (
  <div>
    <div style={{fontSize:13,color:'var(--text-2)',marginBottom:18}}>Control spending limits and transaction safety settings.</div>

    <Card pad={16} style={{background:'var(--panel-2)',marginBottom:14}}>
      <div className="mono" style={{fontSize:10,color:'var(--text-3)',letterSpacing:'.1em'}}>API USAGE — 2026-04</div>
      <div style={{fontSize:22,fontFamily:'var(--font-sans)',fontWeight:500,marginTop:8,letterSpacing:'-.01em'}}>$2.09 <span style={{fontSize:12,color:'var(--text-3)',fontFamily:'var(--font-sans)',fontWeight:400}}>across 5 calls to 2 services</span></div>
      <div style={{marginTop:14,paddingTop:14,borderTop:'1px solid var(--line)',display:'flex',flexDirection:'column',gap:8}}>
        {[{n:'lob', v:'$2.00 (2)'},{n:'fal', v:'$0.09 (3)'}].map(s => (
          <div key={s.n} style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
            <span style={{color:'var(--text-2)'}}>{s.n}</span>
            <span style={{fontFamily:'var(--font-sans)',color:'var(--text)'}}>{s.v}</span>
          </div>
        ))}
      </div>
    </Card>

    <Card pad={16} style={{background:'var(--panel-2)'}}>
      <div className="mono" style={{fontSize:10,color:'var(--text-3)',letterSpacing:'.1em'}}>DAILY API BUDGET</div>
      <div style={{fontSize:12,color:'var(--text-2)',marginTop:4,marginBottom:14}}>Maximum daily spend on MPP services</div>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontFamily:'var(--font-sans)',color:'var(--text-3)'}}>$</span>
        <input defaultValue="1" style={{width:60,padding:'8px 10px',border:'1px solid var(--line-2)',borderRadius:4,fontFamily:'var(--font-sans)',fontSize:13,background:'var(--panel)'}}/>
        <span style={{fontSize:13,color:'var(--text-3)'}}>per day</span>
      </div>
    </Card>
  </div>
);

const Memory = () => {
  const mem = [
    {t:'FACT',   d:'Set a daily spending allowance of $10 USDC'},
    {t:'GOAL',   d:'Appears to be gradually diversifying away from 100% stablecoins — now holds SUI and MANIFEST alongside USDC'},
    {t:'PATTERN',d:"Continues making small incremental deposits to NAVI savings (e.g. 'save 1 USD') — drip-saving behavior"},
    {t:'FACT',   d:'Total portfolio reached ~$111.70 USD: ~$79.33 available USDC, ~$31 in NAVI savings, ~$1.36 MANIFEST'},
    {t:'PATTERN',d:'Sends repeated small identical USDC transactions (e.g. two $0.10 txns same day) — consistent test/micro-payment behavior'},
  ];
  return (
    <div>
      <div style={{fontSize:13,color:'var(--text-2)',marginBottom:18,lineHeight:1.6}}>Audric builds a picture of your financial style as you chat — personalising advice, response length, and proactive suggestions over time.</div>

      <div className="mono" style={{fontSize:10,color:'var(--text-3)',letterSpacing:'.1em',marginBottom:10}}>FINANCIAL PROFILE</div>
      <Card pad={16} style={{background:'var(--panel-2)',marginBottom:22}}>
        <div style={{fontSize:14}}>Building profile…</div>
        <div style={{fontSize:12,color:'var(--text-3)',marginTop:8,lineHeight:1.6}}>After a few sessions you'll see inferences here — things like "prefers brief responses" or "intermediate DeFi literacy." You can correct any that are wrong.</div>
      </Card>

      <div className="mono" style={{fontSize:10,color:'var(--text-3)',letterSpacing:'.1em',marginBottom:10}}>REMEMBERED CONTEXT</div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {mem.map((m,i) => (
          <Card key={i} pad={14} style={{background:'var(--panel-2)'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
              <Tag tone={m.t==='FACT'?'neutral':m.t==='GOAL'?'green':'blue'}>{m.t}</Tag>
              <span className="mono" style={{fontSize:9,color:'var(--text-3)',letterSpacing:'.1em'}}>TODAY</span>
            </div>
            <div style={{fontSize:13,color:'var(--text)',lineHeight:1.5}}>{m.d}</div>
          </Card>
        ))}
      </div>
    </div>
  );
};

const GoalsSub = () => (
  <div>
    <div className="mono" style={{fontSize:10,color:'var(--text-3)',letterSpacing:'.1em',marginBottom:12}}>SAVINGS GOALS</div>
    <button className="mono" style={{width:'100%',padding:'14px',borderRadius:8,border:'1px solid var(--line-2)',background:'var(--panel)',fontSize:10,letterSpacing:'.1em',color:'var(--text)',marginBottom:14}}>+ NEW GOAL</button>

    {[
      {flag:'🇹🇭',t:'Trip to Thailand',eta:'BY 30 SEPT 2026',have:'$32.01 / $500.00',pct:6,togo:'$467.99 to go'},
      {flag:'💍',t:'Ring',             eta:'BY 30 AUG 2026', have:'$32.01 / $100.00',pct:32,togo:'$67.99 to go'},
    ].map((g,i)=>(
      <Card key={i} pad={14} style={{background:'var(--panel-2)',marginBottom:10}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10}}>
          <div>
            <div style={{fontSize:14,fontWeight:500}}><span style={{marginRight:6}}>{g.flag}</span>{g.t}</div>
            <div className="mono" style={{fontSize:9,color:'var(--text-3)',marginTop:3,letterSpacing:'.1em'}}>{g.eta}</div>
          </div>
          <div style={{display:'flex',gap:8,color:'var(--text-3)'}}>
            <button><Icon name="edit" size={13}/></button>
            <button><Icon name="close" size={13}/></button>
          </div>
        </div>
        <div style={{height:4,borderRadius:2,background:'var(--line)',overflow:'hidden',margin:'14px 0 10px'}}>
          <div style={{width:`${g.pct}%`,height:'100%',background:'var(--text)'}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-3)'}}>
          <span>{g.togo}</span>
          <span style={{fontFamily:'var(--font-sans)'}}>{g.pct}% · {g.have}</span>
        </div>
      </Card>
    ))}
    <div className="mono" style={{fontSize:9,color:'var(--text-3)',letterSpacing:'.1em',marginTop:20}}>GOALS TRACK YOUR TOTAL SAVINGS BALANCE ($32.01) — NOT INDIVIDUAL DEPOSITS.</div>
  </div>
);

const ContactsSub = () => (
  <div>
    <div style={{fontSize:13,color:'var(--text-2)',marginBottom:16}}>Manage saved recipients — or open the full Contacts screen.</div>
    {CONTACTS_DATA.map(c => (
      <div key={c.id} style={{display:'flex',alignItems:'center',gap:12,padding:'14px 0',borderBottom:'1px solid var(--line)'}}>
        <div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#D4D4D4,#8F8F8F)',display:'grid',placeItems:'center',fontSize:11,color:'#fff',fontWeight:600}}>{c.name[0].toUpperCase()}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:14}}>{c.name}</div>
          <div className="mono" style={{fontSize:10,color:'var(--text-3)',marginTop:2}}>{c.addr}</div>
        </div>
        <button className="mono" style={{fontSize:9,color:'var(--text-3)',letterSpacing:'.1em'}}>REMOVE</button>
      </div>
    ))}
  </div>
);

window.Settings = Settings;
