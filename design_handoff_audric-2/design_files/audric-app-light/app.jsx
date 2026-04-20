// app.jsx — router
const App = () => {
  const [route, setRoute] = useState(() => localStorage.getItem('audric:route') || 'dashboard');
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { localStorage.setItem('audric:route', route); }, [route]);

  let body;
  switch (route) {
    case 'portfolio': body = <Portfolio/>; break;
    case 'activity':  body = <Activity/>;  break;
    case 'pay':       body = <Pay/>;       break;
    case 'goals':     body = <Goals/>;     break;
    case 'contacts':  body = <Contacts/>;  break;
    case 'store':     body = <Store/>;     break;
    case 'settings':  body = <Settings setRoute={setRoute}/>; break;
    default: body = <Dashboard/>;
  }

  const hideCog = route === 'settings';

  return (
    <div style={{display:'flex',height:'100vh',background:'var(--bg)'}}>
      <Sidebar route={route} setRoute={setRoute} collapsed={collapsed} setCollapsed={setCollapsed}/>
      <main style={{flex:1,position:'relative',overflow:'hidden'}}>
        {!hideCog && (
          <button onClick={()=>setRoute('settings')} style={{position:'absolute',top:16,right:24,width:32,height:32,borderRadius:4,border:'1px solid var(--line-2)',color:'var(--text-3)',display:'grid',placeItems:'center',zIndex:2,background:'var(--panel)'}}>
            <Icon name="settings" size={15}/>
          </button>
        )}
        {body}
      </main>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
