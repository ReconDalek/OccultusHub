import { useState } from 'react'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_H   = 36
const BAR_H   = 19
const BAR_GAP = 3
const BAR_PAD = 4
const LINE    = 'rgba(255,255,255,0.07)'

// Monthly banner colours
const MONTHLY_COLOURS = {
  social:  { bg: 'rgba(14,140,100,0.28)',  border: 'rgba(14,140,100,0.5)',  text: '#7fffd4', dot: 'rgba(14,140,100,0.85)'  },
  faction: { bg: 'rgba(180,130,10,0.28)',  border: 'rgba(180,130,10,0.5)',  text: '#ffd966', dot: 'rgba(180,130,10,0.85)'  },
}

// Rotation colours for grid events
const GRID_COLOURS = [
  { bg: 'rgba(179,18,63,0.85)',  text: '#ffd0da' },
  { bg: 'rgba(109,40,217,0.85)', text: '#e0d0ff' },
  { bg: 'rgba(16,100,160,0.85)', text: '#c8e8ff' },
]
const gridColour = (ev) => GRID_COLOURS[ev.id % GRID_COLOURS.length]

function ds(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
function formatTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  return `${hour % 12 || 12}:${m}${hour >= 12 ? 'pm' : 'am'}`
}
function fmtDate(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

function buildWeeks(year, month) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)
  while (days.length % 7 !== 0) days.push(null)
  const weeks = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  return weeks
}

function layoutWeek(events, week, year, month) {
  const weekDates = week.map(d => d ? ds(year, month, d) : null)
  const valid = weekDates.filter(Boolean)
  if (!valid.length) return { items: [], layerCount: 0 }
  const weekStart = valid[0]
  const weekEnd   = valid[valid.length - 1]

  const raw = events
    .filter(ev => {
      const evEnd = ev.end_date || ev.start_date
      return ev.start_date <= weekEnd && evEnd >= weekStart
    })
    .map(ev => {
      const evEnd = ev.end_date || ev.start_date
      let colStart = -1, colEnd = -1
      weekDates.forEach((d, i) => {
        if (!d) return
        if (d >= ev.start_date && d <= evEnd) {
          if (colStart === -1) colStart = i
          colEnd = i
        }
      })
      if (colStart === -1) return null
      return {
        ev,
        colStart,
        colSpan: colEnd - colStart + 1,
        isStart: weekDates[colStart] === ev.start_date,
        isEnd:   weekDates[colEnd]   === evEnd,
      }
    })
    .filter(Boolean)

  raw.sort((a, b) => a.colStart - b.colStart || b.colSpan - a.colSpan)

  const layerEnds = []
  raw.forEach(item => {
    let placed = false
    for (let l = 0; l < layerEnds.length; l++) {
      if (layerEnds[l] < item.colStart) {
        layerEnds[l] = item.colStart + item.colSpan - 1
        item.layer = l
        placed = true
        break
      }
    }
    if (!placed) {
      item.layer = layerEnds.length
      layerEnds.push(item.colStart + item.colSpan - 1)
    }
  })

  return { items: raw, layerCount: layerEnds.length }
}

