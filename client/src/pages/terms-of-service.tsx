import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";

const EFFECTIVE_DATE = "1 April 2025";
const CONTACT_EMAIL = "support@konexesim.com";
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

export default function TermsOfService() {
  useEffect(() => { document.title = "Terms of Service | Konex eSIM"; }, []);
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
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Terms of Service</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Effective date: {EFFECTIVE_DATE}</p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-10 mt-4 border-l-2 border-primary/30 pl-4">
        Please read these Terms of Service carefully before using the {COMPANY} website or purchasing
        any eSIM plan. By accessing our website or placing an order, you agree to be bound by these
        terms. If you do not agree, please do not use our services.
      </p>

      <Section title="1. About Konex">
        <P>
          {COMPANY} operates the website {DOMAIN} and provides international eSIM data plans for use
          by travellers across 190+ countries. References to "we", "us", "our", or "{COMPANY}" refer
          to the operator of {DOMAIN}. References to "you" or "customer" refer to the person accessing
          our website or purchasing our services.
        </P>
      </Section>

      <Section title="2. Eligibility">
        <P>To use our services, you must:</P>
        <Ul items={[
          "Be at least 16 years of age",
          "Have the legal capacity to enter into a binding contract in your jurisdiction",
          "Provide accurate and complete information when creating an account or placing an order",
          "Own or be authorised to use the device on which you will install the eSIM",
        ]} />
        <P>
          By using our services, you represent and warrant that you meet these requirements.
        </P>
      </Section>

      <Section title="3. Our Services">
        <P>
          {COMPANY} provides digital eSIM data plans that allow you to access mobile data services
          abroad without a physical SIM card. Key features of our service include:
        </P>
        <Ul items={[
          "Instant delivery of your eSIM QR code to your registered email address after payment",
          "Data plans covering 190+ countries and regions, sourced from multiple eSIM network providers",
          "Plans valid for a specified data allowance and validity period as stated at checkout",
          "Coverage on local partner networks — specific network availability varies by destination",
        ]} />
        <P>
          We act as a reseller of eSIM data plans from third-party network providers. The underlying
          connectivity is delivered by those providers and is subject to their network conditions and
          coverage.
        </P>
      </Section>

      <Section title="4. eSIM Compatibility">
        <P>
          eSIM plans require a compatible unlocked device. It is your responsibility to verify that
          your device supports eSIM technology before purchasing. You can check compatibility at{" "}
          <Link href="/compatibility" className="text-primary hover:underline">konexesim.com/compatibility</Link>.
        </P>
        <P>
          {COMPANY} is not liable for any purchase made for an incompatible device. We strongly
          recommend verifying compatibility before placing an order.
        </P>
      </Section>

      <Section title="5. Ordering and Payment">
        <P>
          All prices displayed on our website are in US Dollars (USD) unless otherwise stated. Prices
          in other currencies shown on the website are approximate conversions for display purposes
          only — the actual charge processed at checkout will be in USD.
        </P>
        <P>
          Payments are processed securely by PayPal or Paddle. By placing an order, you authorise {COMPANY} to
          charge the specified amount to your payment method via the selected provider. All transactions are subject
          to the respective payment provider's terms of service.
        </P>
        <P>
          An order is confirmed when you receive a confirmation email. We reserve the right to refuse
          or cancel any order at our discretion, including in cases of suspected fraud or technical
          errors in pricing.
        </P>
      </Section>

      <Section title="6. eSIM Delivery">
        <P>
          Upon successful payment, your eSIM QR code will be delivered to the email address provided
          at checkout, typically within minutes. In rare cases, delivery may take up to 24 hours.
        </P>
        <P>Please check your spam or junk folder if you do not receive your eSIM within 30 minutes.
          If you experience any delivery issues, contact us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a>.
        </P>
      </Section>

      <Section title="7. Refund and Cancellation Policy">
        <P>
          Due to the digital and immediately deliverable nature of eSIM plans, the following refund
          policy applies:
        </P>
        <Ul items={[
          "Once your eSIM QR code has been delivered, the order is considered fulfilled and is non-refundable",
          "If you have not received your eSIM QR code within 24 hours of payment, you are entitled to a full refund",
          "If your eSIM fails to activate due to a verified technical fault on our side, we will offer a replacement eSIM or a full refund at our discretion",
          "Refunds are not provided for unused data, early plan expiry due to non-use, or incompatible devices",
          "Refunds are not provided if you travel to a country not covered by your plan",
        ]} />
        <P>
          To request a refund or raise a dispute, contact us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a>{" "}
          within 14 days of your purchase date.
        </P>
      </Section>

      <Section title="8. eSIM Usage and Restrictions">
        <P>By purchasing and using a {COMPANY} eSIM plan, you agree to the following:</P>
        <Ul items={[
          "Each eSIM is for single-device use only and is non-transferable",
          "You may not resell, share, or sublicense your eSIM plan to third parties",
          "Data plans are valid for the stated allowance and validity period — unused data does not roll over after expiry",
          "Validity periods begin from the date of first activation (scanning the QR code) or from the plan start date, as specified",
          "Coverage is subject to local network availability — we cannot guarantee uninterrupted service in all locations",
          "Usage for unlawful activities, network abuse, or any activity that violates local laws is strictly prohibited",
        ]} />
      </Section>

      <Section title="9. Accounts">
        <P>
          You may use our services as a guest (with an email address for delivery) or by creating a
          registered account. If you create an account:
        </P>
        <Ul items={[
          "You are responsible for maintaining the confidentiality of your login credentials",
          "You are responsible for all activity that occurs under your account",
          "You must notify us immediately if you suspect unauthorised access to your account",
          "We reserve the right to suspend or terminate accounts that violate these Terms",
        ]} />
      </Section>

      <Section title="10. Intellectual Property">
        <P>
          All content on the {COMPANY} website — including text, graphics, logos, and software — is
          the property of {COMPANY} or its licensors and is protected by applicable intellectual
          property laws. You may not copy, reproduce, distribute, or create derivative works from any
          content on our website without our express written permission.
        </P>
      </Section>

      <Section title="11. Disclaimer of Warranties">
        <P>
          Our services are provided "as is" and "as available" without warranties of any kind, whether
          express or implied. We do not warrant that:
        </P>
        <Ul items={[
          "Our website will be available at all times or free from errors or interruptions",
          "eSIM services will function without interruption in all countries or locations",
          "Data speeds will meet any particular specification (speeds depend on local network conditions)",
          "The service will be free from all bugs, viruses, or other harmful components",
        ]} />
        <P>
          Nothing in these terms excludes or limits our liability for death or personal injury caused
          by our negligence, fraud, or any other liability that cannot be excluded by law.
        </P>
      </Section>

      <Section title="12. Limitation of Liability">
        <P>
          To the fullest extent permitted by applicable law, {COMPANY}'s total liability to you for
          any claim arising from your use of our services shall not exceed the amount you paid for
          the specific order giving rise to the claim.
        </P>
        <P>
          We are not liable for any indirect, incidental, consequential, or punitive damages,
          including but not limited to:
        </P>
        <Ul items={[
          "Loss of data, profit, or business opportunity",
          "Costs incurred as a result of network outages or coverage gaps",
          "Roaming charges incurred on your existing SIM due to failure to use your eSIM",
          "Losses arising from circumstances outside our reasonable control (force majeure)",
        ]} />
      </Section>

      <Section title="13. Third-Party Services">
        <P>
          Our website and services may contain links to or integrations with third-party services
          (including PayPal and Paddle for payments). We are not responsible for the content, privacy practices,
          or reliability of any third-party service. Use of third-party services is at your own risk
          and subject to their own terms and policies.
        </P>
      </Section>

      <Section title="14. Prohibited Conduct">
        <P>You agree not to:</P>
        <Ul items={[
          "Use our services for any unlawful purpose or in violation of any applicable law or regulation",
          "Attempt to gain unauthorised access to our systems, accounts, or data",
          "Engage in any activity that disrupts, damages, or interferes with our website or services",
          "Use automated tools, bots, or scrapers to access our website without authorisation",
          "Provide false, inaccurate, or misleading information when placing an order or creating an account",
          "Attempt to circumvent any security or authentication measures on our platform",
        ]} />
      </Section>

      <Section title="15. Governing Law and Disputes">
        <P>
          These Terms of Service are governed by and construed in accordance with the laws of England
          and Wales. Any disputes arising from these terms or your use of our services shall be subject
          to the exclusive jurisdiction of the courts of England and Wales.
        </P>
        <P>
          We aim to resolve any disputes informally in the first instance. If you have a complaint,
          please contact us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a>{" "}
          and we will do our best to reach a fair resolution.
        </P>
      </Section>

      <Section title="16. Changes to These Terms">
        <P>
          We reserve the right to update these Terms of Service at any time. When we make material
          changes, we will update the effective date at the top of this page. Your continued use of
          our services after any changes constitutes your acceptance of the revised terms. If you do
          not agree with the updated terms, you must stop using our services.
        </P>
      </Section>

      <Section title="17. Contact Us">
        <P>If you have any questions about these Terms of Service, please contact us:</P>
        <div className="mt-3 p-4 rounded-xl bg-muted/40 border text-sm space-y-1">
          <p className="font-semibold text-foreground">{COMPANY}</p>
          <p>Website: <a href={`https://${DOMAIN}`} className="text-primary hover:underline">{DOMAIN}</a></p>
          <p>Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a></p>
        </div>
      </Section>

      <div className="mt-12 pt-6 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} {COMPANY}. All rights reserved.</p>
        <div className="flex gap-4">
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link href="/" className="hover:text-foreground transition-colors">Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
