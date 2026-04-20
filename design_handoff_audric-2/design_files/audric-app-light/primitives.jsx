// primitives.jsx — Audric dark-mode primitives
const { useState, useEffect, useRef, useMemo } = React;

// Inline SVG icon — small, thin stroke, currentColor
const Icon = ({ name, size = 16, style, color }) => {
  const body = AUDRIC_ICONS[name] || AUDRIC_ICONS['dot'];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color || 'currentColor'} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',...style}} dangerouslySetInnerHTML={{__html: body}}/>
  );
};

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
  spinner:    `<path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5" stroke-dasharray="2 1.5"/>`,
  'arrow-up':    `<path d="M8 13V3M4 7l4-4 4 4"/>`,
  'arrow-down':  `<path d="M8 3v10M4 9l4 4 4-4"/>`,
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
};

// Pill-style action chip (SAVE / SEND / SWAP …)
const Pill = ({ children, icon, active, onClick, style }) => {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} className="mono" style={{
      display:'inline-flex',alignItems:'center',gap:6,
      padding:'7px 14px',height:30,borderRadius:999,
      fontSize:10,letterSpacing:'.1em',
      border:`1px solid ${active?'var(--blue)':(hover?'var(--text-2)':'var(--line-2)')}`,
      background: active ? 'var(--info-bg)' : (hover ? 'var(--panel-2)' : 'transparent'),
      color: active ? 'var(--blue)' : (hover ? 'var(--text)' : 'var(--text-2)'),
      transition:'background .12s ease, color .12s ease, border-color .12s ease',
      cursor:'pointer',
      ...style
    }}>
      {children}
      {icon && <Icon name="chevron-down" size={10} style={{transform: active?'rotate(180deg)':'none',transition:'transform .15s ease'}}/>}
    </button>
  );
};

// Nav row in sidebar
const NavRow = ({ icon, label, active, badge, tag, onClick, style }) => {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} className="mono" style={{
      width:'100%',display:'flex',alignItems:'center',gap:10,
      padding:'8px 10px',borderRadius:4,
      background: active ? 'var(--line)' : (hover ? 'var(--panel)' : 'transparent'),
      color: active ? 'var(--text)' : (hover ? 'var(--text)' : 'var(--text-2)'),
      fontSize:10,letterSpacing:'.1em',textAlign:'left',
      transition:'background .12s ease, color .12s ease',
      cursor:'pointer',
      ...style
    }}>
      <Icon name={icon} size={14}/>
      <span style={{flex:1}}>{label}</span>
      {badge && <span style={{width:6,height:6,borderRadius:'50%',background:'var(--blue)'}}/>}
      {tag && <span className="mono" style={{fontSize:8,color:'var(--text-3)',letterSpacing:'.1em'}}>{tag}</span>}
    </button>
  );
};

// Tag / bubble small label
const Tag = ({ children, tone='neutral', style }) => {
  const tones = {
    neutral:{bg:'var(--line)',fg:'var(--text-2)'},
    green:{bg:'var(--success-bg)',fg:'var(--green)'},
    red:{bg:'var(--error-bg)',fg:'var(--red)'},
    blue:{bg:'var(--info-bg)',fg:'var(--blue)'},
    yellow:{bg:'var(--warning-bg)',fg:'var(--yellow)'},
  };
  const t = tones[tone];
  return <span className="mono" style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 7px',borderRadius:2,fontSize:9,letterSpacing:'.1em',background:t.bg,color:t.fg,...style}}>{children}</span>;
};

// Card chrome
const Card = ({ children, pad=16, style, title, right }) => (
  <div style={{background:'var(--panel)',border:'1px solid var(--line)',borderRadius:8,...style}}>
    {(title||right) && (
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',borderBottom:'1px solid var(--line)'}}>
        {title && <div className="mono" style={{fontSize:10,color:'var(--text-3)'}}>{title}</div>}
        {right && <div className="mono" style={{fontSize:10,color:'var(--text-3)'}}>{right}</div>}
      </div>
    )}
    <div style={{padding:pad}}>{children}</div>
  </div>
);

// Big balance header (replicates the app's signature)
const BalanceHeader = () => (
  <div style={{textAlign:'center',padding:'20px 0 16px'}}>
    <div style={{fontFamily:'var(--font-serif)',fontWeight:500,fontSize:52,lineHeight:1,letterSpacing:'-0.015em'}}>$111.53</div>
    <div className="mono" style={{fontSize:10,color:'var(--text-3)',marginTop:8,display:'flex',gap:10,justifyContent:'center'}}>
      <span>AVAILABLE $79</span><span>·</span><span>EARNING $32</span>
    </div>
  </div>
);

Object.assign(window, { Icon, Pill, NavRow, Tag, Card, BalanceHeader, AUDRIC_ICONS });
