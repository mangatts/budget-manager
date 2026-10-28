// Default categories (ARCHITECTURE.md §9). Seeded once on first run; after that they're the user's
// to rename or hide, and seeding never runs again (tracked in meta).
// bucket: 50/30/20 group for the benchmarks (INSIGHTS.md). benchmarkKey: links to benchmark data.

const expense = (id, name, icon, bucket, benchmarkKey) => ({ id: `c-${id}`, name, icon, type: 'expense', bucket, benchmarkKey, archived: false });
const income = (id, name, icon) => ({ id: `c-${id}`, name, icon, type: 'income', bucket: null, benchmarkKey: null, archived: false });

export const DEFAULT_CATEGORIES = Object.freeze([
  expense('housing', 'Housing', '🏠', 'need', 'housing'),
  expense('utilities', 'Utilities', '💡', 'need', 'utilities'),
  expense('groceries', 'Groceries', '🛒', 'need', 'food_home'),
  expense('transportation', 'Transportation', '🚌', 'need', 'transportation'),
  expense('gas', 'Gas', '⛽', 'need', 'transportation'),
  expense('health', 'Health & Insurance', '🩺', 'need', 'healthcare'),
  expense('debt-min', 'Debt Payments', '💳', 'need', 'debt'),
  expense('dining', 'Dining Out', '🍽️', 'want', 'food_away'),
  expense('shopping', 'Shopping', '🛍️', 'want', 'apparel_misc'),
  expense('subscriptions', 'Subscriptions', '📺', 'want', 'entertainment'),
  expense('entertainment', 'Entertainment', '🎟️', 'want', 'entertainment'),
  expense('personal-care', 'Personal Care', '🧴', 'want', 'personal_care'),
  expense('gifts', 'Gifts', '🎁', 'want', 'gifts'),
  expense('savings', 'Savings & Investing', '🏦', 'savings', 'savings'),
  expense('debt-extra', 'Extra Debt Payoff', '📉', 'savings', 'savings'),
  expense('other', 'Other', '📦', 'want', null),
  income('paycheck', 'Paycheck', '💼'),
  income('side', 'Side Income', '🧰'),
  income('gifts-received', 'Gifts Received', '🎉'),
  income('refunds', 'Refunds', '↩️'),
  income('other-income', 'Other Income', '➕'),
].map((category, order) => Object.freeze({ ...category, order })));

const SEEDED_KEY = 'seededCategories';

export async function seedCategoriesOnce(repo) {
  if (await repo.get('meta', SEEDED_KEY)) return false;
  await repo.putMany('categories', DEFAULT_CATEGORIES.map((c) => ({ ...c })));
  await repo.put('meta', { key: SEEDED_KEY, value: 1 });
  return true;
}
