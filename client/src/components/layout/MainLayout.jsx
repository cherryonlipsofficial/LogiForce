import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const MainLayout = ({ children }) => {
  const location = useLocation();
  const page = location.pathname.split('/')[1] || 'dashboard';
  const { isMobile, isTablet, isDesktop } = useBreakpoint();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const showOverlaySidebar = isMobile || isTablet;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        isOpen={showOverlaySidebar ? sidebarOpen : true}
        onClose={() => setSidebarOpen(false)}
        overlay={showOverlaySidebar}
      />
      <Topbar
        page={page}
        onMenuToggle={() => setSidebarOpen((o) => !o)}
        showMenuButton={showOverlaySidebar}
      />
      <main
        style={{
          marginLeft: isDesktop ? 'var(--sidebar-w)' : 0,
          marginTop: 'var(--topbar-h)',
          flex: 1,
          padding: 'var(--content-padding)',
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
