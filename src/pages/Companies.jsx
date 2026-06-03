import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../config/api'
import { useSession } from '../hooks/useSession'
import { formatUTC } from '../lib/dates'

function Stars({ rating }) {
  return (
    <div className="my-4 text-xl">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} style={{ color: i < rating ? '#ffd166' : 'rgba(255,255,255,0.2)' }}>
          ★
        </span>
      ))}
    </div>
  )
}

function getCompanyMembershipTier(user, company) {
  if (!user) return null
  const profile   = company.profile   || {}
  const employees = company.employees || []
  if (Number(user.tornUserId) === Number(profile.director?.id)) return 'director'
  if (employees.some((emp) => Number(emp.id) === Number(user.tornUserId))) return 'member'
  return null
}

function CompanyCard({ company, membershipTier }) {
  const [expanded, setExpanded] = useState(false)
  const profile   = company.profile   || {}
  const employees = company.employees || []

  const highlight =
    membershipTier === 'director'  ? 'faction-director'  :
    membershipTier === 'member'    ? 'faction-member'     : ''

  return (
    <div
      className={`relative rounded-3xl cursor-pointer transition-all duration-300 company-card ${highlight || 'hover:-translate-y-1.5'} ${expanded ? 'expanded' : ''}`}
      style={{
        background: 'rgba(22,22,32,0.82)',
        border: highlight ? undefined : '1px solid rgba(255,255,255,0.05)',
        padding: '40px',
        backdropFilter: 'blur(12px)',
      }}
      onClick={() => setExpanded((v) => !v)}
    >
      <h3 className="font-cinzel" style={{ fontSize: '24px', marginBottom: '8px' }}>
        {profile.name}
      </h3>

      <Stars rating={profile.rating || 0} />

      <div className="mt-2.5 text-sm" style={{ color: '#9f67ff' }}>
        Director:{' '}
        {profile.director?.id ? (
          <a
            href={`https://www.torn.com/profiles.php?XID=${profile.director.id}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: '#9f67ff', textDecoration: 'none' }}
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={(e) => (e.target.style.color = '#fff')}
            onMouseLeave={(e) => (e.target.style.color = '#9f67ff')}
          >
            {profile.director.name || `#${profile.director.id}`}
          </a>
        ) : (
          <span style={{ color: '#a1a1aa' }}>Unknown</span>
        )}
      </div>

      <div className="mt-2.5 text-sm" style={{ color: '#9f67ff' }}>
        Company ID:{' '}
        <a
          href={`https://www.torn.com/joblist.php?step=search#!p=corpinfo&ID=${profile.id}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: '#9f67ff', textDecoration: 'none' }}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={(e) => (e.target.style.color = '#fff')}
          onMouseLeave={(e) => (e.target.style.color = '#9f67ff')}
        >
          {profile.id}
        </a>
      </div>

      <div className="mt-2.5 text-sm" style={{ color: '#9f67ff' }}>
        Employees: {profile.employees?.hired} / {profile.employees?.capacity}
      </div>

      {/* Expandable section */}
      <div className="company-expand">
        <div
          className="grid gap-6 company-detail-grid"
          style={{ gridTemplateColumns: '1fr 1fr 1fr' }}
        >
          {[
            ['Daily Income',        `$${profile.income?.daily?.toLocaleString()}`],
            ['Weekly Income (est.)', `$${(profile.income?.daily * 7)?.toLocaleString()}`],
            ['Monthly Income (est.)', `$${(profile.income?.daily * 30)?.toLocaleString()}`],
          ].map(([label, val]) => (
            <div key={label}>
              <strong>{label}</strong>
              <br />
              {val}
            </div>
          ))}
        </div>

        <h4 className="mt-4 mb-3" style={{ fontSize: '18px' }}>
          Employees
        </h4>

        <div>
          {employees.map((emp) => (
            <div
              key={emp.id}
              className="grid gap-3 py-3 employee-row"
              style={{
                gridTemplateColumns: '1.5fr 1fr 1fr',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                fontSize: '14px',
              }}
            >
              <a
                href={`https://www.torn.com/profiles.php?XID=${emp.id}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#9f67ff', textDecoration: 'none' }}
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={(e) => (e.target.style.color = '#fff')}
                onMouseLeave={(e) => (e.target.style.color = '#9f67ff')}
              >
                {emp.name}
              </a>
              <span>{emp.position?.name}</span>
              <span>{emp.last_action?.relative}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Companies() {
  const { user }                        = useSession()
  const [companies, setCompanies]       = useState([])
  const [lastUpdated, setLastUpdated]   = useState(null)
  const [loading, setLoading]           = useState(true)
  const [cacheStatus, setCacheStatus]   = useState(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res  = await fetch(`${API_BASE_URL}/api/company-cache`)
        const data = await res.json()

        if (data.companies?.length) {
          setCompanies(
            [...data.companies].sort(
              (a, b) => (b.profile?.rating || 0) - (a.profile?.rating || 0)
            )
          )
          setLastUpdated(data.lastUpdated)
          if (data.lastUpdated) {
            setCacheStatus(`Last Updated: ${formatUTC(data.lastUpdated)}`)
          }
        }
      } catch (err) {
        console.error('Failed loading companies:', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <>
      {/* HERO */}
      <section
        className="flex items-center justify-center text-center"
        style={{ minHeight: '40vh', padding: '80px 24px' }}
      >
        <div>
          <h1
            className="font-cinzel animate-fade-up"
            style={{ fontSize: 'clamp(42px, 8vw, 68px)', lineHeight: 1.1, marginBottom: '28px' }}
          >
            Occultus Companies
          </h1>
          <p
            className="animate-fade-up-slow"
            style={{ color: '#a1a1aa', fontSize: '20px', lineHeight: 1.8 }}
          >
            Industry powers the collective.<br />
            Every enterprise strengthens the order.
          </p>
        </div>
      </section>

      {/* GRID */}
      <section style={{ padding: '60px 48px' }}>
        {loading ? (
          <div className="flex items-center justify-center" style={{ minHeight: '200px' }}>
            <p style={{ color: '#a1a1aa', fontSize: '15px' }}>Loading company data…</p>
          </div>
        ) : companies.length === 0 ? (
          <div className="flex items-center justify-center" style={{ minHeight: '200px' }}>
            <p style={{ color: '#a1a1aa', fontSize: '15px' }}>No company data available.</p>
          </div>
        ) : (
          <div
            className="grid gap-8 faction-grid-responsive"
            style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
          >
            {companies.map((c) => (
              <CompanyCard
                key={c.profile?.id}
                company={c}
                membershipTier={getCompanyMembershipTier(user, c)}
              />
            ))}
          </div>
        )}

        {/* Cache status */}
        {cacheStatus && (
          <div
            className="max-w-3xl mx-auto mt-8 p-5 rounded-3xl text-center"
            style={{ background: 'rgba(255,255,255,0.03)', color: '#a1a1aa', fontSize: '14px' }}
          >
            {cacheStatus}
          </div>
        )}
      </section>
    </>
  )
}
