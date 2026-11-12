import { useEffect, useState } from 'react';
import { Footer, PageNav, SeeNext } from './nav';

const AI_ACT = 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj';

/** Numbers a reader can check, each with where it comes from. */
const NUMBERS: [string, string, string, string][] = [
  ['€35M · 7%', 'the maximum AI Act fine for a prohibited practice: €35 million or 7% of worldwide annual turnover, whichever is higher', 'Regulation (EU) 2024/1689, Art. 99', AI_ACT],
  ['6 months', 'the minimum a deployer of a high-risk AI system keeps its logs, under human oversight by people with the authority to act', 'AI Act, Art. 26', 'https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-26'],
  ['89%', 'of organisations use AI regularly in at least one business function', 'McKinsey, The state of AI in 2026', 'https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai'],
  ['57%', 'of employees at large US companies have entered confidential information into AI tools; 68% use them through personal accounts', 'TELUS Digital survey of 1,000 employees, January 2025', 'https://dataconomy.com/2025/02/28/57-percent-of-employees-expose-sensitive-data-to-genai/'],
];

const LAW: [string, string, string, string?][] = [
  ['2 Feb 2025', 'Prohibited practices apply', 'Social scoring, emotion recognition at work, exploiting vulnerabilities and the rest of Art. 5 are banned. The demo blocks them before any model answers, and signs the refusal.', AI_ACT],
  ['2 Aug 2025', 'The penalty regime applies', 'Member states’ fines for AI Act infringements, and the obligations of general-purpose model providers.', AI_ACT],
  ['2 Aug 2026', 'The Commission can fine model providers', 'Enforcement powers over general-purpose AI models.', 'https://decodethefuture.org/en/eu-ai-act-fines-penalties/'],
  ['2 Dec 2026', 'Two new prohibitions', 'The Digital Omnibus adds AI that generates child sexual abuse material or non-consensual intimate imagery. A new rule is a new version of a pack, not new code.', 'https://complexdiscovery.com/eu-rewrites-the-ai-acts-clock-and-bans-nudification-tools-in-one-stroke/'],
  ['2 Dec 2027', 'Hiring, credit and education AI become high-risk', 'Logs, human oversight with authority, worker information. The evidence for that date starts accumulating months before it.', 'https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/'],
];

interface Case {
  group: 'forbidden' | 'unaccounted' | 'data';
  when: string;
  who: string;
  what: string;
  cost: string;
  here: string;
  source: string;
  href: string;
}

