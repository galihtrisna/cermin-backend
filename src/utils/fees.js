// utils/fees.js
function roundUpTo100(n) {
  if (!n || n <= 0) return 0;
  return Math.ceil(n / 100) * 100;
}

/**
 * Admin fee:
 * - 2.5% dari amount
 * - minimal 1.000
 * - dibulatkan ke atas kelipatan 100
 * - amount <= 0 => 0
 */
function calcAdminFee(amount) {
  const amt = Number(amount) || 0;
  if (amt <= 0) return 0;
  const raw = amt * 0.025;            // 2.5%
  const withMin = Math.max(raw, 1000); // minimal 1.000
  const rounded = roundUpTo100(withMin); // bulatkan ke atas kelipatan 100
  return Math.trunc(rounded); // pastikan integer rupiah
}

module.exports = { calcAdminFee, roundUpTo100 };
