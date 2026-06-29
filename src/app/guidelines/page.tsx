import type { Metadata } from "next";
import Link from "next/link";
import LegalDoc from "@/components/LegalDoc";

export const metadata: Metadata = {
  title: "Community Guidelines — Panogram",
  description: "What's allowed on Panogram, and what gets removed.",
};

export default function GuidelinesPage() {
  return (
    <LegalDoc
      eyebrow="Community"
      title="Community Guidelines"
      updated="June 29, 2026"
      intro={
        <p>
          Panogram lets people step inside real places. That only works if it feels safe. These
          guidelines describe what&rsquo;s welcome and what we remove. They are part of our{" "}
          <Link href="/terms">Terms</Link>, and they map directly to the reasons you can choose when
          you report something.
        </p>
      }
    >
      <h2>The basics</h2>
      <p>
        Share immersive captures you have the right to share. Be a real person, be respectful, and
        assume the people in your panoramas didn&rsquo;t consent to being a backdrop. When in doubt,
        leave it out.
      </p>

      <h2>What gets removed</h2>
      <p>These map to the report reasons in the app:</p>
      <ul>
        <li><b>Spam &amp; scams.</b> Repetitive, deceptive or bulk content, fake engagement, phishing, or misleading links and &ldquo;products.&rdquo;</li>
        <li><b>Harassment.</b> Targeted abuse, bullying, threats, or unwanted contact directed at a person — including through spatial tags or comments.</li>
        <li><b>Hate.</b> Attacks or dehumanization based on race, ethnicity, national origin, religion, disability, sex, gender, sexual orientation, or similar protected characteristics.</li>
        <li><b>Nudity &amp; sexual content.</b> Explicit sexual content, and any non-consensual intimate imagery. Content that sexualizes minors is never allowed and is reported to authorities.</li>
        <li><b>Violence.</b> Graphic violence, threats of violence, glorification of violence, or content that incites harm.</li>
        <li><b>Illegal activity.</b> Promotion or facilitation of illegal goods, services, or conduct.</li>
        <li><b>Infringement.</b> Content you don&rsquo;t have the rights to — see <Link href="/legal/dmca">Copyright / DMCA</Link>.</li>
      </ul>

      <h2>Privacy &amp; people in your captures</h2>
      <p>
        360° media captures everything around you. Don&rsquo;t publish content that exposes someone&rsquo;s
        private information or puts them at risk, and be thoughtful about precise locations — homes,
        schools, and other sensitive places. You can publish without exact coordinates.
      </p>

      <h2>How enforcement works</h2>
      <p>
        Anyone can report a capture, a creator, or a comment using the <b>⚑ report</b> control, and
        can <b>block</b> users so their content disappears from view. Our team reviews reports and may
        remove content, limit reach, or suspend accounts. Severe violations — especially anything
        involving child safety — are escalated immediately and, where required, reported to the
        relevant authorities.
      </p>

      <h2>If we get it wrong</h2>
      <p>
        Moderation isn&rsquo;t perfect. If you believe we removed something in error, contact{" "}
        <a href="mailto:me@davidpuerto.com">me@davidpuerto.com</a> and we&rsquo;ll take another look.
      </p>
    </LegalDoc>
  );
}
