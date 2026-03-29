import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const Modal = ({ children, onClose, title, width = 480 }) => {
  const overlayRef = useRef(null);
  const { isMobile } = useBreakpoint();

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current && onClose) onClose();
  };

  return createPortal(
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'center',
        zIndex: 200,
        animation: 'fadeIn .15s ease',
      }}
    >
      <div
        style={isMobile ? {
          background: 'var(--surface)',
          width: '100vw',
          maxWidth: '100vw',
          height: '100vh',
          maxHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        } : {
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          width,
          maxWidth: '90vw',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {title && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 500 }}>{title}</div>
            <button
              onClick={onClose}
              disabled={!onClose}
              style={{
                background: 'var(--surface3)',
                border: '1px solid var(--border2)',
                color: 'var(--text2)',
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 16,
                minHeight: 44,
                minWidth: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              &times;
            </button>
          </div>
        )}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
