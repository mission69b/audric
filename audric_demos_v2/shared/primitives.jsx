// shared/primitives.jsx — Audric primitives lifted from the design system UI kit
const { useState, useEffect, useRef, useMemo, useCallback } = React;

const AUDRIC_ICONS = {
  plus:       `<path d="M8 3v10M3 8h10"/>`,
  drawer:     `<rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M6 3v10"/><path d="M8.5 7.5h3M8.5 9.5h3"/>`,
  'panel-left': `<rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M6 3v10"/>`,
  dashboard:  `<rect x="2.5" y="2.5" width="4.5" height="5.5" rx=".75"/><rect x="9" y="2.5" width="4.5" height="3.5" rx=".75"/><rect x="2.5" y="10" width="4.5" height="3.5" rx=".75"/><rect x="9" y="8" width="4.5" height="5.5" rx=".75"/>`,
  portfolio:  `<path d="M2.5 13V5M6 13V8M9.5 13V3M13 13V7"/><path d="M2 13.5h12"/>`,
  activity:   `<path d="M1.5 8h2.5l1.5-4 3 9 2.5-5h3.5"/>`,
  pay:        `<rect x="1.5" y="4" width="13" height="8" rx="1"/><path d="M1.5 7h13"/><path d="M4 10h2"/>`,
  goals:      `<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="1" fill="currentColor"/>`,
  contacts:   `<circle cx="6" cy="6.25" r="2.25"/><path d="M2 13.5c.5-2.25 2-3.5 4-3.5s3.5 1.25 4 3.5"/><path d="M11 5.5a2 2 0 0 1 0 4"/><path d="M11.5 10.5c1.5.25 2.5 1.25 3 3"/>`,
  store:      `<path d="M2.5 5.5h11l-.75 3.5a1 1 0 0 1-1 .75h-7.5a1 1 0 0 1-1-.75L2.5 5.5Z"/><path d="M4.5 5.5V4a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 11.5 4v1.5"/><path d="M3.5 10v3.5h9V10"/>`,
  settings:   `<circle cx="8" cy="8" r="2"/><path d="M8 1.5v1.75M8 12.75v1.75M1.5 8h1.75M12.75 8h1.75M3.5 3.5l1.25 1.25M11.25 11.25l1.25 1.25M3.5 12.5l1.25-1.25M11.25 4.75l1.25-1.25"/>`,
  microphone: `<rect x="6" y="2" width="4" height="8" rx="2"/><path d="M3.5 8a4.5 4.5 0 0 0 9 0"/><path d="M8 12.5V14"/>`,
  spinner:    `<path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5"/>`,
  'arrow-up':    `<path d="M8 13V3M4 7l4-4 4 4"/>`,
  'arrow-down':  `<path d="M8 3v10M4 9l4 4 4-4"/>`,
  'arrow-right': `<path d="M3 8h10M9 4l4 4-4 4"/>`,
  'chevron-up':    `<path d="m4 10 4-4 4 4"/>`,
  'chevron-down':  `<path d="m4 6 4 4 4-4"/>`,
  'chevron-right': `<path d="m6 4 4 4-4 4"/>`,
  'chevron-left':  `<path d="m10 4-4 4 4 4"/>`,
  close:      `<path d="m4 4 8 8M12 4l-8 8"/>`,
  check:      `<path d="M3 8.5 6.5 12 13 4.5"/>`,
  'check-circle': `<circle cx="8" cy="8" r="6"/><path d="m5.5 8 2 2 3-4"/>`,
  'external-link': `<path d="M9 3h4v4M13 3 7 9"/><path d="M13 9v3.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5H7"/>`,
  sparkle:    `<path d="M8 2v3M8 11v3M2 8h3M11 8h3M4.5 4.5l1.75 1.75M9.75 9.75 11.5 11.5M4.5 11.5l1.75-1.75M9.75 6.25 11.5 4.5"/>`,
  dot:        `<circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>`,
  search:     `<circle cx="7" cy="7" r="4"/><path d="m13 13-3-3"/>`,
  edit:       `<path d="M11 2.5 13.5 5 6 12.5 3 13l.5-3L11 2.5Z"/>`,
  send:       `<path d="M2 8 14 2l-4 12-2.5-5L2 8Z"/>`,
  bolt:       `<path d="M9 1 3 9h4l-1 6 7-9H9l1-5Z"/>`,
  copy:       `<rect x="5" y="5" width="8" height="8" rx="1"/><path d="M3 11V4a1 1 0 0 1 1-1h7"/>`,
  link:       `<path d="M9 5h2.5a3 3 0 1 1 0 6H9M7 11H4.5a3 3 0 1 1 0-6H7"/><path d="M5.5 8h5"/>`,
  lock:       `<rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/>`,
  shield:     `<path d="M8 1.5 3 3.5v4.5c0 3 2.25 5 5 6 2.75-1 5-3 5-6V3.5L8 1.5Z"/>`,
  music:      `<path d="M6 12.5V3l7-1.5v9"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="11" r="1.5"/>`,
  play:       `<path d="M5 3.5v9l7-4.5-7-4.5Z" fill="currentColor"/>`,
  pause:      `<rect x="4" y="3" width="3" height="10"/><rect x="9" y="3" width="3" height="10"/>`,
  download:   `<path d="M8 2v9M4 8l4 4 4-4M3 14h10"/>`,
  upload:     `<path d="M8 14V5M4 9l4-4 4 4M3 2h10"/>`,
  flower:     `<circle cx="8" cy="8" r="2"/><path d="M8 6V3a2 2 0 1 1 0 4M8 10v3a2 2 0 1 1 0-4M6 8H3a2 2 0 1 1 4 0M10 8h3a2 2 0 1 1-4 0"/>`,
  mail:       `<rect x="2" y="3.5" width="12" height="9" rx="1"/><path d="m2.5 4.5 5.5 4.5 5.5-4.5"/>`,
  globe:      `<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 3 4 3 6s-1 4-3 6c-2-2-3-4-3-6s1-4 3-6Z"/>`,
  google:     `<path d="M14 8.2c0-.5 0-1-.1-1.5H8v2.85h3.4a3 3 0 0 1-1.3 1.95v1.6h2.1c1.2-1.1 1.9-2.75 1.9-4.9Z" fill="#4285F4" stroke="none"/><path d="M8 14.5c1.7 0 3.2-.55 4.2-1.5l-2.1-1.6c-.6.4-1.3.65-2.1.65a3.7 3.7 0 0 1-3.5-2.55H2.4v1.65A6.5 6.5 0 0 0 8 14.5Z" fill="#34A853" stroke="none"/><path d="M4.5 9.5c-.15-.4-.2-.85-.2-1.3s.05-.9.2-1.3V5.25H2.4a6.5 6.5 0 0 0 0 5.9L4.5 9.5Z" fill="#FBBC04" stroke="none"/><path d="M8 4.6a3.5 3.5 0 0 1 2.5.95l1.85-1.85A6.3 6.3 0 0 0 8 1.9 6.5 6.5 0 0 0 2.4 5.25l2.1 1.65A3.7 3.7 0 0 1 8 4.6Z" fill="#EA4335" stroke="none"/>`,
  diamond:    `<path d="M8 2 14 8 8 14 2 8 8 2Z"/>`,
  bag:        `<path d="M3 5h10l-1 9H4L3 5Z"/><path d="M5.5 5V4a2.5 2.5 0 0 1 5 0v1"/>`,
};

