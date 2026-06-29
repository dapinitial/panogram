import type { Metadata } from "next";
import Link from "next/link";
import LegalDoc from "@/components/LegalDoc";

export const metadata: Metadata = {
  title: "Copyright / DMCA — Panogram",
  description: "How to report copyright infringement on Panogram.",
};

export default function DmcaPage() {
  return (
    <LegalDoc
      title="Copyright &amp; DMCA"
      updated="June 29, 2026"
      intro={
        <p>
          We respect intellectual property and expect Panogram users to do the same. If you believe
          content on Panogram infringes your copyright, you can ask us to remove it using the process
          below.
        </p>
      }
    >
      <h2>Reporting infringement</h2>
      <p>
        Send a written notice to our copyright agent at <a href="mailto:[CONTACT]">[CONTACT]</a> with
        the subject line &ldquo;Copyright Notice.&rdquo; To be valid, your notice should include:
      </p>
      <ol>
        <li>Your physical or electronic signature.</li>
        <li>Identification of the copyrighted work you claim has been infringed.</li>
        <li>Identification of the material you claim is infringing, with enough detail for us to locate it (for example, the Panogram link or <code>/p/&hellip;</code> URL).</li>
        <li>Your contact information (name, address, email).</li>
        <li>A statement that you have a good-faith belief the use is not authorized by the copyright owner, its agent, or the law.</li>
        <li>A statement, under penalty of perjury, that the information in your notice is accurate and that you are the owner or authorized to act on the owner&rsquo;s behalf.</li>
      </ol>

      <h2>What happens next</h2>
      <p>
        When we receive a valid notice, we will remove or disable access to the material and make a
        reasonable effort to notify the person who posted it. The affected capture is taken down so it
        is no longer publicly visible.
      </p>

      <h2>Counter-notice</h2>
      <p>
        If you believe your content was removed by mistake or misidentification, you may send a
        counter-notice to <a href="mailto:[CONTACT]">[CONTACT]</a> including your signature,
        identification of the removed material and where it appeared, a statement under penalty of
        perjury that you have a good-faith belief it was removed in error, your contact information,
        and your consent to the jurisdiction of the courts in [JURISDICTION].
      </p>

      <h2>Repeat infringers</h2>
      <p>
        Consistent with our <Link href="/terms">Terms</Link>, we may suspend or terminate the
        accounts of users who repeatedly infringe the copyrights of others.
      </p>

      <h2>A note on placeholder content</h2>
      <p>
        Some demonstration panoramas shown during early development may be sample or
        third-party images used for prototyping; these are being replaced with licensed and
        creator-owned content. If you believe a demo image is yours, contact{" "}
        <a href="mailto:[CONTACT]">[CONTACT]</a> and we will remove it promptly.
      </p>
    </LegalDoc>
  );
}
