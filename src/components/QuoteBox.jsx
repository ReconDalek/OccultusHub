import { useQuote } from '../hooks/useQuote'

export default function QuoteBox() {
  const { quote, visible } = useQuote()

  return (
    <section className="px-6 py-16 pb-28">
      <div
        className="max-w-3xl mx-auto p-10 rounded-3xl text-center text-xl italic"
        style={{ background: 'rgba(255,255,255,0.03)', color: '#d4d4d8' }}
      >
        <p style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.3s ease' }}>
          "{quote}"
        </p>
      </div>
    </section>
  )
}
