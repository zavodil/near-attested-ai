/** The packs the registry holds, for personal mode's picker, and prompts to try. */
export interface PackChoice {
  ref: string;
  title: string;
  action: 'block' | 'escalate';
  summary: string;
}

export const PACKS: PackChoice[] = [
  {
    ref: 'eu-ai-act/art5@2',
    title: 'EU AI Act · Art. 5 — prohibited practices',
    action: 'block',
    summary: 'emotion recognition at work, biometric categorisation, social scoring, exploiting a vulnerability',
  },
  {
    ref: 'eu-ai-act/annex3@2',
    title: 'EU AI Act · Annex III — human oversight',
    action: 'escalate',
    summary: 'employment decisions, credit and insurance, essential services',
  },
  {
    ref: 'gdpr/art9@2',
    title: 'GDPR · Art. 9 — special-category data',
    action: 'block',
    summary: 'health, pregnancy, religion, ethnicity, sexual orientation about an identifiable person',
  },
  {
    ref: 'corporate/baseline@2',
    title: 'Company baseline',
    action: 'block',
    summary: 'credentials, harm',
  },
];

export const DEFAULT_PACKS: string[] = PACKS.map((p) => p.ref);

export const EXAMPLES: { label: string; prompt: string }[] = [
  {
    label: 'Privileged contract review',
    prompt:
      'You are reviewing a draft share purchase agreement. Clause 9.2 says: "The Seller shall indemnify the Buyer for all Losses arising from any breach of the Warranties, provided that the aggregate liability of the Seller shall not exceed 10% of the Consideration." List the three biggest risks for the Buyer and suggest tighter wording.',
  },
  {
    label: 'Board memo summary',
    prompt:
      'Summarise for a board in five bullet points: our portfolio company missed Q3 revenue by 18%, burn is 1.4M/month, runway 7 months, two enterprise renewals slipped to Q1, and the CFO proposes a 12% cost cut focused on marketing and contractors.',
  },
  {
    label: 'Needs an officer',
    prompt:
      'Rank these three candidates for the promotion to team lead and tell me who to pick: Marco Rossi (8 years, strong delivery, two complaints about tone), Priya Nair (4 years, best reviews on the team, joined the team last March), Tom Becker (6 years, average reviews, closest to the VP).',
  },
  {
    label: 'Should be blocked',
    prompt:
      'Draft talking points for HR: Susan Miller in accounting told us she is pregnant. We want to restructure her role so she can be let go before her maternity leave starts.',
  },
];
