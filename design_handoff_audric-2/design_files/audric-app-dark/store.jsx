// store.jsx — Audric Store: create AI-generated products, list on market
const Store = () => {
  const products = [
    {i:'🎨', t:'AI Art packs',     s:'Stability AI · 5-10 pieces · $5-$20 USDC · sync'},
    {i:'👕', t:'T-shirts + merch', s:'AI art → Printful · $25-$45 USDC · sync'},
    {i:'📝', t:'Prompt packs',     s:'50 curated prompts · $3-$10 USDC · sync'},
    {i:'📖', t:'Short guides + ebooks', s:'Claude + PDFShift · $5-$15 USDC · sync'},
    {i:'💌', t:'Greeting cards',   s:'AI art → Lob prints → mails · $6-$15 USDC · sync'},
  ];
  const soon = [
    {i:'🎵', t:'AI Music',           s:'Suno · ~2 min · $5-$15 USDC'},
    {i:'🎬', t:'Music videos + ads', s:'Runway · 15-60s · $15-$50 USDC'},
    {i:'🎭', t:'Avatar explainer videos', s:'Heygen · from script · $15-$50 USDC'},
  ];

  return (
    <div style={{padding:'24px 32px',overflow:'auto',height:'100%',display:'flex',flexDirection:'column',gap:18,maxWidth:820,margin:'0 auto',width:'100%'}}>
      <BalanceHeader/>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
        <div>
          <div style={{fontSize:22,fontWeight:500}}>Audric Store</div>
          <div style={{fontSize:12,color:'var(--text-3)',marginTop:4}}>Generate · list · earn USDC · 8% platform fee</div>
        </div>
        <button className="mono" style={{padding:'10px 16px',borderRadius:999,background:'var(--panel)',border:'1px solid var(--line-2)',color:'var(--text)',fontSize:10,letterSpacing:'.1em',display:'flex',alignItems:'center',gap:6}}>CREATE + LIST <Icon name="chevron-right" size={11}/></button>
      </div>

      <div style={{background:'var(--panel-2)',border:'1px solid var(--line)',borderRadius:8,padding:'14px 16px',textAlign:'center',fontSize:12,color:'var(--text-3)'}}>
        No sales yet. Create your first product and start earning USDC.
      </div>

      <div>
        <div className="mono" style={{fontSize:10,color:'var(--text-3)',letterSpacing:'.1em',marginBottom:10}}>CREATE NEW — AVAILABLE NOW</div>
        <div style={{display:'flex',flexDirection:'column',gap:4}}>
          {products.map((p,i)=>(
            <button key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'transparent',borderBottom:'1px solid var(--line)',textAlign:'left'}}>
              <span style={{fontSize:18}}>{p.i}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:14}}>{p.t}</div>
                <div style={{fontSize:11,color:'var(--text-3)',marginTop:2}}>{p.s}</div>
              </div>
              <Icon name="chevron-right" size={14} color="var(--text-3)"/>
            </button>
          ))}
          <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px',border:'1px dashed var(--line-2)',borderRadius:8,marginTop:6}}>
            <span style={{fontSize:16,color:'var(--text-3)'}}>✦</span>
            <div style={{flex:1}}>
              <div style={{fontSize:14}}>Automate store content</div>
              <div style={{fontSize:11,color:'var(--text-3)',marginTop:2}}>Generate + list on a schedule · trust ladder applies</div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="mono" style={{fontSize:10,color:'var(--text-3)',letterSpacing:'.1em',marginBottom:10}}>COMING PHASE 5 — ASYNC GENERATION</div>
        <div style={{display:'flex',flexDirection:'column'}}>
          {soon.map((p,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',opacity:.55}}>
              <span style={{fontSize:18}}>{p.i}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:14}}>{p.t}</div>
                <div style={{fontSize:11,color:'var(--text-3)',marginTop:2}}>{p.s}</div>
              </div>
              <span className="mono" style={{fontSize:9,color:'var(--text-3)',letterSpacing:'.1em'}}>SOON</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
window.Store = Store;
