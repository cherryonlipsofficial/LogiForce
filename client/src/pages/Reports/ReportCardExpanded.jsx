import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import DataTable from '../../components/ui/DataTable';
import Badge from '../../components/ui/Badge';
import Btn from '../../components/ui/Btn';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import { useFormatters } from '../../hooks/useFormatters';
import { exportToCSV } from '../../utils/exportXlsx';
import ReportFilters from './ReportFilters';

const FREQ_VARIANT = {
  Daily: 'danger',
  Weekly: 'warning',
  Monthly: 'info',
  'On-Demand': 'default',
  Quarterly: 'purple',
};

const ReportCardExpanded = ({ card, isExpanded, onToggle, clients, projects }) => {
  const { formatCurrency } = useFormatters();

  const now = new Date();
  const [params, setParams] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  // Build query params — only include non-empty values
  const queryParams = useMemo(() => {
    const p = {};
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v != null) p[k] = v;
    });
    return p;
  }, [params]);

  const { data: response, isLoading, isError } = useQuery({
    queryKey: ['report-card', card.id, queryParams],
    queryFn: () => card.fetchFn(queryParams),
    enabled: isExpanded && !card.placeholder,
    retry: 1,
    staleTime: 2 * 60 * 1000,
  });

  // Extract and optionally flatten data
  const rows = useMemo(() => {
    const raw = response?.data;
    if (!raw) return [];
    if (card.flattenData) return card.flattenData(raw);
    return Array.isArray(raw) ? raw : [];
  }, [response, card]);

  // Resolve column render flags into real render functions
  const resolvedColumns = useMemo(() => {
    return card.columns.map((col) => {
      if (!col.render || typeof col.render === 'function') return col;

      const flag = col.render;
      let renderFn;

      switch (flag) {
        case 'currency':
          renderFn = (val) => formatCurrency(val);
          break;
        case 'date':
          renderFn = (val) => {
            if (!val) return '—';
            const d = new Date(val);
            return d.toLocaleDateString('en-CA'); // YYYY-MM-DD
          };
          break;
        case 'datetime':
          renderFn = (val) => {
            if (!val) return '—';
            const d = new Date(val);
            const date = d.toLocaleDateString('en-CA'); // YYYY-MM-DD
            const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            return `${date} ${time}`;
          };
          break;
        case 'percent':
          renderFn = (val) => (val != null ? `${val}%` : '—');
          break;
        case 'badge':
          renderFn = (val) => <Badge variant="info">{val}</Badge>;
          break;
        case 'boolean':
          renderFn = (val) => (val ? '✓' : '✗');
          break;
        default:
          return col;
      }

      return { ...col, render: renderFn };
    });
  }, [card.columns, formatCurrency]);

  const handleExport = () => {
    exportToCSV(rows, card.columns, `${card.id}-report.csv`);
  };

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        transition: 'border-color .15s',
      }}
    >
      {/* Collapsed header — always visible */}
      <div
        onClick={onToggle}
        style={{
          padding: '16px 18px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
        onMouseEnter={(e) => (e.currentTarget.parentElement.style.borderColor = 'var(--accent)')}
        onMouseLeave={(e) => (e.currentTarget.parentElement.style.borderColor = 'var(--border)')}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{card.name}</span>
            {card.frequency && (
              <Badge variant={FREQ_VARIANT[card.frequency] || 'default'}>
                {card.frequency}
              </Badge>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4 }}>
            {card.description}
          </div>
        </div>
        <Btn small variant="ghost" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
          {isExpanded ? 'Close' : 'View'}
        </Btn>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border)' }}>
          {card.placeholder ? (
            <div style={{ padding: '24px 0' }}>
              <EmptyState
                icon="🔒"
                title="Coming soon"
                message="SIM module not yet integrated"
              />
            </div>
          ) : (
            <>
              {/* Filter bar + export */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '14px 0',
                  flexWrap: 'wrap',
                }}
              >
                <ReportFilters
                  filters={card.filters || ['year', 'month']}
                  params={params}
                  onChange={setParams}
                  clients={clients}
                  projects={projects}
                />
                <Btn small variant="ghost" onClick={handleExport} disabled={rows.length === 0}>
                  ⬇ Export CSV
                </Btn>
              </div>

              {/* Data area */}
              {isLoading ? (
                <div style={{ padding: '32px 0', display: 'flex', justifyContent: 'center' }}>
                  <LoadingSpinner size={28} />
                </div>
              ) : isError ? (
                <EmptyState
                  icon="⚠️"
                  title="Failed to load"
                  message="Could not fetch report data. Please try again."
                />
              ) : rows.length === 0 ? (
                <EmptyState
                  icon="📭"
                  title="No data"
                  message="No records found for the selected filters."
                />
              ) : (
                <DataTable
                  columns={resolvedColumns}
                  data={rows}
                  pageSize={20}
                  searchable
                  searchPlaceholder={`Search ${card.name}...`}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportCardExpanded;