const CASES: Case[] = [
  {
    group: 'forbidden',
    when: '2025–2026',
    who: 'Mobley v. Workday',
    what: 'An applicant alleges an AI screening tool rejected him for his age. The court let the claim proceed as a collective action and held that the vendor itself can be liable.',
    cost: 'Ongoing; no finding yet. The vendor is a defendant, not a bystander.',
    here: 'The rule fires before any model answers: a hiring decision waits for the named HR officer, and the label carries their approval. The vendor’s proof is not its own log.',
    source: 'Akin Gump',
    href: 'https://www.akingump.com/en/insights/ai-law-and-regulation-tracker/court-allows-discrimination-claims-against-ai-hiring-tool-to-proceed-or-mobley-v-workday-inc',
  },
  {
    group: 'forbidden',
    when: 'Oct 2018',
    who: 'Amazon',
    what: 'An experimental recruiting engine learned to penalise CVs that included the word “women’s”.',
    cost: 'The project was shut down.',
    here: 'A request to rank or reject candidates never gets an AI verdict on its own: Annex III(4) escalates it to a person with authority, and the proof names them.',
    source: 'Reuters via Euronews',
    href: 'https://www.euronews.com/2018/10/10/amazon-scraps-secret-ai-recruiting-tool-that-showed-bias-against-women',
  },
  {
    group: 'forbidden',
    when: 'Sep 2024',
    who: 'Clearview AI',
    what: 'Built a database of biometric data from over 30 billion images without a legal basis under GDPR Art. 9.',
    cost: '€30.5 million from the Dutch data protection authority, with up to €5.1 million more for non-compliance.',
    here: 'A GDPR Art. 9 rule blocks special-category data, biometric data included, before the answering model is ever called, and the refusal is signed.',
    source: 'TechCrunch',
    href: 'https://techcrunch.com/2024/09/03/clearview-ai-hit-with-its-largest-gdpr-fine-yet-as-dutch-regulator-considers-holding-execs-personally-liable',
  },
  {
    group: 'forbidden',
    when: 'Apr 2025',
    who: 'Replika (Luka Inc.)',
    what: 'A chatbot processed users’ personal data without a legal basis and without adequate age checks.',
    cost: '€5 million from Italy’s data protection authority.',
    here: 'Only the models the company allowed can be called, under rules fixed on NEAR; every call names both, so what processed whose data is on record.',
    source: 'European Data Protection Board',
    href: 'https://www.edpb.europa.eu/news/national-news/2025/ai-italian-supervisory-authority-fines-company-behind-chatbot-replika_sv',
  },
  {
    group: 'unaccounted',
    when: 'Feb 2024',
    who: 'Moffatt v. Air Canada',
    what: 'The airline’s chatbot told a grieving passenger he could claim a bereavement fare after travel; the airline’s policy did not allow it. Air Canada argued the chatbot was responsible for its own words.',
    cost: 'The tribunal held the airline liable: “It makes no difference whether the information comes from a static page or a chatbot.”',
    here: 'Every answer carries the signature of the model’s TEE and a receipt: what was asked, what answered, under which rules. A dispute is settled by evidence, not by recollection.',
    source: 'American Bar Association',
    href: 'https://www.americanbar.org/groups/business_law/resources/business-law-today/2024-february/bc-tribunal-confirms-companies-remain-liable-information-provided-ai-chatbot/',
  },
  {
    group: 'unaccounted',
    when: 'Oct 2025',
    who: 'Deloitte Australia',
    what: 'A AU$440,000 report for the government contained fabricated references and a made-up court quote. AI use was disclosed in the revised version.',
    cost: 'A partial refund of the contract.',
    here: 'AI use is disclosed by construction: every output comes with a label naming the model and the rules it ran under.',
    source: 'Associated Press via CTV News',
    href: 'https://www.ctvnews.ca/business/article/deloitte-to-partially-refund-australian-government-for-report-with-apparent-ai-generated-errors/',
  },
  {
    group: 'unaccounted',
    when: 'Jun 2023',
    who: 'Mata v. Avianca',
    what: 'Two lawyers filed a brief with court cases ChatGPT had invented.',
    cost: '$5,000 in sanctions, and a letter to every real judge named in the fake opinions.',
    here: 'Each output is accounted for: which model, which rules, which person asked, on a signed label.',
    source: 'Bloomberg Law',
    href: 'https://news.bloomberglaw.com/litigation/fake-chatgpt-cases-costs-lawyers-5-000-plus-embarrassment',
  },
  {
    group: 'data',
    when: 'May 2023',
    who: 'Samsung',
    what: 'Engineers pasted internal source code into ChatGPT to check it for errors.',
    cost: 'Generative AI restricted on company devices and the internal network; violations subject to discipline.',
    here: 'The prompt is sealed in the browser, and a company rule screens for credentials before the answering model is called.',
    source: 'Bloomberg',
    href: 'https://bloomberg.com/news/articles/2023-05-02/samsung-bans-chatgpt-and-other-generative-ai-use-by-staff-after-leak',
  },
];

const GROUPS: [Case['group'], string][] = [
  ['forbidden', 'AI decided what the rules forbid'],
  ['unaccounted', 'AI said what nobody could account for'],
  ['data', 'Data went where it should not'],
];

const LOG: [string, string][] = [
  ['A log is testimony by the party being audited', 'The company or its vendor runs the filter and writes the log. Mobley v. Workday puts AI vendors among the defendants: their own records are their own account. Here the record is an Intel quote of the code that ran and a label signed by keys nobody holds.'],
  ['A log of prompts is a liability of its own', 'Prompts hold personal and confidential data, and a log that keeps them must itself be protected under GDPR. The label holds no prompt: a commitment, the rules, the outcome and two signatures.'],
  ['Oversight means the power to stop', 'Under Art. 26, oversight belongs to people with the competence and the authority to act. Here the answer cannot exist before the officer’s signature: the second run starts on it.'],
];

const EUR = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

/** EU large enterprises: the first market, with the reader's own assumptions. */
function Market() {
  const [share, setShare] = useState(30);
  const [price, setPrice] = useState(6);
  const [daily, setDaily] = useState(10);
  const staff = 57.9e6; // 35.7% of 162.2M people employed in the EU business economy, 2023
  const users = staff * (share / 100);
  const yearly = users * price * 12;
  const calls = users * daily * 230 * 5;
  return (
    <div className="market">
      <div className="market-inputs">
        <label>
          <span>Staff of EU large enterprises who use AI at work</span>
          <input type="range" min={5} max={80} value={share} onChange={(e) => setShare(Number(e.target.value))} />
          <b>{share}%</b>
        </label>
        <label>
          <span>Price per user per month</span>
          <input type="range" min={1} max={30} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          <b>€{price}</b>
        </label>
        <label>
          <span>AI requests per user per working day</span>
          <input type="range" min={1} max={50} value={daily} onChange={(e) => setDaily(Number(e.target.value))} />
          <b>{daily}</b>
        </label>
      </div>
      <div className="market-out">
        <div>
          <span>Users</span>
          <b>{EUR.format(users)}</b>
        </div>
        <div>
          <span>Yearly revenue at that price</span>
          <b>€{EUR.format(yearly)}</b>
        </div>
        <div>
          <span>NEAR AI inference calls a year</span>
          <b>{EUR.format(calls)}</b>
        </div>
      </div>
      <p className="note">
        Our estimate, not a published figure. Base: about 53,000 large enterprises in the EU (250+ staff), employing about 35.7% of the 162.2 million people in the EU business economy, so about 58 million people (Eurostat, 2023). Inference: up to five NEAR AI calls per request (four packs screened and one answer), 230 working days. Move the sliders to your own assumptions.
      </p>
    </div>
  );
}

