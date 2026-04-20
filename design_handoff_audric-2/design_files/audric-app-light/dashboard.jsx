// dashboard.jsx — main chat surface
// Three flow states:  (a) empty → greeting + chips · (b) active → task transcript · (c) drawer expanded

const ACTION_CHIPS = [
  { id:'save',   label:'SAVE',    icon:'chevron-down' },
  { id:'send',   label:'SEND',    icon:'chevron-down' },
  { id:'swap',   label:'SWAP',    icon:'chevron-down' },
  { id:'credit', label:'CREDIT',  icon:'chevron-down' },
  { id:'receive',label:'RECEIVE', icon:'chevron-down' },
  { id:'charts', label:'CHARTS',  icon:'chevron-down' },
];

const Dashboard = () => {
  const [flow, setFlow] = useState('idle'); // idle | save-drawer | swap-result
  const [draft, setDraft] = useState('');
  const [activeChip, setActiveChip] = useState(null);
  const endRef = useRef(null);

  useEffect(() => { if (endRef.current) endRef.current.scrollTop = endRef.current.scrollHeight; }, [flow]);

  const clickChip = (id) => {
    if (activeChip === id) { setActiveChip(null); setFlow('idle'); return; }
    setActiveChip(id);
    if (id === 'save') setFlow('save-drawer');
    else setFlow('idle');
  };

  const send = () => {
    const q = draft.trim().toLowerCase();
    if (!q) return;
    setDraft('');
    if (q.includes('swap')) setFlow('swap-result');
  };

  return (
    <div style={{position:'relative',height:'100%',overflow:'hidden'}}>
      <BalanceHeader/>

      {/* Fixed-center composer block — greeting above, drawer below, never jerks */}
      <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'calc(100% - 160px)',maxWidth:700,display:'flex',flexDirection:'column',alignItems:'stretch'}}>

        {/* Greeting (idle / save-drawer) — sits above composer without pushing */}
        {flow !== 'swap-result' && (
          <div style={{textAlign:'center',marginBottom:28}}>
            <div style={{fontSize:22,fontWeight:500,marginBottom:6}}>Good afternoon, funkiirabu</div>
            <div className="mono" style={{fontSize:10,color:'var(--text-3)'}}>$111 · EARNING $0.0035/DAY · 4.0% APY</div>
          </div>
        )}

        {/* Transcript (swap) — scrollable area above composer */}
        {flow === 'swap-result' && (
          <div ref={endRef} style={{position:'absolute',bottom:'calc(100% + 16px)',left:0,right:0,maxHeight:'calc(50vh - 80px)',overflow:'auto',padding:'0 4px'}}>
            <SwapTranscript/>
          </div>
        )}

        {/* Composer */}
        <div style={{background:'var(--panel)',border:'1px solid var(--line)',borderRadius:8,padding:'16px'}}>
          <input value={draft} onChange={e=>setDraft(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&send()}
            placeholder={flow==='swap-result' ? 'Ask a follow up…' : 'Ask anything…'}
            style={{width:'100%',fontSize:14,padding:'4px 0 14px',color:'var(--text)'}}/>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <button style={{color:'var(--text-3)',padding:4}}><Icon name="plus" size={16}/></button>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <button style={{color:'var(--text-3)',padding:4}}><Icon name="microphone" size={16}/></button>
              <button onClick={send} style={{width:28,height:28,borderRadius:'50%',background:draft.trim()?'var(--text)':'var(--line)',color:draft.trim()?'#fff':'var(--text-3)',display:'grid',placeItems:'center'}}>
                <Icon name="arrow-up" size={14}/>
              </button>
            </div>
          </div>
        </div>

        {/* Action chip row */}
        <div style={{display:'flex',gap:6,justifyContent:'center',marginTop:20,flexWrap:'wrap'}}>
          {ACTION_CHIPS.map(c => (
            <Pill key={c.id} active={activeChip===c.id} onClick={()=>clickChip(c.id)} icon={activeChip===c.id?'chevron-up':'chevron-down'}>
              {c.label}
            </Pill>
          ))}
          {flow === 'swap-result' && <span className="mono" style={{fontSize:10,color:'var(--text-3)',alignSelf:'center',marginLeft:6}}>NEW</span>}
        </div>

        {/* SAVE drawer — flows below without moving composer up */}
        {flow === 'save-drawer' && (
          <div style={{position:'absolute',top:'calc(100% + 12px)',left:0,right:0}}>
            <SaveDrawer onClose={()=>{ setActiveChip(null); setFlow('idle'); }}/>
          </div>
        )}
      </div>
    </div>
  );
};

