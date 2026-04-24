import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield } from "lucide-react";

const EFFECTIVE_DATE = "1 April 2025";
const CONTACT_EMAIL = "privacy@konexesim.com";
const COMPANY = "Konex";
const DOMAIN = "konexesim.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold mb-3 text-foreground">{title}</h2>
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="list-disc list-inside space-y-1 ml-2">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

export default function PrivacyPolicy() {
  useEffect(() => { document.title = "Privacy Policy | Konex eSIM"; }, []);
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/">
        <Button variant="ghost" size="sm" className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Effective date: {EFFECTIVE_DATE}</p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-10 mt-4 border-l-2 border-primary/30 pl-4">
        This Privacy Policy explains how {COMPANY} ("{DOMAIN}") collects, uses, and protects your personal
        information when you use our website and eSIM services. By using our services, you agree to the
        practices described in this policy.
      </p>

      <Section title="1. Who We Are">
        <P>
          {COMPANY} operates the website {DOMAIN} and provides international eSIM data plans to
          travellers worldwide. References to "we", "us", or "our" in this policy refer to {COMPANY}.
        </P>
        <P>
          For any privacy-related questions or requests, you can contact us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a>.
        </P>
      </Section>

      <Section title="2. Information We Collect">
        <P>We collect the following categories of personal information:</P>
        <p className="font-medium text-foreground mt-2 mb-1">Account and identity information</p>
        <Ul items={[
          "Full name and email address (when you create an account or checkout as a guest)",
          "Password (stored in hashed/encrypted form — we never store your plaintext password)",
          "Account creation date and login history",
        ]} />
        <p className="font-medium text-foreground mt-3 mb-1">Payment information</p>
        <Ul items={[
          "Payment card details are processed by our payment providers (PayPal and Paddle) — we do not store full card numbers on our servers",
          "Transaction references and order IDs from our payment providers for order records",
          "Order totals, currency, and purchase history",
        ]} />
        <p className="font-medium text-foreground mt-3 mb-1">eSIM delivery information</p>
        <Ul items={[
          "Email address used for eSIM QR code delivery",
          "ICCID (unique SIM identifier) and activation status for each eSIM order",
          "Order status and fulfilment records",
        ]} />
        <p className="font-medium text-foreground mt-3 mb-1">Technical information</p>
        <Ul items={[
          "IP address and general location (country/region)",
          "Browser type and device information",
          "Pages visited and interactions on our website (analytics)",
          "Cookies and similar tracking technologies (see Section 8)",
        ]} />
      </Section>

      <Section title="3. How We Use Your Information">
        <P>We use your personal information for the following purposes:</P>
        <Ul items={[
          "To process your eSIM order and deliver the QR code to your email address",
          "To create and manage your account, including authentication and security",
          "To send transactional emails (order confirmation, eSIM delivery, activation status)",
          "To process payments securely via PayPal and Paddle",
          "To provide customer support and respond to enquiries",
          "To detect and prevent fraud, abuse, and security incidents",
          "To comply with legal and regulatory obligations",
          "To improve our website, services, and user experience through aggregated analytics",
          "To send service-related notifications where necessary (not marketing without consent)",
        ]} />
      </Section>

      <Section title="4. Legal Basis for Processing">
        <P>
          Where applicable under data protection law (including the UK GDPR and EU GDPR), we process
          your personal data on the following legal bases:
        </P>
        <Ul items={[
          "Contract performance — to process orders and deliver eSIM services you have purchased",
          "Legitimate interests — to protect our platform, prevent fraud, and improve our services",
          "Legal obligation — to comply with tax, financial, and regulatory requirements",
          "Consent — for any optional marketing communications (you can withdraw at any time)",
        ]} />
      </Section>

      <Section title="5. Sharing Your Information">
        <P>
          We do not sell your personal data. We share your information only with trusted third parties
          as necessary to provide our services:
        </P>
        <Ul items={[
          "PayPal — payment processing and fraud prevention (paypal.com/privacy)",
          "Paddle — payment processing and tax compliance (paddle.com/privacy)",
          "eSIM network providers — to activate and provision your eSIM on the relevant mobile network (name, email, and order details only as required)",
          "Email delivery provider — to send transactional emails such as your eSIM QR code and order confirmation",
          "Cloud infrastructure and database providers — for secure hosting and data storage",
          "Legal authorities — if required by law, court order, or to protect the rights and safety of our users",
        ]} />
        <P>
          All third-party providers are contractually required to handle your data securely and only
          for the purposes we specify.
        </P>
      </Section>

      <Section title="6. Data Retention">
        <P>We retain your personal data for as long as necessary to:</P>
        <Ul items={[
          "Maintain your account and provide our services",
          "Comply with legal and tax obligations (typically 6–7 years for financial records)",
          "Resolve disputes and enforce our agreements",
        ]} />
        <P>
          If you request deletion of your account, we will delete or anonymise your personal data
          within 30 days, except where retention is required by law.
        </P>
      </Section>

      <Section title="7. Your Rights">
        <P>
          Depending on your location, you may have the following rights regarding your personal data:
        </P>
        <Ul items={[
          "Access — request a copy of the personal data we hold about you",
          "Correction — ask us to correct inaccurate or incomplete data",
          "Deletion — request that we delete your personal data ('right to be forgotten')",
          "Restriction — ask us to restrict processing of your data in certain circumstances",
          "Portability — receive your data in a structured, machine-readable format",
          "Objection — object to processing based on legitimate interests or for direct marketing",
          "Withdraw consent — where processing is based on consent, withdraw it at any time",
        ]} />
        <P>
          To exercise any of these rights, please email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a>.{" "}
          We will respond within 30 days. You also have the right to lodge a complaint with your local
          data protection authority.
        </P>
      </Section>

      <Section title="8. Cookies">
        <P>
          We use cookies and similar technologies to operate our website and improve your experience.
          Cookies we may use include:
        </P>
        <Ul items={[
          "Essential cookies — required for the website to function (authentication sessions, checkout state)",
          "Preference cookies — to remember settings such as your selected currency and theme",
          "Analytics cookies — to understand how visitors use our site (aggregated and anonymised)",
        ]} />
        <P>
          You can control cookies through your browser settings. Disabling essential cookies may affect
          your ability to use certain features of our website.
        </P>
      </Section>

      <Section title="9. Data Security">
        <P>
          We take appropriate technical and organisational measures to protect your personal data,
          including:
        </P>
        <Ul items={[
          "Encrypted data transmission (HTTPS/TLS) for all website traffic",
          "Passwords stored using secure one-way hashing",
          "Payment data handled exclusively by PayPal and Paddle's PCI-DSS compliant infrastructure",
          "Access controls limiting who within our organisation can access personal data",
          "Regular security reviews of our platform and infrastructure",
        ]} />
        <P>
          No method of transmission or storage is 100% secure. If you have reason to believe your
          data has been compromised, please contact us immediately.
        </P>
      </Section>

      <Section title="10. International Transfers">
        <P>
          Your personal data may be processed and stored in countries outside your home country,
          including the United Kingdom, the United States, and the European Economic Area. Where data
          is transferred internationally, we ensure appropriate safeguards are in place in accordance
          with applicable data protection law.
        </P>
      </Section>

      <Section title="11. Children's Privacy">
        <P>
          Our services are not directed to children under the age of 16. We do not knowingly collect
          personal data from children. If you believe we have inadvertently collected data from a
          child, please contact us so we can delete it promptly.
        </P>
      </Section>

      <Section title="12. Changes to This Policy">
        <P>
          We may update this Privacy Policy from time to time. When we make material changes, we will
          update the effective date at the top of this page and, where appropriate, notify you by
          email. Your continued use of our services after any update constitutes acceptance of the
          revised policy.
        </P>
      </Section>

      <Section title="13. Contact Us">
        <P>
          For any questions, concerns, or requests relating to this Privacy Policy or your personal
          data, please contact us at:
        </P>
        <div className="mt-3 p-4 rounded-xl bg-muted/40 border text-sm space-y-1">
          <p className="font-semibold text-foreground">{COMPANY}</p>
          <p>Website: <a href={`https://${DOMAIN}`} className="text-primary hover:underline">{DOMAIN}</a></p>
          <p>Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a></p>
        </div>
      </Section>

      <div className="mt-12 pt-6 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} {COMPANY}. All rights reserved.</p>
        <div className="flex gap-4">
          <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <Link href="/" className="hover:text-foreground transition-colors">Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
