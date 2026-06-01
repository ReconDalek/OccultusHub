export default function PrivacyPolicy() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <h1
        className="font-cinzel text-center"
        style={{ fontSize: 'clamp(28px, 4vw, 42px)', marginBottom: '12px', letterSpacing: '4px' }}
      >
        Privacy Policy
      </h1>
      <p className="text-center" style={{ color: '#a1a1aa', fontSize: '13px', marginBottom: '56px' }}>
        Effective date: 1 June 2026
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>

        <Section title="1. Overview">
          Occultus Hub is a private community portal for members of the Occultus faction family
          on Torn. This policy explains what information we collect, how we use it, and the
          choices you have. We collect only what is necessary to operate the website.
        </Section>

        <Section title="2. Information We Collect">
          <p style={{ marginBottom: '12px' }}>
            When you log in with your Torn API key we retrieve and store the following from the
            Torn API:
          </p>
          <ul style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>Your Torn player ID and username</li>
            <li>Your current faction ID and faction position</li>
            <li>Your Torn profile image URL</li>
          </ul>
          <p style={{ marginTop: '12px' }}>
            We also store a encoded copy of your Torn API key to allow background cache
            refreshes on your behalf. We record the date and time of each login, your IP address,
            and your browser user-agent for security and audit purposes.
          </p>
        </Section>

        <Section title="3. How We Use Your Information">
          <ul style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>To verify your faction membership and assign the correct access level</li>
            <li>To display your profile within the website (avatar, username, position)</li>
            <li>To refresh faction and company data from the Torn API using your key</li>
            <li>To generate a session token (JWT) that keeps you logged in for up to 7 days</li>
            <li>To allow administrators to review login history for security purposes</li>
          </ul>
          <p style={{ marginTop: '12px' }}>
            We do not use your data for advertising, analytics services, or any purpose beyond
            the operation of this website.
          </p>
        </Section>

        <Section title="4. Data Storage & Security">
          All data is stored in a Cloudflare D1 database hosted on Cloudflare's infrastructure.
          Your API key is stored in an encoded form and is never logged in plain text. Session
          tokens are signed with a secret key and expire after 7 days. We apply reasonable
          technical measures to protect your data, but no system is completely secure — use a
          limited-permission Torn API key where possible.
        </Section>

        <Section title="5. Data Sharing">
          We do not sell, rent, or trade your personal information. Your data is not shared with
          any third parties except Cloudflare, whose infrastructure hosts this website, and the
          Torn API, which is the source of your faction data. Both services have their own privacy
          policies.
        </Section>

        <Section title="6. Cookies & Local Storage">
          The website stores your session token in your browser's <code style={{ color: '#c084fc', fontSize: '13px' }}>localStorage</code> so
          you remain logged in between visits. We do not use tracking cookies or third-party
          cookies of any kind. Faction data is also cached locally in <code style={{ color: '#c084fc', fontSize: '13px' }}>localStorage</code> to
          reduce load times.
        </Section>

        <Section title="7. Data Retention">
          Your account data is retained for as long as you are an active member of the Occultus
          faction network. Login history records are kept for up to 90 days. If you leave the
          faction or request deletion, your data will be removed within a reasonable time.
        </Section>

        <Section title="8. Your Rights">
          You may request to view, correct, or delete the personal data we hold about you at any
          time by contacting an administrator on the{' '}
          <a
            href="https://discord.gg/3QMhcxfEWq"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#9f67ff', textDecoration: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#c084fc')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#9f67ff')}
          >
            Occultus Discord
          </a>. We will respond within 14 days.
        </Section>

        <Section title="9. Children's Privacy">
          This website is not directed at children under the age of 13. If you believe a minor has
          provided us with personal information, please contact us so we can remove it.
        </Section>

        <Section title="10. Changes to This Policy">
          We may update this Privacy Policy from time to time. We will post the revised version
          here with an updated effective date. Continued use of the website after changes are posted
          constitutes your acceptance of the revised Policy.
        </Section>

        <Section title="11. Contact">
          Questions about this Privacy Policy? Reach us on the{' '}
          <a
            href="https://discord.gg/3QMhcxfEWq"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#9f67ff', textDecoration: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#c084fc')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#9f67ff')}
          >
            Occultus Discord
          </a>.
        </Section>

      </div>
    </main>
  )
}

function Section({ title, children }) {
  return (
    <div
      className="rounded-2xl"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        padding: '28px 32px',
      }}
    >
      <h2
        className="font-cinzel"
        style={{ fontSize: '16px', letterSpacing: '2px', marginBottom: '14px', color: '#f4f4f5' }}
      >
        {title}
      </h2>
      <div style={{ color: '#a1a1aa', lineHeight: 1.8, fontSize: '15px' }}>
        {children}
      </div>
    </div>
  )
}
