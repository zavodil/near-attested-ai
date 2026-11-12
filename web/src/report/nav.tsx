/** The same navigation on every page of the report. */
const LINKS: [string, string, string][] = [
  ['overview', '#/', 'Overview'],
  ['whynow', '#/why-now', 'Why now'],
  ['day', '#/day', 'A company’s day'],
  ['attacks', '#/attacks', 'Getting around it'],
  ['why', '#/why', 'Why OutLayer'],
  ['verify', '#/verify', 'Verify it'],
];

export function PageNav({ current }: { current: string }) {
  return (
    <nav className="page-nav">
      <a href="#/" className="brand">
        <span className="brand-mark" />
        <span>Provable AI Compliance</span>
      </a>
      <span>
        {LINKS.map(([key, href, label]) => (
          <a key={key} href={href} className={current === key ? 'on' : ''}>
            {label}
          </a>
        ))}
      </span>
    </nav>
  );
}

const NEXT: [string, string, string, string][] = [
  ['whynow', '#/why-now', 'Why it matters now', 'The law that already applies, real cases from Samsung to Air Canada and Workday, why a log is not proof, and the size of the market.'],
  ['day', '#/day', 'A company’s day', 'Rules selected, a request answered, a prohibited practice blocked, hiring and credit decisions approved by their officers, a no. Every step with its screens and evidence.'],
  ['attacks', '#/attacks', 'Getting around it', 'A former employee, an employee’s own rules or key, a personal project and a forged label. Each one refused.'],
  ['why', '#/why', 'Why OutLayer', 'What the platform gives this product out of the box, what NEAR AI gains, and who controls each layer.'],
  ['verify', '#/verify', 'Verify it yourself', 'Every attested run of the day, checked in your browser: Intel’s quote, the packs on NEAR, NEAR AI’s Intel and NVIDIA evidence, both signatures on the label.'],
];

/** The bottom of every page: where to go next. */
export function SeeNext({ current }: { current: string }) {
  return (
    <section className="see-next">
      <h2>See next</h2>
      <div className="see-next-tiles">
        {NEXT.filter(([key]) => key !== current).map(([key, href, title, text]) => (
          <a key={key} href={href} className="see-next-tile">
            <b>{title} →</b>
            <span>{text}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      A fictional company. Built on <a href="https://outlayer.ai">OutLayer</a> and <a href="https://cloud.near.ai">NEAR AI Cloud</a>, on NEAR. Not legal advice.
    </footer>
  );
}
