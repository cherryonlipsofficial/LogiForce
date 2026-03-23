import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const MainLayout = ({ children }) => {
  const location = useLocation();
  const page = location.pathname.split('/')[1] || 'dashboard';

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <Topbar page={page} />
      <main
        style={{
          marginLeft: 'var(--sidebar-w)',
          marginTop: 'var(--topbar-h)',
          flex: 1,
          padding: 24,
          minHeight: 'calc(100vh - var(--topbar-h))',
          background: 'var(--bg)',
        }}
      >
        {children}
      </main>
    </div>
  );
};

export default MainLayout;