const Icon = ({ name, size = 16, style, color, className }) => {
  const body = AUDRIC_ICONS[name] || AUDRIC_ICONS['dot'];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color || 'currentColor'} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className={className} style={{display:'inline-block',verticalAlign:'-0.15em',flexShrink:0,...style}} dangerouslySetInnerHTML={{__html: body}}/>
  );
};

const Tag = ({ children, tone='neutral', style }) => {
  const tones = {
    neutral:{bg:'var(--line)',fg:'var(--text-2)'},
    green:{bg:'var(--success-bg)',fg:'var(--green)'},
    red:{bg:'var(--error-bg)',fg:'var(--red)'},
    blue:{bg:'var(--info-bg)',fg:'var(--blue)'},
    yellow:{bg:'var(--warning-bg)',fg:'var(--yellow)'},
    purple:{bg:'var(--pu200)',fg:'var(--pu500)'},
    dark:{bg:'var(--n800)',fg:'#fff'},
  };
  const t = tones[tone] || tones.neutral;
  return <span className="mono" style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 7px',borderRadius:2,fontSize:9,letterSpacing:'.1em',background:t.bg,color:t.fg,...style}}>{children}</span>;
};

const Pill = ({ children, icon, active, onClick, style }) => (
  <button onClick={onClick} className="mono" style={{
    display:'inline-flex',alignItems:'center',gap:6,
    padding:'7px 14px',height:30,borderRadius:999,
    fontSize:10,letterSpacing:'.1em',
    border:`1px solid ${active?'var(--blue)':'var(--line-2)'}`,
    background: active ? 'var(--info-bg)' : 'transparent',
    color: active ? 'var(--blue)' : 'var(--text-2)',
    cursor:'pointer',
    ...style
  }}>
    {children}
    {icon && <Icon name={icon} size={10}/>}
  </button>
);

// Simulated Audric chat shell — top bar, balance, transcript scroller, then a
// flex-bottom dockArea slot (dock + composer + ribbon live INSIDE the layout, not fixed).
const ChatShell = ({ children, balance='$2,000', balanceLabel='AVAILABLE $2,000 · EARNING $11', greeting=null, dockArea=null, hero=false, heroBlock=null }) => {
  const scrollRef = useRef(null);
  // Smooth-scroll to bottom when new elements are added.
  // Watches childList only — NOT characterData, so typing animations don't
  // trigger scroll on every character. If user scrolled up, leave them alone.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let pinned = true;
    const NEAR_BOTTOM = 120;
    const updatePinned = () => {
      pinned = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    };
    const scrollDown = () => {
      if (pinned) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    };
    scrollDown();
    el.addEventListener('scroll', updatePinned, { passive: true });
    const mo = new MutationObserver(scrollDown);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      el.removeEventListener('scroll', updatePinned);
    };
  }, [hero]);
  return (
  <div style={{position:'relative',height:'100vh',display:'flex',flexDirection:'column',background:'var(--bg)',overflow:'hidden'}}>
    {/* Top bar */}
    <div className="chat-topbar" style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 22px',borderBottom:'1px solid var(--line)',background:'var(--panel-2)',flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div style={{width:22,height:22,borderRadius:'50%',background:'var(--n900)',display:'grid',placeItems:'center',color:'#fff',fontSize:11,fontFamily:'var(--font-serif)',fontWeight:500}}>A</div>
        <div style={{fontSize:15,fontWeight:500,letterSpacing:'-.01em'}}>Audric</div>
        <Tag tone="neutral" style={{fontSize:8}}>BETA</Tag>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:14}}>
        <div className="mono topbar-mainnet" style={{fontSize:9,color:'var(--text-3)'}}>SUI MAINNET</div>
        <span style={{width:6,height:6,borderRadius:'50%',background:'var(--green)'}}/>
        <div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#3CC14E,#288034)',display:'grid',placeItems:'center',fontSize:11,color:'#fff',fontWeight:600}}>F</div>
      </div>
    </div>

    {/* Balance header */}
    {balance && (
      <div className="chat-balance" style={{textAlign:'center',padding:'14px 0 4px',flexShrink:0}}>
        <div className="chat-balance-amt" style={{fontFamily:'var(--font-serif)',fontWeight:500,fontSize:36,lineHeight:1,letterSpacing:'-0.015em'}}>{balance}</div>
        <div className="mono chat-balance-label" style={{fontSize:10,color:'var(--text-3)',marginTop:6,letterSpacing:'.1em',padding:'0 14px'}}>{balanceLabel}</div>
      </div>
    )}

    {/* Transcript scroller */}
    <div ref={scrollRef} className="chat-scroll" style={{flex:1,minHeight:0,overflow:'auto',padding:'16px 24px 24px',display:'flex',flexDirection:'column',alignItems:'center'}}>
      {hero && heroBlock ? (
        heroBlock
      ) : (
        <div style={{width:'100%',maxWidth:760,display:'flex',flexDirection:'column',gap:14}}>
          {greeting}
          {children}
        </div>
      )}
    </div>

    {/* Dock area — dock + composer + ribbon live here, NOT fixed-positioned */}
    {dockArea}
  </div>
);
};

