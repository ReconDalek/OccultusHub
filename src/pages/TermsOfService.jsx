export default function TermsOfService() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <h1
        className="font-cinzel text-center"
        style={{ fontSize: 'clamp(28px, 4vw, 42px)', marginBottom: '12px', letterSpacing: '4px' }}
      >
        Terms of Service
      </h1>
      <p className="text-center" style={{ color: "var(--text-secondary)", fontSize: '13px', marginBottom: '56px' }}>
        Effective date: 1 June 2026
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>

        <Section title="1. Acceptance of Terms">
          By accessing or using Occultus Hub (the "website"), you agree to be bound by these Terms of
          Service. If you do not agree, please do not use the website. These terms apply to all
          visitors, members, and any other users of the website.
        </Section>

        <Section title="2. Eligibility">
          The website is intended solely for members of the Occultus faction network on the
          browser-based game Torn (torn.com). Access requires a valid Torn API key linked to an
          active account that is a member of one of the Occultus family factions. We reserve the
          right to deny or revoke access at any time.
        </Section>

        <Section title="3. Your Torn API Key">
          To log in you must provide your Torn API key. By doing so you confirm that the key
          belongs to you and that you have the right to use it here. We store only a minimal,
          encoded representation of your key and use it exclusively to verify your faction
          membership and to refresh faction and company data on your behalf. We will never share
          your API key with third parties or use it for any purpose beyond what is described in
          these terms.
        </Section>

        <Section title="4. Permitted Use">
          The website is provided for informational and community purposes within the Occultus
          faction. You agree not to:
          <ul style={{ paddingLeft: '24px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>Attempt to gain unauthorised access to any part of the website or its infrastructure</li>
            <li>Scrape, harvest, or automate requests to the website in a manner that disrupts normal operation</li>
            <li>Reverse-engineer, decompile, or otherwise attempt to extract source code</li>
            <li>Use the website for any purpose that violates Torn's own Terms of Service</li>
            <li>Impersonate another member or misrepresent your identity</li>
          </ul>
        </Section>

        <Section title="5. Content & Accuracy">
          Faction, company, and member data displayed on the website is sourced from the Torn public
          API and is cached periodically. We do not guarantee that all data is current, complete,
          or error-free. You agree not to rely solely on information from this website for
          time-sensitive in-game decisions.
        </Section>

        <Section title="6. Intellectual Property">
          All original content, design elements, and code of this website are the property of the
          Occultus faction administration. Torn game data and trademarks remain the property of
          Torn Ltd. The Occultus name, logo, and branding may not be reused without written
          permission.
        </Section>

        <Section title="7. Accounts & Access Levels">
          Access levels (member, leadership, admin) are determined by your verified Torn faction
          position. These levels may change if your in-game position changes or if access is
          revoked by an administrator. We are not liable for any loss of access resulting from
          changes to your in-game membership.
        </Section>

        <Section title="8. Limitation of Liability">
          The website is provided "as is" without warranties of any kind. To the fullest extent
          permitted by law, the Occultus faction administration shall not be liable for any
          indirect, incidental, or consequential damages arising from your use of or inability to
          use the website.
        </Section>

        <Section title="9. Changes to These Terms">
          We may update these Terms at any time. Continued use of the website after changes are
          posted constitutes your acceptance of the revised Terms. The effective date at the top
          of this page will be updated accordingly.
        </Section>

        <Section title="10. Contact">
          For any questions regarding these Terms, reach us on the{' '}
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
      <div style={{ color: "var(--text-secondary)", lineHeight: 1.8, fontSize: '15px' }}>
        {children}
      </div>
    </div>
  )
}
