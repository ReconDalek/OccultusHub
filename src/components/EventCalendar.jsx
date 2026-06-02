import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../config/api'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function EventCalendar() {
  const [events, setEvents] = useState([])
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(null)

  useEffect(() => {
    const token = localStorage.getItem('occultusSession')
    fetch(`${API_BASE_URL}/api/events`, {
      headers: token ? { Authorization: token } : {},
    })
      .then((r) => r.json())
      .then((data) => setEvents(data.events || []))
      .catch(() => {})
  }, [])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const monthLabel = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })

  const eventsOnDay = (day) => {
    if (!day) return []
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return events.filter((e) => e.event_date.startsWith(dateStr))
  }

  const today = new Date()
  const isToday = (day) =>
    day &&
    today.getFullYear() === year &&
    today.getMonth() === month &&
    today.getDate() === day

  const selectedEvents = selectedDay ? eventsOnDay(selectedDay) : []

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => { setCurrentDate(new Date(year, month - 1, 1)); setSelectedDay(null) }}
          style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: '4px 8px' }}
        >
          ‹
        </button>
        <h3 className="font-cinzel" style={{ fontSize: '16px', letterSpacing: '2px' }}>
          {monthLabel.toUpperCase()}
        </h3>
        <button
          onClick={() => { setCurrentDate(new Date(year, month + 1, 1)); setSelectedDay(null) }}
          style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: '4px 8px' }}
        >
          ›
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
        {DAY_LABELS.map((d) => (
          <div key={d} style={{ textAlign: 'center', color: '#a1a1aa', fontSize: '11px', fontWeight: 500, padding: '4px 0', letterSpacing: '0.5px' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {cells.map((day, i) => {
          const dayEvents = eventsOnDay(day)
          const selected = selectedDay === day
          const todayCell = isToday(day)

          return (
            <div
              key={i}
              onClick={() => day && setSelectedDay(selected ? null : day)}
              style={{
                minHeight: '52px',
                padding: '6px',
                borderRadius: '8px',
                background: selected
                  ? 'rgba(179,18,63,0.2)'
                  : todayCell
                    ? 'rgba(109,40,217,0.15)'
                    : day
                      ? 'rgba(255,255,255,0.03)'
                      : 'transparent',
                border: selected
                  ? '1px solid #b3123f'
                  : todayCell
                    ? '1px solid rgba(109,40,217,0.4)'
                    : '1px solid transparent',
                cursor: day ? 'pointer' : 'default',
              }}
            >
              {day && (
                <>
                  <span style={{ fontSize: '13px', color: todayCell ? '#9f67ff' : '#f4f4f5', fontWeight: todayCell ? 600 : 400 }}>
                    {day}
                  </span>
                  {dayEvents.length > 0 && (
                    <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', marginTop: '5px' }}>
                      {dayEvents.slice(0, 3).map((_, idx) => (
                        <div
                          key={idx}
                          style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'linear-gradient(135deg, #b3123f, #6d28d9)' }}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <div style={{ marginTop: '14px', padding: '14px 16px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {selectedEvents.length === 0 ? (
            <p style={{ color: '#a1a1aa', fontSize: '14px', margin: 0 }}>No events on this day.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {selectedEvents.map((e) => (
                <div key={e.id}>
                  <div style={{ fontWeight: 600, fontSize: '15px' }}>{e.title}</div>
                  {e.description && (
                    <div style={{ color: '#a1a1aa', fontSize: '13px', marginTop: '3px' }}>{e.description}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
