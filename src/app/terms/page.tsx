import type { Metadata } from "next";
import Link from "next/link";
import LegalDoc from "@/components/LegalDoc";

export const metadata: Metadata = {
  title: "Terms of Service — Panogram",
  description: "The rules for using Panogram.",
};

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of Service"
      updated="June 29, 2026"
      intro={
        <p>
          These Terms are the agreement between you and Unakin LLC (&ldquo;<b>Panogram</b>,&rdquo;
          &ldquo;we,&rdquo; &ldquo;us&rdquo;) for using the Panogram service. By creating an account
          or using Panogram, you agree to them. If you do not agree, do not use the service.
        </p>
      }
    >
      <h2>1. Who can use Panogram</h2>
      <p>
        You must be at least <b>13 years old</b> (or the minimum age required in your country, if
        higher) to use Panogram, and you must be able to form a binding contract. By using the
        service you confirm you meet these requirements.
      </p>

      <h2>2. Your account</h2>
      <p>
        You sign in with a passwordless email link. You are responsible for activity under your
        account and for keeping access to your email secure. Choose a handle and profile that do not
        impersonate others or mislead.
      </p>

      <h2>3. Your content &amp; the license you grant us</h2>
      <p>
        You keep ownership of the media, comments and spatial tags you publish (&ldquo;your
        content&rdquo;). To operate the service, you grant us a worldwide, non-exclusive,
        royalty-free license to host, store, reproduce, adapt (for example, to generate previews and
        thumbnails), publicly display and distribute your content <b>for the purpose of running and
        promoting Panogram</b>. This license ends when you delete your content, except for copies
        retained in backups or as required by law, and except where others have already re-shared
        public content.
      </p>
      <p>
        You represent that you have the rights to everything you publish — including the right to any
        people, places, trademarks or copyrighted works depicted — and that it does not violate the
        law or anyone&rsquo;s rights.
      </p>

      <h2>4. Acceptable use</h2>
      <p>
        You agree to follow our <Link href="/guidelines">Community Guidelines</Link>, which are part
        of these Terms. In short, do not post illegal, harmful, hateful, harassing, sexual-exploitation,
        or infringing content; do not spam, scrape, or abuse the service; and do not attempt to break,
        overload or reverse-engineer it.
      </p>

      <h2>5. Moderation, removal &amp; suspension</h2>
      <p>
        We may review reported content and, at our discretion, <b>remove content</b> and{" "}
        <b>suspend or terminate accounts</b> that violate these Terms or the Community Guidelines, or
        where we believe it is necessary to protect users or comply with the law. Where reasonable we
        will aim to act proportionately, but we are not obligated to host any particular content.
      </p>

      <h2>6. Copyright</h2>
      <p>
        We respond to valid copyright complaints and may remove infringing material and terminate
        repeat infringers. See our <Link href="/legal/dmca">Copyright / DMCA</Link> page for how to
        submit a notice.
      </p>

      <h2>7. Third-party services</h2>
      <p>
        Panogram relies on third-party providers (such as hosting, database, storage and email). Their
        availability is outside our control, and links or destinations referenced in user content are
        not endorsed by us.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        The service is provided <b>&ldquo;as is&rdquo;</b> and <b>&ldquo;as available,&rdquo;</b>{" "}
        without warranties of any kind, to the fullest extent permitted by law. We do not guarantee
        that the service will be uninterrupted, secure, or error-free, or that content is accurate.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, Unakin LLC will not be liable for any indirect,
        incidental, special, consequential or punitive damages, or for any loss of data, profits or
        goodwill, arising from your use of the service. Some jurisdictions do not allow these limits,
        so they may not fully apply to you.
      </p>

      <h2>10. Termination</h2>
      <p>
        You may stop using Panogram and delete your account at any time. We may suspend or end your
        access if you breach these Terms. Sections that by their nature should survive (ownership,
        licenses you granted for already-shared content, disclaimers, and liability limits) will
        survive termination.
      </p>

      <h2>11. Changes &amp; governing law</h2>
      <p>
        We may update these Terms; material changes will be reflected by the &ldquo;last
        updated&rdquo; date and, where appropriate, an in-app notice. These Terms are governed by the
        laws of Washington, USA, and disputes will be handled in the courts of Washington, USA, except
        where local law gives you other rights.
      </p>
      <p>
        Questions about these Terms? Contact <a href="mailto:me@davidpuerto.com">me@davidpuerto.com</a>.
      </p>
    </LegalDoc>
  );
}
