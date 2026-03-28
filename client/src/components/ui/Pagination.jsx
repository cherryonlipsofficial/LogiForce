import { useBreakpoint } from '../../hooks/useBreakpoint';

const Pagination = ({ page, totalPages, total, pageSize, onPageChange }) => {
  const { isMobile } = useBreakpoint();
  if (!total || total <= 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  // Build page numbers to show (max 5 around current)
  const getPageNumbers = () => {
    const pages = [];
    let startPage = Math.max(1, page - 2);
    let endPage = Math.min(totalPages, page + 2);

    if (endPage - startPage < 4) {
      if (startPage === 1) {
        endPage = Math.min(totalPages, startPage + 4);
      } else {
        startPage = Math.max(1, endPage - 4);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  const pageNumbers = getPageNumbers();

  const btnStyle = (active = false, disabled = false) => ({
    background: active ? 'var(--primary, #6366f1)' : 'var(--surface3)',
    border: `1px solid ${active ? 'var(--primary, #6366f1)' : 'var(--border2)'}`,
    color: active ? '#fff' : 'var(--text2)',
    borderRadius: 6,
    padding: isMobile ? '8px 12px' : '4px 10px',
    fontSize: 11,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    minWidth: isMobile ? 40 : 28,
    minHeight: isMobile ? 40 : 'auto',
    textAlign: 'center',
  });

  return (
    <div
      style={{
        padding: isMobile ? '10px 12px' : '10px 18px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between',
        gap: isMobile ? 8 : 0,
        fontSize: 11,
        color: 'var(--text3)',
      }}
    >
      <span>
        Showing {start}–{end} of {total}
      </span>
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            style={btnStyle(false, page <= 1)}
          >
            Prev
          </button>
          {pageNumbers[0] > 1 && (
            <>
              <button onClick={() => onPageChange(1)} style={btnStyle(page === 1)}>
                1
              </button>
              {pageNumbers[0] > 2 && <span style={{ padding: '0 2px' }}>…</span>}
            </>
          )}
          {pageNumbers.map((p) => (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              style={btnStyle(p === page)}
            >
              {p}
            </button>
          ))}
          {pageNumbers[pageNumbers.length - 1] < totalPages && (
            <>
              {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && (
                <span style={{ padding: '0 2px' }}>…</span>
              )}
              <button
                onClick={() => onPageChange(totalPages)}
                style={btnStyle(page === totalPages)}
              >
                {totalPages}
              </button>
            </>
          )}
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            style={btnStyle(false, page >= totalPages)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default Pagination;
