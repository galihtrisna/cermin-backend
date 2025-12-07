// src/utils/fees.js

function calculateAdminFee(price) {
  let fee = price * 0.02; // 2%

  // Minimal 1000
  if (fee < 1000) {
    fee = 1000;
  }

  // Pembulatan ke atas kelipatan 100
  fee = Math.ceil(fee / 100) * 100;

  return fee;
}

// PENTING: Gunakan kurung kurawal agar diekspor sebagai object
module.exports = { calculateAdminFee };