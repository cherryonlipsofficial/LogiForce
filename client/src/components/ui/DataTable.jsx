import { useState, useMemo } from 'react';

const DataTable = ({
  columns,
  data = [],
  onRowClick,
  pageSize = 20,
  searchable = false,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No data found',
  footer,
  headerAction,
}) => {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const val = col.accessor ? row[col.accessor] : '';
        return String(val ?? '').toLowerCase().includes(q);
      })
    );
  }, [data, search, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const handleSort = (col) => {
    if (!col.sortable) return;
    const key = col.accessor;
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      {(searchable || headerAction) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '13px 18px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {searchable && (
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder={searchPlaceholder}
              style={{ width: 240, height: 34 }}
            />
          )}
          {headerAction && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {headerAction}
            </div>
          )}
        </div>
      )}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: 600 }}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key || col.accessor}
                  onClick={() => handleSort(col)}
                  style={{
                    padding: '9px 14px',
                    fontSize: 11,
                    color: 'var(--text3)',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    textAlign: col.align || 'left',
                    background: 'var(--surface2)',
                    cursor: col.sortable ? 'pointer' : 'default',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col.header}
                  {sortKey === col.accessor && (
                    <span style={{ marginLeft: 4 }}>
                      {sortDir === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    padding: 32,
                    textAlign: 'center',
                    color: 'var(--text3)',
                    fontSize: 13,
                  }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paged.map((row, i) => (
                <tr
                  key={row.id || row._id || i}
                  onClick={() => onRowClick?.(row)}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    cursor: onRowClick ? 'pointer' : 'default',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={(e) => {
                    if (onRowClick)
                      e.currentTarget.style.background =
                        'rgba(255,255,255,0.03)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key || col.accessor}
                      style={{
                        padding: '11px 14px',
                        fontSize: 13,
                        color: 'var(--text)',
                        textAlign: col.align || 'left',
                      }}
                    >
                      {col.render
                        ? col.render(row[col.accessor], row)
                        : row[col.accessor]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {(totalPages > 1 || footer) && (
        <div
          style={{
            padding: '10px 18px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'var(--text3)',
          }}
        >
          <span>
            Showing {page * pageSize + 1}–
            {Math.min((page + 1) * pageSize, sorted.length)} of{' '}
            {sorted.length}
          </span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                style={{
                  background: 'var(--surface3)',
                  border: '1px solid var(--border2)',
                  color: 'var(--text2)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 11,
                  opacity: page === 0 ? 0.4 : 1,
                }}
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                style={{
                  background: 'var(--surface3)',
                  border: '1px solid var(--border2)',
                  color: 'var(--text2)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 11,
                  opacity: page >= totalPages - 1 ? 0.4 : 1,
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DataTable;