// User message bubble — chat-style with tail, right-aligned
const UserBubble = ({ children }) => (
  <div className="appear" style={{alignSelf:'flex-end',background:'var(--text)',color:'#fff',padding:'12px 18px',borderRadius:'18px 18px 4px 18px',fontSize:14,lineHeight:1.45,maxWidth:'72%',boxShadow:'0 1px 2px rgba(0,0,0,0.08)'}}>
    {children}
  </div>
);

// Audric response — markdown-y, with sparkle
const AudricLine = ({ children, style }) => (
  <div className="appear" style={{fontSize:14,color:'var(--text-2)',display:'flex',gap:8,padding:'2px 4px',...style}}>
    <span style={{color:'var(--green)',fontSize:12,marginTop:2}}>✦</span>
    <span style={{flex:1,lineHeight:1.55}}>{children}</span>
  </div>
);

// Tool call card — labelled box with title + content. Spinner -> check.
const ToolCard = ({ icon='sparkle', label, status='done', tokens, children, glyph }) => {
  const statusColor = status==='done' ? 'var(--green)' : (status==='running' ? 'var(--blue)' : 'var(--text-3)');
  return (
    <div className="appear">
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
        <span style={{width:16,height:16,borderRadius:'50%',background:statusColor,display:'grid',placeItems:'center'}}>
          {status==='running'
            ? <span className="spin" style={{display:'inline-block'}}><Icon name="spinner" size={10} color="#fff"/></span>
            : <Icon name="check" size={10} color="#fff"/>}
        </span>
        {glyph && <span style={{fontSize:11}}>{glyph}</span>}
        <span className="mono" style={{fontSize:10,color:'var(--text-2)'}}>{label}</span>
        {tokens && <span className="mono" style={{fontSize:9,color:'var(--text-3)',marginLeft:'auto'}}>{tokens}</span>}
      </div>
      <div style={{border:'1px solid var(--line)',borderRadius:8,overflow:'hidden',background:'var(--panel)'}}>
        {children}
      </div>
    </div>
  );
};

