import Sidebar from './Sidebar';

const MainLayout = ({ children }) => {
  return (
    <div style={styles.layout}>
      <Sidebar />
      <main style={styles.main}>
        <div style={styles.content}>{children}</div>
      </main>
    </div>
  );
};

const styles = {
  layout: {
    display: 'flex',
    minHeight: '100vh',
  },
  main: {
    flex: 1,
    marginLeft: '240px',
    background: '#f5f5f7',
    minHeight: '100vh',
  },
  content: {
    padding: '24px 32px',
  },
};

export default MainLayout;