export default function EventCalendar({ events = [], calendarStartTime = null }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(null)

  const year  = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const weeks = buildWeeks(year, month)
  const monthLabel = currentDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`

  // Separate monthly banner events from grid events
  const socialEvent  = events.find(ev => ev.category === 'social'  && ev.start_date.startsWith(monthPrefix))
  const factionEvent = events.find(ev => ev.category === 'faction' && ev.start_date.startsWith(monthPrefix))
  const gridEvents   = events.filter(ev => ev.category !== 'social' && ev.category !== 'faction')

  const today = new Date()
  const isToday = (day) =>
    day && today.getFullYear() === year && today.getMonth() === month && today.getDate() === day

  const eventsOnDay = (day) => {
    if (!day) return []
    const d = ds(year, month, day)
    return gridEvents.filter(ev => {
      const evEnd = ev.end_date || ev.start_date
      return d >= ev.start_date && d <= evEnd
    })
  }

  const selectedEvents = selectedDay ? eventsOnDay(selectedDay) : []

  return (
    <div style={{ width: '100%', boxSizing: 'border-box', minWidth: 0 }}>

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <button
          onClick={() => { setCurrentDate(new Date(year, month - 1, 1)); setSelectedDay(null) }}
          style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: '4px 8px' }}
        >‹</button>
        <h3 className="font-cinzel" style={{ fontSize: '15px', letterSpacing: '2px', margin: 0 }}>
          {monthLabel.toUpperCase()}
        </h3>
        <button
          onClick={() => { setCurrentDate(new Date(year, month + 1, 1)); setSelectedDay(null) }}
          style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: '4px 8px' }}
        >›</button>
      </div>

      {/* Monthly event banners — social left, faction right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
        {[
          { key: 'social',  ev: socialEvent,  label: 'Social Event'  },
          { key: 'faction', ev: factionEvent, label: 'Faction Event' },
        ].map(({ key, ev, label }) => {
          const c = MONTHLY_COLOURS[key]
          return (
            <div
              key={key}
              style={{
                padding: '8px 12px',
                borderRadius: '7px',
                background: ev ? c.bg : 'rgba(255,255,255,0.02)',
                border: `1px solid ${ev ? c.border : 'rgba(255,255,255,0.06)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: 0,
              }}
            >
              {/* Colour dot */}
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                background: ev ? c.dot : 'rgba(255,255,255,0.12)',
              }} />
              <div style={{ minWidth: 0 }}>
                {ev ? (
                  <>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: c.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ev.title}
                    </div>
                    {ev.description && (
                      <div style={{ fontSize: '10px', color: c.text, opacity: 0.75, marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ev.description}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: '11px', color: '#555', fontStyle: 'italic' }}>
                    No {label.toLowerCase()} scheduled
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${LINE}` }}>
        {DAY_LABELS.map((d, i) => (
          <div key={d} style={{
            textAlign: 'center',
            color: '#a1a1aa',
            fontSize: '11px',
            fontWeight: 500,
            padding: '5px 0',
            letterSpacing: '0.5px',
            borderLeft: i > 0 ? `1px solid ${LINE}` : 'none',
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div style={{ border: `1px solid ${LINE}`, borderTop: 'none', overflow: 'hidden' }}>
        {weeks.map((week, wi) => {
          const { items, layerCount } = layoutWeek(gridEvents, week, year, month)
          const effectiveLayers = Math.max(1, layerCount)
          const barsHeight = effectiveLayers * (BAR_H + BAR_GAP) + 4

          return (
            <div
              key={wi}
              style={{
                position: 'relative',
                borderBottom: wi < weeks.length - 1 ? `1px solid ${LINE}` : 'none',
              }}
            >
              {/* Column separator lines */}
              <div aria-hidden style={{
                position: 'absolute', inset: 0, display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)', pointerEvents: 'none', zIndex: 0,
              }}>
                {[...Array(7)].map((_, i) => (
                  <div key={i} style={{ borderLeft: i > 0 ? `1px solid ${LINE}` : 'none' }} />
                ))}
              </div>

              {/* Day number row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', position: 'relative', zIndex: 1 }}>
                {week.map((day, di) => {
                  const selected  = selectedDay === day && day !== null
                  const todayCell = isToday(day)
                  return (
                    <div
                      key={di}
                      onClick={() => day && setSelectedDay(selected ? null : day)}
                      style={{
                        height: DAY_H,
                        boxSizing: 'border-box',
                        padding: '5px 6px 0',
                        background: selected  ? 'rgba(179,18,63,0.18)'
                                  : todayCell ? 'rgba(109,40,217,0.15)'
                                  : 'transparent',
                        cursor: day ? 'pointer' : 'default',
                      }}
                    >
                      {day && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          fontSize: '12px',
                          lineHeight: 1,
                          color: todayCell ? '#fff' : '#f4f4f5',
                          fontWeight: todayCell ? 700 : 400,
                          background: todayCell ? 'rgba(109,40,217,0.7)' : 'transparent',
                          userSelect: 'none',
                        }}>
                          {day}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Event bar layer */}
              {layerCount > 0 && (
                <div style={{ position: 'relative', zIndex: 1, height: barsHeight }}>
                  {items.map(item => {
                    const c   = gridColour(item.ev)
                    const pct = 100 / 7
                    const rTL = item.isStart ? '4px' : '0'
                    const rBL = item.isStart ? '4px' : '0'
                    const rTR = item.isEnd   ? '4px' : '0'
                    const rBR = item.isEnd   ? '4px' : '0'
                    const firstValidIdx = week.findIndex(d => d !== null)
                    const showLabel = item.isStart || item.colStart === firstValidIdx
                    const clickDay  = week[item.colStart]

                    return (
                      <div
                        key={`${item.ev.id}-w${wi}`}
                        title={item.ev.title}
                        onClick={() => clickDay && setSelectedDay(prev => prev === clickDay ? null : clickDay)}
                        style={{
                          position:     'absolute',
                          top:          item.layer * (BAR_H + BAR_GAP),
                          left:         `calc(${item.colStart * pct}% + ${BAR_PAD / 2}px)`,
                          width:        `calc(${item.colSpan * pct}% - ${BAR_PAD}px)`,
                          height:       BAR_H,
                          background:   c.bg,
                          borderRadius: `${rTL} ${rTR} ${rBR} ${rBL}`,
                          display:      'flex',
                          alignItems:   'center',
                          paddingLeft:  '6px',
                          paddingRight: '4px',
                          overflow:     'hidden',
                          cursor:       'pointer',
                          boxSizing:    'border-box',
                        }}
                      >
                        {showLabel && (
                          <span className="cal-bar-text" style={{
                            fontSize:     '10px',
                            fontWeight:   600,
                            color:        c.text,
                            whiteSpace:   'nowrap',
                            overflow:     'hidden',
                            textOverflow: 'ellipsis',
                            lineHeight:   1,
                            display:      'block',
                            width:        '100%',
                          }}>
                            {item.ev.title}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

            </div>
          )
        })}
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <div style={{ marginTop: '12px', padding: '14px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${LINE}` }}>
          <div style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '10px' }}>
            {ds(year, month, selectedDay)}
          </div>
          {selectedEvents.length === 0 ? (
            <p style={{ color: '#a1a1aa', fontSize: '14px', margin: 0 }}>No events on this day.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {selectedEvents.map(ev => {
                const c = gridColour(ev)
                const isMultiDay = !!ev.end_date
                // For non-fixed torn events, use the viewer's personal calendar start time
                const effectiveStartTime = (ev.fixed_start_time === 0 && calendarStartTime)
                  ? calendarStartTime
                  : ev.start_time
                const timeRange = effectiveStartTime
                  ? `${formatTime(effectiveStartTime)}${ev.end_time && ev.fixed_start_time !== 0 ? ` – ${formatTime(ev.end_time)}` : ''} TCT${ev.fixed_start_time === 0 ? ' (your start)' : ''}`
                  : null
                return (
                  <div key={ev.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ width: '3px', borderRadius: '2px', alignSelf: 'stretch', background: c.bg, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '14px' }}>{ev.title}</span>
                        {isMultiDay && (
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: 'rgba(109,40,217,0.25)', color: '#9f67ff', whiteSpace: 'nowrap' }}>
                            Multi-day
                          </span>
                        )}
                      </div>
                      {timeRange   && <div style={{ color: '#9f67ff', fontSize: '12px', marginTop: '2px' }}>{timeRange}</div>}
                      {isMultiDay  && <div style={{ color: '#a1a1aa', fontSize: '12px', marginTop: '2px' }}>{ev.start_date} → {ev.end_date}</div>}
                      {ev.description && <div style={{ color: '#a1a1aa', fontSize: '13px', marginTop: '3px' }}>{ev.description}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