// Permission card — the big blue-bordered card the user approves
const PermissionCard = ({ title, subtitle, rows, footer, onApprove, approveLabel='APPROVE', approved=false, executing=false, executed=false, executionDetail, autoClickMs=1800 }) => {
  const [countdown,setCountdown] = useState(autoClickMs);
  const fired = useRef(false);
  // Auto-click after autoClickMs once mounted (and not already executing/executed)
  useEffect(()=>{
    if (executing || executed || approved || !onApprove || fired.current) return;
    if (!autoClickMs) return;
    const start = performance.now();
    let raf;
    const tick = () => {
      const elapsed = performance.now() - start;
      const remaining = Math.max(0, autoClickMs - elapsed);
      setCountdown(remaining);
      if (remaining <= 0) {
        if (!fired.current) { fired.current = true; onApprove(); }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  },[onApprove, executing, executed, approved, autoClickMs]);
  const pct = autoClickMs ? (1 - countdown/autoClickMs) * 100 : 0;
  return (
  <div className="appear" style={{
    border:`1.5px solid ${approved?'var(--green)':'var(--text)'}`,
    borderRadius:12,
    background:'var(--panel)',
    overflow:'hidden',
    boxShadow:approved?'none':'0 2px 0 var(--text)',
    transition:'border-color .25s ease, box-shadow .25s ease'
  }}>
    <div style={{padding:'14px 18px',borderBottom:'1px solid var(--line)',display:'flex',alignItems:'center',gap:10}}>
      <Icon name="shield" size={14} color="var(--text-2)"/>
      <div className="mono" style={{fontSize:10,color:'var(--text-2)',letterSpacing:'.12em'}}>{title}</div>
      <span className="mono" style={{marginLeft:'auto',fontSize:9,color:'var(--text-3)'}}>{subtitle}</span>
    </div>
    <div>
      {rows.map((r,i) => (
        <div key={i} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 18px',borderBottom:i<rows.length-1?'1px solid var(--line)':'none'}}>
          <span className="mono" style={{fontSize:9,color:'var(--text-3)',width:14}}>{i+1}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,color:'var(--text)'}}>{r.title}</div>
            {r.sub && <div style={{fontSize:12,color:'var(--text-3)',marginTop:3}}>{r.sub}</div>}
          </div>
          {r.right && <span className="mono" style={{fontSize:10,color:'var(--text-2)',flexShrink:0}}>{r.right}</span>}
        </div>
      ))}
    </div>
    {footer && (
      <div style={{padding:'12px 18px',background:'var(--panel-2)',borderTop:'1px solid var(--line)',display:'flex',alignItems:'center',gap:14,fontSize:12,color:'var(--text-3)'}}>
        {footer}
      </div>
    )}
    <div style={{padding:'12px 18px',display:'flex',alignItems:'center',gap:12,background:approved?'rgba(40,128,52,0.06)':'var(--panel)',position:'relative',overflow:'hidden'}}>
      {/* progress bar showing auto-click countdown */}
      {!executing && !executed && !approved && autoClickMs > 0 && (
        <div style={{position:'absolute',inset:0,pointerEvents:'none'}}>
          <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${pct}%`,background:'rgba(40,108,232,0.08)',transition:'none'}}/>
        </div>
      )}
      {executed ? (
        <div style={{flex:1,display:'flex',alignItems:'center',gap:10,color:'var(--green)',position:'relative'}}>
          <Icon name="check-circle" size={14}/>
          <span className="mono" style={{fontSize:10,letterSpacing:'.1em'}}>EXECUTED ON SUI · {executionDetail || '0.4s · GAS $0.003 SPONSORED'}</span>
        </div>
      ) : executing ? (
        <div style={{flex:1,display:'flex',alignItems:'center',gap:10,color:'var(--blue)',position:'relative'}}>
          <span className="spin" style={{display:'inline-block'}}><Icon name="spinner" size={12}/></span>
          <span className="mono pulse" style={{fontSize:10,letterSpacing:'.1em'}}>EXECUTING PAYMENT STREAM ON SUI MAINNET…</span>
        </div>
      ) : (
        <>
          <span className="mono" style={{fontSize:10,color:'var(--text-3)',flex:1,position:'relative'}}>
            GAS $0.003 · SPONSORED · ATOMIC
            {autoClickMs>0 && <span style={{marginLeft:10,color:'var(--blue)'}}>· AUTO-APPROVE IN {(countdown/1000).toFixed(1)}s</span>}
          </span>
          <button className="mono" onClick={()=>{ if(!fired.current){fired.current=true; onApprove&&onApprove();} }} style={{padding:'8px 16px',borderRadius:999,background:'var(--text)',color:'#fff',fontSize:10,letterSpacing:'.12em',position:'relative'}}>{approveLabel}</button>
        </>
      )}
    </div>
  </div>
  );
};

// "Why only Sui" callout — appears at bottom
const WhyOnlySui = ({ points }) => (
  <div className="appear" style={{
    background:'var(--n900)',color:'#fff',
    border:'1px solid var(--n700)',
    borderRadius:8,padding:'14px 18px',marginTop:8
  }}>
    <div className="mono" style={{fontSize:10,letterSpacing:'.14em',color:'var(--n400)',marginBottom:10}}>
      // WHY ONLY SUI
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {points.map((p,i) => (
        <div key={i} style={{display:'flex',gap:10,fontSize:13,color:'#fff',lineHeight:1.5}}>
          <span style={{color:'var(--g400)'}}>—</span>
          <span>{p}</span>
        </div>
      ))}
    </div>
  </div>
);

// PtbCard — shows the compiled Payment Stream (PTB) before the permission card.
// calls: [{ vendor, desc, amount }]  total: string  (e.g. "$108")
const PtbCard = ({ calls, total }) => (
  <ToolCard label="PAYMENT STREAM COMPILED · 1 PTB" status="done" tokens={`${calls.length} CALLS · ATOMIC`}>
    <div>
      {calls.map((call, i) => (
        <div key={i} style={{
          display:'flex', alignItems:'center', gap:12,
          padding:'10px 18px',
          borderBottom: i < calls.length - 1 ? '1px solid var(--line)' : 'none'
        }}>
          <span className="mono" style={{fontSize:10, color:'var(--text-3)', width:36, flexShrink:0}}>tx[{i}]</span>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:13, color:'var(--text)'}}>{call.vendor}</div>
            {call.desc && <div style={{fontSize:11, color:'var(--text-3)', marginTop:2}}>{call.desc}</div>}
          </div>
          <span className="mono" style={{fontSize:11, color:'var(--text-2)', flexShrink:0}}>{call.amount} USDC</span>
        </div>
      ))}
      <div style={{
        display:'flex', justifyContent:'space-between', alignItems:'center',
        padding:'10px 18px', background:'var(--panel-2)', borderTop:'2px solid var(--line-2)'
      }}>
        <span className="mono" style={{fontSize:9, color:'var(--text-3)', letterSpacing:'.1em'}}>ATOMIC · 1 SIGNATURE · GAS SPONSORED</span>
        <span className="mono" style={{fontSize:14, color:'var(--text)'}}>{total} USDC</span>
      </div>
    </div>
  </ToolCard>
);

// Demo footer — removed per UX direction. Component kept as no-op so existing call sites keep working.
const DemoRibbon = () => null;

// Composer (read-only — just visual). Now in-flow, not fixed.
const Composer = ({ value, placeholder='Ask anything…' }) => (
  <div style={{display:'flex',justifyContent:'center',padding:'8px 24px 8px',pointerEvents:'none'}}>
    <div style={{
      width:'100%',maxWidth:760,
      background:'var(--panel)',border:'1px solid var(--line-2)',borderRadius:16,
      padding:'12px 14px',
      boxShadow:'0 4px 24px rgba(0,0,0,0.04)',
      pointerEvents:'auto'
    }}>
      <div style={{minHeight:18,fontSize:13,color:value?'var(--text)':'var(--text-3)'}}>
        {value || placeholder}
        {value && <span className="caret"></span>}
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:6}}>
        <button style={{color:'var(--text-3)',padding:4}}><Icon name="plus" size={14}/></button>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button style={{color:'var(--text-3)',padding:4}}><Icon name="microphone" size={14}/></button>
          <button style={{width:26,height:26,borderRadius:'50%',background:'var(--text)',color:'#fff',display:'grid',placeItems:'center'}}>
            <Icon name="arrow-up" size={12}/>
          </button>
        </div>
      </div>
    </div>
  </div>
);

// Step driver — auto-advance, with manual controls. Returns step + helpers.
function useDemoSteps(steps) {
  // steps: [{ delay: ms, label?: string }]
  const [step, setStep] = useState(0);
  const timerRef = useRef(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (step >= steps.length - 1) return;
    const d = steps[step]?.delay ?? 1000;
    timerRef.current = setTimeout(() => setStep(s => s+1), d);
    return () => clearTimeout(timerRef.current);
  }, [step, paused]);

  const restart = () => { clearTimeout(timerRef.current); setStep(0); setPaused(false); };
  const advance = () => setStep(s => Math.min(s+1, steps.length-1));
  return { step, restart, advance, paused, setPaused };
}

// Type-on text — character-by-character typewriter
function useTyped(text, active, speed=22) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) { setN(0); return; }
    if (n >= text.length) return;
    const t = setTimeout(() => setN(n+1), speed);
    return () => clearTimeout(t);
  }, [active, n, text, speed]);
  useEffect(() => { if (!active) setN(0); }, [active, text]);
  return text.slice(0, n);
}

// === NEW: TaskInitiated divider — em-rule both sides ===
const TaskInitiated = () => (
  <div style={{display:'flex',alignItems:'center',gap:12,margin:'4px 0 6px'}}>
    <div style={{flex:1,height:1,background:'var(--line)'}}/>
    <span className="mono" style={{fontSize:10,color:'var(--text-3)',letterSpacing:'.16em'}}>TASK INITIATED</span>
    <div style={{flex:1,height:1,background:'var(--line)'}}/>
  </div>
);

// === NEW: ThinkingHeader — Audric "A" logo pulses while thinking, green check when done ===
const ThinkingHeader = ({ done }) => (
  <div className="appear" style={{display:'flex',alignItems:'center',gap:8,marginTop:4}}>
    {done ? (
      <span style={{width:16,height:16,borderRadius:'50%',background:'var(--green)',display:'grid',placeItems:'center',flexShrink:0}}>
        <Icon name="check" size={9} color="#fff"/>
      </span>
    ) : (
      <span className="audric-think" style={{
        width:16,height:16,borderRadius:'50%',
        background:'var(--n900)',display:'grid',placeItems:'center',
        color:'#fff',fontFamily:'var(--font-serif)',fontSize:8,
        fontWeight:500,flexShrink:0,letterSpacing:0,lineHeight:1
      }}>A</span>
    )}
    <span className={done?'mono':'mono pulse'} style={{fontSize:10,color:'var(--text-2)',letterSpacing:'.14em'}}>{done?'THOUGHT':'THINKING'}</span>
  </div>
);

// === NEW: ReasoningStream — types serif italic thought, then completes ===
// Reveals 2-3 chars per tick for smoother flow vs. 1-char-at-a-time which feels twitchy.
const ReasoningStream = ({ text, active, done, speed=22 }) => {
  const [n,setN] = useState(0);
  useEffect(()=>{
    if(!active){ setN(0); return; }
    if(done){ setN(text.length); return; }
    if(n>=text.length) return;
    const t=setTimeout(()=>setN(Math.min(n+2, text.length)),speed);
    return ()=>clearTimeout(t);
  },[active,done,n,text,speed]);
  if(!active) return null;
  return (
    <div className="appear" style={{padding:'8px 14px',borderLeft:'2px solid var(--line-2)',marginLeft:6,transition:'border-color .4s ease'}}>
      <div style={{fontSize:13,color:'var(--text-3)',lineHeight:1.55,letterSpacing:'-.005em'}}>
        {text.slice(0,n)}{!done && n<text.length && <span className="caret"></span>}
      </div>
    </div>
  );
};

// === ParallelTools — vertical list of tool rows; each lights up independently ===
// tools: [{ glyph, label, sub, finishAt, result }] — finishAt in ms relative to start
const ParallelTools = ({ tools, active, headerLabel='RUNNING TASKS IN PARALLEL' }) => {
  const [t0,setT0] = useState(null);
  const [now,setNow] = useState(0);
  useEffect(()=>{
    if(!active){ setT0(null); setNow(0); return; }
    const start=performance.now(); setT0(start);
    let raf;
    const tick=()=>{ setNow(performance.now()-start); raf=requestAnimationFrame(tick); };
    raf=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(raf);
  },[active]);
  if(!active) return null;
  const allDone = tools.every(t => now >= t.finishAt);
  return (
    <div className="appear">
      <div style={{display:'flex',alignItems:'center',gap:8,margin:'10px 0 6px'}}>
        <span style={{fontSize:12,color:'var(--text-3)'}}>⊞</span>
        <span className="mono" style={{fontSize:10,color:'var(--text-2)',letterSpacing:'.14em'}}>{headerLabel}</span>
        <span className="mono" style={{fontSize:10,color:'var(--text-3)',letterSpacing:'.1em',marginLeft:'auto'}}>
          {allDone ? `${tools.length}/${tools.length} DONE` : `${tools.filter(t=>now>=t.finishAt).length}/${tools.length}`}
        </span>
      </div>
      <div style={{
        border:'1px solid var(--line)',
        borderRadius:8,
        background:'var(--panel)',
        overflow:'hidden'
      }}>
        {tools.map((tool,i)=>{
          const done = now >= tool.finishAt;
          return (
            <div key={i} style={{
              display:'flex',alignItems:'center',gap:12,
              padding:'11px 14px',
              borderTop:i===0?'none':'1px solid var(--line)',
              transition:'background .35s ease',
              background:done?'rgba(40,128,52,0.04)':'transparent'
            }}>
              {/* glyph */}
              <span style={{fontSize:14,width:18,textAlign:'center',flexShrink:0}}>{tool.glyph}</span>
              {/* label + sub */}
              <div style={{flex:1,minWidth:0}}>
                <div className="mono" style={{fontSize:10,color:'var(--text-2)',letterSpacing:'.12em'}}>{tool.label}</div>
                <div style={{fontSize:12,color:done?'var(--text)':'var(--text-3)',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',transition:'color .25s ease'}}>
                  {done ? (tool.result || tool.sub || 'done') : (tool.sub || 'querying…')}
                </div>
              </div>
              {/* status dot */}
              <span style={{
                width:8,height:8,borderRadius:'50%',
                background:done?'var(--green)':'var(--blue)',
                flexShrink:0,
                transition:'background .25s ease'
              }} className={done?'':'pulse'}/>
              {/* status text */}
              <span className="mono" style={{
                fontSize:9,letterSpacing:'.12em',
                color:done?'var(--green)':'var(--text-3)',
                width:42,textAlign:'right',flexShrink:0
              }}>{done?'DONE':'…'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// === NEW: HowIEvaluated — accordion with token/model/latency badge ===
const HowIEvaluated = ({ tokens='75', model='AUDRIC v2.0', latency='1.4s', children, defaultOpen=true }) => {
  const [open,setOpen] = useState(defaultOpen);
  return (
    <div className="appear" style={{marginTop:6}}>
      <button onClick={()=>setOpen(!open)} className="mono" style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',color:'var(--text-3)',fontSize:10,letterSpacing:'.12em'}}>
        <Icon name={open?'chevron-down':'chevron-right'} size={10}/>
        HOW I EVALUATED THIS
        <span style={{marginLeft:8,color:'var(--text-3)'}}>· {tokens} TOKENS · {model} · {latency}</span>
      </button>
      {open && (
        <div className="appear" style={{marginTop:6,padding:'10px 14px',background:'var(--panel-2)',border:'1px solid var(--line)',borderRadius:6,fontSize:12,color:'var(--text-2)',lineHeight:1.55}}>
          {children}
        </div>
      )}
    </div>
  );
};

// === BottomActionNav — in-flow now ===
const BottomActionNav = () => {
  const items = [
    {id:'save',label:'SAVE'},{id:'send',label:'SEND'},{id:'swap',label:'SWAP'},
    {id:'credit',label:'CREDIT'},{id:'receive',label:'RECEIVE'},{id:'charts',label:'CHARTS'}
  ];
  return (
    <div style={{display:'flex',justifyContent:'center',padding:'8px 24px 0'}}>
      <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'center'}}>
        {items.map(it => (
          <button key={it.id} className="mono" style={{
            display:'inline-flex',alignItems:'center',gap:6,
            padding:'6px 12px',height:26,borderRadius:999,
            fontSize:9,letterSpacing:'.1em',
            border:'1px solid var(--line-2)',
            background:'var(--panel)',color:'var(--text-2)'
          }}>
            {it.label}<Icon name="chevron-down" size={9}/>
          </button>
        ))}
      </div>
    </div>
  );
};

// HeroComposer — centered greeting + composer + action pills shown before user has sent first message
const HeroComposer = ({ composer, showNav=true, name='maya' }) => {
  const hour = new Date().getHours();
  const tod = hour < 12 ? 'morning' : (hour < 18 ? 'afternoon' : 'evening');
  return (
    <div className="hero-composer" style={{
      flex:1,
      display:'flex',
      flexDirection:'column',
      alignItems:'center',
      justifyContent:'center',
      gap:18,
      width:'100%',
      animation:'heroFadeIn .35s ease both'
    }}>
      <div style={{textAlign:'center'}}>
        <div style={{fontFamily:'var(--font-serif)',fontSize:22,letterSpacing:'-.01em',fontWeight:500}}>Good {tod}, {name}</div>
        <div className="mono" style={{fontSize:10,color:'var(--text-3)',marginTop:8,letterSpacing:'.12em'}}>EARNING $0.0024/DAY · 8.4% APY</div>
      </div>
      <div style={{width:'100%'}}>{composer}</div>
      {showNav && <BottomActionNav/>}
    </div>
  );
};

// MainShell — wraps ChatShell, slots dockArea (nav + composer + ribbon).
// `hero` mode: before first user message, greeting + composer + nav are CENTERED in chat area.
// After first message, composer + nav dock at bottom.
const MainShell = ({ children, balance, balanceLabel, showNav=true, composer, ribbon, hero=false, name='maya' }) => (
  <ChatShell balance={balance} balanceLabel={balanceLabel} hero={hero} heroBlock={hero ? <HeroComposer composer={composer} showNav={showNav} name={name}/> : null} dockArea={
    hero ? (ribbon || null) : (
      <div style={{flexShrink:0,background:'linear-gradient(to top,var(--bg) 60%,transparent)',paddingBottom:'max(20px, env(safe-area-inset-bottom, 20px))'}}>
        {showNav && <BottomActionNav/>}
        {composer}
        {ribbon}
      </div>
    )
  }>
    {children}
  </ChatShell>
);

// === PassportIntro — returning-user unlock flow ===
// Felix already has an Audric Passport with funds. Three quick beats:
//   0: Lockscreen (Continue with Google)
//   1: Auth handshake (zkLogin proof regen)
//   2: Passport unlocked — balance materializes
//   3: Hand-off
const PassportIntro = ({ onDone, brand='Audric Passport' }) => {
  const [s, setS] = useState(0);

  useEffect(() => {
    const delays = { 0: 1700, 1: 1600, 2: 2000 };
    const d = delays[s]; if (d == null) return;
    const t = setTimeout(() => setS(x => x + 1), d);
    return () => clearTimeout(t);
  }, [s]);

  useEffect(() => {
    if (s === 3) onDone && onDone();
  }, [s, onDone]);

  const fullAddr = '0x7bZf…BQ8m';

  // Auth handshake check progression (step 1)
  const checks = [
    { l: 'JWT verified',          at: 200 },
    { l: 'Ephemeral key',         at: 600 },
    { l: 'Groth16 proof',         at: 1000 },
    { l: 'Passport unlocked',     at: 1350 },
  ];
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (s !== 1) return;
    setTick(0);
    const id = setInterval(() => setTick(t => t + 50), 50);
    return () => clearInterval(id);
  }, [s]);

  return (
    <div style={{
      position:'fixed',inset:0,background:'var(--bg)',
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      padding:'40px 24px',zIndex:200,
      transition:'opacity .4s ease',
      opacity: s>=3 ? 0 : 1,
      pointerEvents: s>=3 ? 'none' : 'auto'
    }}>
      {/* faint corner marks */}
      <div className="mono" style={{position:'absolute',top:18,left:22,fontSize:9,color:'var(--text-3)',letterSpacing:'.16em'}}>SUI MAINNET</div>
      <div className="mono" style={{position:'absolute',top:18,right:22,fontSize:9,color:'var(--text-3)',letterSpacing:'.16em'}}>AUDRIC PASSPORT</div>

      {/* Wordmark */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:36}}>
        <div style={{width:36,height:36,borderRadius:'50%',background:'var(--n900)',display:'grid',placeItems:'center',color:'#fff',fontFamily:'var(--font-serif)',fontSize:18}}>A</div>
        <div style={{fontFamily:'var(--font-serif)',fontSize:28,letterSpacing:'-.02em'}}>Audric</div>
      </div>

      {/* STEP 0 — Lockscreen (returning user) */}
      {s === 0 && (
        <div className="appear" style={{width:'100%',maxWidth:380,textAlign:'center'}}>
          <div className="mono" style={{fontSize:10,color:'var(--text-3)',letterSpacing:'.14em',marginBottom:10}}>WELCOME BACK</div>
          <div style={{fontFamily:'var(--font-serif)',fontSize:32,lineHeight:1.15,letterSpacing:'-.015em',marginBottom:14}}>Unlock your Passport.</div>
          <div style={{fontSize:13,color:'var(--text-3)',marginBottom:24,lineHeight:1.55}}>
            One tap to sign in. Your {brand} stays on-device — no seed phrase, no extension.
          </div>

          {/* Recognized account chip */}
          <div style={{
            display:'flex',alignItems:'center',gap:12,
            border:'1px solid var(--line)',borderRadius:10,padding:'10px 14px',
            background:'var(--panel)',marginBottom:14,textAlign:'left'
          }}>
            <div style={{width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#3CC14E,#288034)',display:'grid',placeItems:'center',color:'#fff',fontSize:13,fontWeight:600}}>F</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,color:'var(--text)'}}>Felix</div>
              <div style={{fontSize:11,color:'var(--text-3)'}}>felix@gmail.com</div>
            </div>
            <span className="mono" style={{fontSize:9,color:'var(--text-3)',letterSpacing:'.12em'}}>RECOGNIZED</span>
          </div>

          <button onClick={()=>setS(1)} style={{
            width:'100%',padding:'14px 18px',borderRadius:8,background:'var(--text)',color:'#fff',
            display:'flex',alignItems:'center',justifyContent:'center',gap:10,fontSize:14
          }}>
            <svg width="16" height="16" viewBox="0 0 18 18"><path fill="#fff" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.79 2.72v2.26h2.9c1.7-1.56 2.69-3.86 2.69-6.62z"/><path fill="#fff" opacity=".75" d="M9 18c2.43 0 4.47-.8 5.95-2.18l-2.9-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.91v2.33A9 9 0 0 0 9 18z"/><path fill="#fff" opacity=".55" d="M3.96 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.28-1.71V4.96H.91A9 9 0 0 0 0 9c0 1.45.35 2.83.91 4.04l3.05-2.33z"/><path fill="#fff" opacity=".35" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .91 4.96l3.05 2.33C4.67 5.16 6.66 3.58 9 3.58z"/></svg>
            <span>Continue with Google</span>
          </button>
          <div className="mono" style={{fontSize:9,color:'var(--text-3)',marginTop:14,letterSpacing:'.12em'}}>
            ⚡ ZKLOGIN · NO PRIVATE KEY EVER LEAVES YOUR DEVICE
          </div>
        </div>
      )}

      {/* STEP 1 — Auth handshake (compact, ordered checks) */}
      {s === 1 && (
        <div className="appear" style={{width:'100%',maxWidth:380,textAlign:'center'}}>
          <div className="mono" style={{fontSize:10,color:'var(--text-3)',letterSpacing:'.16em',marginBottom:10}}>ZKLOGIN HANDSHAKE</div>
          <div style={{fontFamily:'var(--font-serif)',fontSize:24,lineHeight:1.2,letterSpacing:'-.01em',marginBottom:22}}>Verifying it's you.</div>

          <div style={{
            border:'1px solid var(--line)',borderRadius:10,background:'var(--panel)',
            padding:'14px 18px',display:'flex',flexDirection:'column',gap:10,textAlign:'left'
          }}>
            {checks.map((c,i)=>{
              const done = tick > c.at;
              const active = !done && tick > (i===0 ? 0 : checks[i-1].at);
              return (
                <div key={c.l} style={{display:'flex',alignItems:'center',gap:10,opacity: done||active?1:0.4,transition:'opacity .2s'}}>
                  <span style={{
                    width:16,height:16,borderRadius:'50%',display:'grid',placeItems:'center',
                    background: done ? 'rgba(40,128,52,0.10)' : 'transparent',
                    border: done ? '1px solid var(--green)' : '1px solid var(--line-2)'
                  }}>
                    {done && <Icon name="check" size={10} color="var(--green)"/>}
                    {active && <span className="spin" style={{width:10,height:10,border:'1.5px solid var(--line-2)',borderTopColor:'var(--text-2)',borderRadius:'50%'}}/>}
                  </span>
                  <span className="mono" style={{fontSize:10,letterSpacing:'.12em',color: done ? 'var(--text-2)' : active ? 'var(--text-2)' : 'var(--text-3)'}}>
                    {c.l.toUpperCase()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* progress hairline */}
          <div style={{height:2,background:'var(--line)',marginTop:18,borderRadius:2,overflow:'hidden'}}>
            <div style={{height:'100%',background:'var(--text)',width:`${Math.min(100, (tick/1500)*100)}%`,transition:'width .12s linear'}}/>
          </div>
        </div>
      )}

      {/* STEP 2 — Passport unlocked, balance materializes */}
      {s === 2 && (
        <div className="appear" style={{width:'100%',maxWidth:420,textAlign:'center'}}>
          <div className="mono" style={{fontSize:10,color:'var(--green)',letterSpacing:'.16em',marginBottom:10}}>✓ PASSPORT UNLOCKED</div>
          <div style={{fontFamily:'var(--font-serif)',fontSize:28,lineHeight:1.15,letterSpacing:'-.015em',marginBottom:22}}>Welcome back, Felix.</div>

          <div style={{
            border:'1px solid var(--line)',borderRadius:10,background:'var(--panel)',
            padding:'18px 20px',textAlign:'left',display:'flex',flexDirection:'column',gap:14
          }}>
            {/* identity row */}
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,#3CC14E,#288034)',display:'grid',placeItems:'center',color:'#fff',fontSize:14,fontWeight:600}}>F</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,color:'var(--text)'}}>felix@gmail.com</div>
                <div className="mono" style={{fontSize:10,color:'var(--text-3)',letterSpacing:'.08em',marginTop:2}}>{fullAddr}</div>
              </div>
              <Tag tone="green" style={{fontSize:8}}>ZK</Tag>
            </div>

            <div style={{height:1,background:'var(--line)'}}/>

            {/* balance — the value materializes here, resolving the contradiction */}
            <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between'}}>
              <div className="mono" style={{fontSize:9,color:'var(--text-3)',letterSpacing:'.14em'}}>AVAILABLE</div>
              <div style={{fontFamily:'var(--font-serif)',fontSize:32,letterSpacing:'-.01em',color:'var(--text)'}}>$2,000</div>
            </div>
            <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginTop:-8}}>
              <div className="mono" style={{fontSize:9,color:'var(--text-3)',letterSpacing:'.14em'}}>EARNING · NAVI 8.4%</div>
              <div style={{fontFamily:'var(--font-serif)',fontSize:16,color:'var(--text-2)'}}>+ $11.42</div>
            </div>
          </div>

          <div className="mono" style={{fontSize:9,color:'var(--text-3)',letterSpacing:'.14em',marginTop:20}}>
            ENTERING AUDRIC…
          </div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, {
  AUDRIC_ICONS, Icon, Tag, Pill, ChatShell, MainShell, UserBubble, AudricLine,
  ToolCard, PermissionCard, WhyOnlySui, PtbCard, DemoRibbon, Composer,
  useDemoSteps, useTyped,
  TaskInitiated, ThinkingHeader, ReasoningStream, ParallelTools, HowIEvaluated, BottomActionNav,
  PassportIntro, HeroComposer
});
