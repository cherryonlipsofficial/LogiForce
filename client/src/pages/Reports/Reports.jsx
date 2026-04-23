import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { getClients } from '../../api/clientsApi';
import { getProjects } from '../../api/projectsApi';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { TABS, REPORT_CARDS } from './reportCards';
import ReportTabs from './ReportTabs';
import ReportCardExpanded from './ReportCardExpanded';

const Reports = () => {
  const { hasPermission } = useAuth();
  const { isMobile } = useBreakpoint();
  const [activeTab, setActiveTab] = useState(null);
  const [expandedCardId, setExpandedCardId] = useState(null);

  // ── Determine which tabs are visible based on permissions ──
  const visibleTabs = useMemo(() => {
    return TABS.filter(tab => {
      const hasTabPerm = REPORT_CARDS
        .filter(c => c.tab === tab.id)
        .some(c => hasPermission(c.permission));
      const hasAltPerm = tab.altPerm ? hasPermission(tab.altPerm) : false;
      return hasTabPerm || hasAltPerm;
    }).map(t => t.id);
  }, [hasPermission]);

  // Auto-select first visible tab
  useState(() => {
    if (visibleTabs.length > 0 && !activeTab) {
      setActiveTab(visibleTabs[0]);
    }
  });

  // Update activeTab if it's not visible (e.g. on first render)
  const currentTab = visibleTabs.includes(activeTab) ? activeTab : visibleTabs[0] || null;

  // ── Cards for the active tab, filtered by permission ──
  const visibleCards = useMemo(() => {
    return REPORT_CARDS.filter(
      c => c.tab === currentTab && hasPermission(c.permission)
    );
  }, [currentTab, hasPermission]);

  // ── Shared data: clients & projects for filter dropdowns ──
  const { data: clientsData } = useQuery({
    queryKey: ['reports-hub-clients'],
    queryFn: () => getClients({ limit: 1000 }),
    staleTime: 5 * 60 * 1000,
  });
  const clients = clientsData?.data || [];

  const { data: projectsData } = useQuery({
    queryKey: ['reports-hub-projects'],
    queryFn: () => getProjects({ limit: 1000 }),
    staleTime: 5 * 60 * 1000,
  });
  const projects = projectsData?.data || [];

  const handleToggle = (cardId) => {
    setExpandedCardId(prev => prev === cardId ? null : cardId);
  };

  if (visibleTabs.length === 0) {
    return (
      <div className="page-enter" style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text2)' }}>No reports available</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>Contact your administrator to get report access.</div>
      </div>
    );
  }

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Reports</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            {visibleCards.length} report{visibleCards.length !== 1 ? 's' : ''} available
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <ReportTabs
        tabs={TABS}
        activeTab={currentTab}
        onTabChange={(id) => { setActiveTab(id); setExpandedCardId(null); }}
        visibleTabs={visibleTabs}
      />

      {/* Report cards for active tab */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibleCards.map(card => (
          <ReportCardExpanded
            key={card.id}
            card={card}
            isExpanded={expandedCardId === card.id}
            onToggle={() => handleToggle(card.id)}
            clients={clients}
            projects={projects}
          />
        ))}
      </div>

      {visibleCards.length === 0 && currentTab && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          No reports available in this category. Contact your administrator.
        </div>
      )}
    </div>
  );
};

export default Reports;