const SaveDrawer = ({ onClose }) => (
  <div style={{marginTop:18,border:'1px solid var(--line-2)',borderRadius:8,background:'var(--panel-2)',overflow:'hidden'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',borderBottom:'1px solid var(--line)'}}>
      <div className="mono" style={{fontSize:10,color:'var(--text-3)'}}>SAVE</div>
      <button onClick={onClose} style={{color:'var(--text-3)'}}><Icon name="close" size={12}/></button>
    </div>
    {[
      { name:'Save USDC', sub:'pick amount → confirm → done', tag:<Tag tone="green">INSTANT</Tag> },
      { name:'Automate weekly saves', sub:'every Friday at 9am' },
      { name:'Check savings rate', sub:'live NAVI APY · ~5%' },
    ].map((row, i, arr) => (
      <button key={i} style={{width:'100%',textAlign:'left',display:'flex',alignItems:'center',gap:12,padding:'14px 16px',borderBottom: i<arr.length-1 ? '1px solid var(--line)' : 'none'}}>
        <div style={{flex:1}}>
          <div style={{fontSize:14,color:'var(--text)'}}>{row.name}</div>
          <div style={{fontSize:12,color:'var(--text-3)',marginTop:2}}>{row.sub}</div>
        </div>
        {row.tag}
        {!row.tag && <Icon name="chevron-right" size={14} color="var(--text-3)"/>}
      </button>
    ))}
  </div>
);

// Faithful recreation of the swap transcript: token-prices card, eval rationale, swap tx card, action follow-ups
const SwapTranscript = () => (
  <div style={{maxWidth:700,margin:'24px auto 0',display:'flex',flexDirection:'column',gap:14}}>
    <div className="mono" style={{fontSize:10,color:'var(--text-3)',textAlign:'center'}}>— TASK INITIATED —</div>

    {/* user bubble */}
    <div style={{alignSelf:'flex-end',background:'var(--text)',color:'#fff',padding:'8px 14px',borderRadius:999,fontSize:14}}>swap 1 usd to sui</div>

    {/* tool card: TOKEN PRICES */}
    <div>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
        <span style={{width:16,height:16,borderRadius:'50%',background:'var(--green)',display:'grid',placeItems:'center'}}><Icon name="check" size={10} color="#fff"/></span>
        <span className="mono" style={{fontSize:10,color:'var(--text-2)'}}>$ TOKEN PRICES</span>
      </div>
      <div style={{border:'1px solid var(--line)',borderRadius:8,overflow:'hidden'}}>
        <div style={{display:'flex',justifyContent:'space-between',padding:'10px 14px',background:'var(--panel-2)',borderBottom:'1px solid var(--line)'}}>
          <span className="mono" style={{fontSize:10,color:'var(--text-3)'}}>TOKEN PRICES</span>
          <span className="mono" style={{fontSize:10,color:'var(--text-3)'}}>1 TOKENS</span>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',padding:'12px 14px'}}>
          <span style={{fontSize:14}}>SUI</span>
          <span style={{fontFamily:'var(--font-mono)',fontSize:14}}>$0.966893</span>
        </div>
      </div>
      <div style={{marginTop:10,display:'flex',gap:8,alignItems:'flex-start'}}>
        <Icon name="chevron-right" size={12} color="var(--text-3)" style={{marginTop:4}}/>
        <span className="mono" style={{fontSize:10,color:'var(--text-3)'}}>HOW I EVALUATED THIS</span>
      </div>
      <div style={{marginTop:10,fontSize:13,color:'var(--text-2)',display:'flex',gap:8}}>
        <span style={{color:'var(--green)'}}>✦</span>
        <span>At $0.967/SUI, 1 USDC should get you ~1.034 SUI. Executing swap now.</span>
      </div>
      <div className="mono" style={{fontSize:9,color:'var(--text-3)',marginTop:6,marginLeft:16}}>121 TOKENS</div>
    </div>

    {/* tool card: SWAP */}
    <div style={{marginTop:4}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
        <span style={{width:16,height:16,borderRadius:'50%',background:'var(--green)',display:'grid',placeItems:'center'}}><Icon name="check" size={10} color="#fff"/></span>
        <span style={{fontSize:10}}>💱</span>
        <span className="mono" style={{fontSize:10,color:'var(--text-2)'}}>SWAP</span>
      </div>
      <div style={{border:'1px solid var(--line)',borderRadius:8,overflow:'hidden'}}>
        <div style={{padding:'10px 14px',background:'var(--panel-2)',borderBottom:'1px solid var(--line)'}}>
          <span className="mono" style={{fontSize:10,color:'var(--text-3)'}}>TRANSACTION</span>
        </div>
        <div style={{display:'flex',flexDirection:'column'}}>
          <div style={{display:'flex',justifyContent:'space-between',padding:'11px 14px'}}>
            <span style={{color:'var(--text-2)',fontSize:14}}>Sold</span>
            <span style={{fontFamily:'var(--font-mono)',fontSize:14,color:'var(--red)'}}>1.00 USDC</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',padding:'11px 14px',borderTop:'1px solid var(--line)'}}>
            <span style={{color:'var(--text-2)',fontSize:14}}>Received</span>
            <span style={{fontFamily:'var(--font-mono)',fontSize:14,color:'var(--green)'}}>1.0346 SUI</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',padding:'11px 14px',borderTop:'1px solid var(--line)'}}>
            <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--text-3)'}}>7bZfo20h…iDfeBQ</span>
            <span className="mono" style={{fontSize:10,color:'var(--blue)'}}>View on Suiscan ↗</span>
          </div>
        </div>
      </div>
      <div style={{marginTop:12,fontSize:13,color:'var(--text-2)',display:'flex',gap:8}}>
        <span style={{color:'var(--green)'}}>✦</span>
        <span>Swapped 1 USDC for 1.034624 SUI.</span>
      </div>
      <div className="mono" style={{fontSize:9,color:'var(--text-3)',marginTop:6,marginLeft:16}}>20 TOKENS</div>
    </div>

    {/* follow-up buttons */}
    <div style={{display:'flex',gap:8,justifyContent:'center',marginTop:6}}>
      <button className="mono" style={{display:'flex',alignItems:'center',gap:6,border:'1px solid var(--line-2)',borderRadius:999,padding:'7px 14px',fontSize:10,letterSpacing:'.1em',color:'var(--text-2)'}}><span>🔒</span>CHECK BALANCE</button>
      <button className="mono" style={{display:'flex',alignItems:'center',gap:6,border:'1px solid var(--line-2)',borderRadius:999,padding:'7px 14px',fontSize:10,letterSpacing:'.1em',color:'var(--text-2)'}}><span>💼</span>DEPOSIT SUI</button>
    </div>
  </div>
);

window.Dashboard = Dashboard;
