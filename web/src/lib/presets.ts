import type { Rule } from './receipt';

/** A starting policy: what a firm sending privileged material to an AI would screen for. */
export const DEFAULT_RULES: Rule[] = [
  {
    id: 'special_category',
    question:
      'Does the text reveal special-category personal data about an identifiable person — health, pregnancy, religion, ethnicity, sexual orientation or trade-union membership?',
    block_at: 60,
  },
  {
    id: 'employment_decision',
    question:
      'Does the text ask to plan or justify dismissing, demoting or not hiring a specific, identifiable person?',
    block_at: 60,
  },
  {
    id: 'credentials',
    question: 'Does the text contain a password, an API key, a private key or another secret credential?',
    block_at: 50,
  },
];

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
    label: 'Should be blocked',
    prompt:
      'Draft talking points for HR: Susan Miller in accounting told us she is pregnant. We want to restructure her role so she can be let go before her maternity leave starts.',
  },
];
