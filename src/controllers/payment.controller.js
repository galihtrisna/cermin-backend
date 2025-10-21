const supabase = require("../utils/supabase");
const calcAdminFee = require("../utils/fees")
/**
 * GET /payments
 * Query:
 *  - page=1&limit=10
 *  - order_id, status, midtrans_id
 *  - sort_by=paid_at|created_at|status (default: paid_at)
 *  - sort_dir=asc|desc (default: desc)
 */
exports.getPayments = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page ?? "1", 10), 1);
    const rawLimit = Math.max(parseInt(req.query.limit ?? "10", 10), 1);
    const limit = Math.min(rawLimit, 100);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const orderId = (req.query.order_id || "").trim();
    const status = (req.query.status || "").trim();
    const midtransId = (req.query.midtrans_id || "").trim();

    const SORTABLE = new Set(["paid_at", "created_at", "status"]);
    const sortBy = SORTABLE.has((req.query.sort_by || "").trim())
      ? req.query.sort_by.trim()
      : "paid_at";
    const sortDir = (req.query.sort_dir || "desc").toLowerCase() === "asc" ? "asc" : "desc";

    let q = supabase.from("payment").select("*", { count: "exact" });
    if (orderId) q = q.eq("order_id", orderId);
    if (status) q = q.eq("status", status);
    if (midtransId) q = q.eq("midtrans_id", midtransId);

    q = q.order(sortBy, { ascending: sortDir === "asc" }).range(from, to);

    const { data, count, error } = await q;
    if (error) throw error;

    res.status(200).json({
      message: "Get payments successfully",
      meta: {
        page,
        limit,
        total: count ?? 0,
        total_pages: Math.max(Math.ceil((count ?? 0) / limit), 1),
        sort_by: sortBy,
        sort_dir: sortDir,
        filters: { order_id: orderId || null, status: status || null, midtrans_id: midtransId || null },
      },
      data,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error while getting payments", error: e.message });
  }
};

/** GET /payments/:id */
exports.getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from("payment").select("*").eq("id", id).single();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: "Payment not found" });
    res.status(200).json({ message: "Get payment by ID successfully", data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error while getting payment", error: e.message });
  }
};

/**
 * POST /payments
 * Body: { order_id, channel?, midtrans_id? }
 * - ambil amount dari tabel "order"
 * - hitung admin_fee & gross_amount (tidak disimpan ke DB dalam skema saat ini)
 * - buat payment (status default: pending)
 */
exports.createPayment = async (req, res) => {
  try {
    const { order_id, channel, midtrans_id } = req.body;
    if (!order_id) return res.status(400).json({ message: "order_id is required" });

    // 1) ambil order
    const { data: order, error: e1 } = await supabase
      .from("order")
      .select("id, amount, status")
      .eq("id", order_id)
      .single();
    if (e1 || !order) return res.status(404).json({ message: "Order not found" });

    // 2) hitung fee
    const ticketAmount = Number(order.amount) || 0;
    const admin_fee = calcAdminFee(ticketAmount);
    const gross_amount = ticketAmount + admin_fee;

    // 3) insert payment (tanpa admin_fee & gross_amount karena belum ada kolomnya)
    const { data: payment, error: e2 } = await supabase
      .from("payment")
      .insert([
        {
          order_id,
          midtrans_id: midtrans_id ?? null,
          channel: channel ?? null,
          status: "pending",
          paid_at: null,
          // NOTE:
          // kalau kamu sudah menambah kolom:
          // admin_fee,
          // gross_amount,
        },
      ])
      .select()
      .single();
    if (e2) throw e2;

    // 4) balikin breakdown biar bisa dipakai buat Midtrans item_details
    res.status(201).json({
      message: "Payment attempt created",
      data: {
        payment,
        breakdown: {
          ticket_amount: ticketAmount,
          admin_fee,
          gross_amount,
        },
      },
    });
  } catch (e) {
    console.error(e);
    const fk = /foreign key|violates foreign key/i.test(e.message || "");
    res.status(fk ? 400 : 500).json({
      message: fk ? "Invalid order_id" : "Error while creating payment",
      error: e.message,
    });
  }
};

/**
 * PUT /payments/:id
 * Body: { status?, paid_at?, channel?, midtrans_id? }
 * - Jika status menjadi settlement/paid, opsional: sinkronkan status order -> "paid"
 */
exports.updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = {};
    ["status", "paid_at", "channel", "midtrans_id"].forEach((k) => {
      if (req.body[k] !== undefined) payload[k] = req.body[k];
    });
    if (!Object.keys(payload).length) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    const { data: payment, error } = await supabase
      .from("payment")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    // sinkron status order (opsional — sederhana)
    const newStatus = (payload.status || "").toLowerCase();
    if (newStatus === "settlement" || newStatus === "paid") {
      const { data: payRow } = await supabase
        .from("payment")
        .select("order_id")
        .eq("id", id)
        .single();
      if (payRow?.order_id) {
        await supabase.from("order").update({ status: "paid" }).eq("id", payRow.order_id);
      }
    }

    res.status(200).json({ message: "Payment updated successfully", data: payment });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error while updating payment", error: e.message });
  }
};

/**
 * DELETE /payments/:id
 * - RESTRICT: akan gagal jika masih direferensikan oleh webhook_log (related_payment_id)
 * - kita cek & kasih pesan ramah
 */
exports.deletePayment = async (req, res) => {
  try {
    const { id } = req.params;

    // cek log yang mereferensikan payment ini
    const { count: logCount } = await supabase
      .from("webhook_log")
      .select("*", { head: true, count: "exact" })
      .eq("related_payment_id", id);

    if ((logCount ?? 0) > 0) {
      return res.status(409).json({
        message: "Cannot delete payment — related webhook logs exist. Delete logs first.",
      });
    }

    const { error } = await supabase.from("payment").delete().eq("id", id);
    if (error) throw error;

    res.status(200).json({ message: "Payment deleted successfully" });
  } catch (e) {
    console.error(e);
    const fk = /foreign key|violates foreign key/i.test(e.message || "");
    res.status(fk ? 409 : 500).json({
      message: fk
        ? "Cannot delete payment due to related records"
        : "Error while deleting payment",
      error: e.message,
    });
  }
};