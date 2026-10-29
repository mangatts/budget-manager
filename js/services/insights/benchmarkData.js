// Benchmarks the coach compares against, each with its source (INSIGHTS.md, E4-S1).
// Verified October 2026. Update `asOf` and values when BLS publishes a new year (usually September–December).
//
// Two kinds:
// - `income`   rules of thumb measured against income (50/30/20, HUD housing, CFPB debt).
// - `spending` typical share of a household's SPENDING (BLS Consumer Expenditures). These are not
//              shares of income: the app compares them to the share of your money out.

const BLS = {
  source: 'U.S. Bureau of Labor Statistics, Consumer Expenditures in 2024 (USDL-25-1586)',
  url: 'https://www.bls.gov/news.release/cesan.nr0.htm',
  asOf: '2025-12-19',
};

// BLS 2024 average annual spending, all consumer units (Table A).
// "Personal insurance and pensions" ($9,797, mostly Social Security payroll deductions) is left out
// of the base, because people don't record payroll deductions as spending.
export const BLS_2024 = Object.freeze({
  totalSpending: 78_535,
  personalInsuranceAndPensions: 9_797,
  base: 68_738, // totalSpending − personalInsuranceAndPensions
  dollars: Object.freeze({
    housing: 26_266, // includes utilities
    transportation: 13_318,
    food_home: 6_224,
    food_away: 3_945,
    healthcare: 6_197,
    entertainment: 3_609,
    apparel: 2_001,
    personal_care: 978,
    education: 1_569,
    cash_contributions: 2_292,
  }),
});

const spendingShare = (key, label, note) => Object.freeze({
  key,
  label,
  kind: 'spending',
  share: Math.round((BLS_2024.dollars[key] / BLS_2024.base) * 1000) / 1000, // e.g. 0.057
  note,
  ...BLS,
});

export const SPENDING_BENCHMARKS = Object.freeze({
  housing: spendingShare('housing', 'Housing (rent or mortgage, utilities, upkeep)'),
  transportation: spendingShare('transportation', 'Transportation (car payments, gas, insurance, transit)'),
  food_home: spendingShare('food_home', 'Groceries'),
  food_away: spendingShare('food_away', 'Dining out'),
  healthcare: spendingShare('healthcare', 'Health care and insurance'),
  entertainment: spendingShare('entertainment', 'Entertainment (incl. streaming and subscriptions)'),
  apparel: spendingShare('apparel', 'Clothing and shoes'),
  personal_care: spendingShare('personal_care', 'Personal care'),
  education: spendingShare('education', 'Education'),
  cash_contributions: spendingShare('cash_contributions', 'Gifts and donations'),
});

export const INCOME_BENCHMARKS = Object.freeze({
  needs: Object.freeze({
    key: 'needs', kind: 'income', label: 'Needs', share: 0.5,
    note: 'Must-pays: housing, utilities, groceries, transportation, insurance, minimum debt payments.',
    source: 'The 50/30/20 rule of thumb (Elizabeth Warren and Amelia Warren Tyagi, All Your Worth, 2005)',
    url: null, asOf: '2005-03-01',
  }),
  wants: Object.freeze({
    key: 'wants', kind: 'income', label: 'Wants', share: 0.3,
    note: 'Nice-to-haves: dining out, shopping, entertainment, subscriptions.',
    source: 'The 50/30/20 rule of thumb (Elizabeth Warren and Amelia Warren Tyagi, All Your Worth, 2005)',
    url: null, asOf: '2005-03-01',
  }),
  savings: Object.freeze({
    key: 'savings', kind: 'income', label: 'Savings', share: 0.2,
    note: 'Savings, investing, and extra debt payoff.',
    source: 'The 50/30/20 rule of thumb (Elizabeth Warren and Amelia Warren Tyagi, All Your Worth, 2005)',
    url: null, asOf: '2005-03-01',
  }),
  housing: Object.freeze({
    key: 'housing', kind: 'income', label: 'Housing', share: 0.3, severeShare: 0.5,
    note: 'Housing costs including utilities above 30% of income is "cost-burdened"; above 50% is "severely cost-burdened". HUD measures against gross (before-tax) income.',
    source: 'U.S. Department of Housing and Urban Development (HUD), CHAS definitions',
    url: 'https://www.huduser.gov/portal/datasets/cp/CHAS/bg_chas.html', asOf: '2026-10-01',
  }),
  debt: Object.freeze({
    key: 'debt', kind: 'income', label: 'Debt payments', share: 0.36, rentersShare: 0.2,
    note: 'Keep all monthly debt payments at or below 36% of gross income if you own a home; 15–20% (not counting rent) if you rent.',
    source: 'Consumer Financial Protection Bureau (CFPB), Your Money, Your Goals: debt-to-income tool',
    url: 'https://files.consumerfinance.gov/f/documents/cfpb_your-money-your-goals_debt_income_calc_tool_2018-11_ADA.pdf', asOf: '2018-11-01',
  }),
  emergency: Object.freeze({
    key: 'emergency', kind: 'savings', label: 'Emergency fund', months: [3, 6],
    note: 'Save 3 to 6 months of living expenses for emergencies.',
    source: 'Consumer Financial Protection Bureau (CFPB)',
    url: 'https://www.consumerfinance.gov/', asOf: '2026-10-01',
  }),
});

// Which spending benchmark each default category's benchmarkKey maps to.
export const CATEGORY_BENCHMARK = Object.freeze({
  housing: 'housing', utilities: 'housing', transportation: 'transportation',
  food_home: 'food_home', food_away: 'food_away', healthcare: 'healthcare',
  entertainment: 'entertainment', apparel_misc: 'apparel', personal_care: 'personal_care', gifts: 'cash_contributions',
});
