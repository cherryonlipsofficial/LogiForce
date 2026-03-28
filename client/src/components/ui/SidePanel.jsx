import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const SidePanel = ({ children, onClose, width = 480 }) => {
  const overlayRef = useRef(null);
  const { isMobile } = useBreakpoint();

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return createPortal(
    <>
      <div
        ref={overlayRef}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 99,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: isMobile ? '100vw' : width,
          maxWidth: isMobile ? '100vw' : '90vw',
          background: 'var(--surface)',
          borderLeft: isMobile ? 'none' : '1px solid var(--border)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight .2s ease',
          overflow: 'hidden',
        }}
      >
        {/* Close button for mobile */}
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px 0' }}>
            <button
              onClick={onClose}
              style={{
                background: 'var(--surface3)',
                border: '1px solid var(--border2)',
                color: 'var(--text2)',
                borderRadius: 8,
                width: 44,
                height: 44,
                fontSize: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              &times;
            </button>
          </div>
        )}
        {children}
      </div>
    </>,
    document.body
  );
};

export default SidePanel;
