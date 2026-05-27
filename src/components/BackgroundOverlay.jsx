export default function BackgroundOverlay() {
  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{
        background:
          'linear-gradient(135deg, rgba(255,255,255,0.01), rgba(255,255,255,0))',
        zIndex: 0,
      }}
    />
  )
}
