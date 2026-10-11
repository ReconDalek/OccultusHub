export default function Modal({ onClose, children, maxWidth = 480 }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)', padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#12121a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
        padding: 24, width: '100%', maxWidth, maxHeight: '90vh', overflowY: 'auto',
      }}>
        {children}
      </div>
    </div>
  )
}