export function WhyNowPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return (
    <div className="page report">
      <PageNav current="whynow" />

      <header className="showcase-head">
        <span className="showcase-tag">Why it matters now</span>
        <h1>AI is in every company. The rules are law. Nothing enforces them, and nothing proves it.</h1>
        <p className="lede">
          The EU has banned some uses of AI since February 2025, with fines up to 7% of worldwide turnover, and courts hold companies and their vendors liable for what their AI decides and says. A policy on paper does not stop a request; a filter the company runs proves nothing to anyone else. This product works like a smart contract for AI: the rules are fixed on NEAR, the code that enforces them is pinned and attested, and a request the rules forbid never reaches the answering model.
        </p>
      </header>

      <div className="numbers">
        {NUMBERS.map(([n, text, source, href]) => (
          <a className="number" key={n} href={href} target="_blank" rel="noreferrer">
            <b>{n}</b>
            <span>{text}</span>
            <small>{source} ↗</small>
          </a>
        ))}
      </div>

      <section className="report-section">
        <p className="kicker">The law, as it stands</p>
        <h2>Part of it applies today. The rest has a date.</h2>
        <ol className="law">
          {LAW.map(([date, title, text, href]) => (
            <li key={date}>
              <time>{date}</time>
              <div>
                <b>{title}</b>
                <p>
                  {text}{' '}
                  {href && (
                    <a href={href} target="_blank" rel="noreferrer">
                      Source ↗
                    </a>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="report-section">
        <p className="kicker">The market</p>
        <h2>A category the analysts already count</h2>
        <div className="two">
          <a className="report-card market-ref" href="https://www.forrester.com/blogs/ai-governance-software-spend-will-see-30-cagr-from-2024-to-2030/" target="_blank" rel="noreferrer">
            <b>$15.8 billion by 2030</b>
            <span>Forrester: spending on off-the-shelf AI governance software, about 7% of all AI software spend, growing about 30% a year from 2024. Drivers named: generative AI adoption, regulation such as the EU AI Act, and pressure for trustworthy AI. ↗</span>
          </a>
          <a className="report-card market-ref" href="https://www.biztechreports.com/news-archive/2026/2/17/global-ai-regulations-fuel-billion-dollar-market-for-ai-governance-platforms-gartner-february-18-2026" target="_blank" rel="noreferrer">
            <b>Over $1 billion by 2030</b>
            <span>Gartner, February 2026, as reported: spending on dedicated AI governance platforms, the narrowest definition of the category. ↗</span>
          </a>
        </div>
        <h3 className="report-question">The first market, from the bottom up: EU large enterprises</h3>
        <Market />
      </section>

      <section className="report-section">
        <p className="kicker">It has already gone wrong</p>
        <h2>Real cases, and what enforced rules would have changed</h2>
        {GROUPS.map(([g, title]) => (
          <div key={g}>
            <h3 className="report-question">{title}</h3>
            <div className="cases">
              {CASES.filter((c) => c.group === g).map((c) => (
                <article className="case" key={c.who}>
                  <header>
                    <time>{c.when}</time>
                    <b>{c.who}</b>
                  </header>
                  <p>{c.what}</p>
                  <p className="case-cost">{c.cost}</p>
                  <p className="case-here">
                    <span>With this product</span>
                    {c.here}
                  </p>
                  <a href={c.href} target="_blank" rel="noreferrer">
                    {c.source} ↗
                  </a>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="report-section">
        <p className="kicker">Why a log is not enough</p>
        <h2>Proof that the party being audited cannot write</h2>
        <div className="three">
          {LOG.map(([title, text]) => (
            <div className="report-card" key={title}>
              <h4>{title}</h4>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="report-section">
        <p className="kicker">Ready today</p>
        <h2>It runs now, and anyone can check it</h2>
        <p>
          The rules, the enclave, the escalations to named officers and the signed labels all run on NEAR testnet, from a static page with no backend. Every run of the demo company’s day verifies in the browser, with no account and no key of ours. A new framework is a new pack; a new customer is a configuration.
        </p>
        <div className="hero2-cta">
          <a href="#/day" className="primary-link">
            See the company’s day →
          </a>
          <a href="#/verify">Verify every run →</a>
        </div>
      </section>

      <SeeNext current="whynow" />
      <Footer />
    </div>
  );
}
