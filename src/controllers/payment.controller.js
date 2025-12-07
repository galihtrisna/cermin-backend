const supabase = require("../utils/supabase");
const { calculateAdminFee } = require("../utils/fees");
const midtransClient = require("midtrans-client"); // Pastikan sudah install midtrans-client

// Inisialisasi Midtrans Core API
const coreApi = new midtransClient.CoreApi({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

/**
 * =========================================
 * BAGIAN 1: FITUR PEMBAYARAN QRIS (MIDTRANS)
 * =========================================
 */

// Generate QRIS via Midtrans Core API
exports.createQrisPayment = async (req, res) => {
  try {
    const { order_id } = req.body;

    // 1. Ambil data order
    const { data: order } = await supabase
      .from("order")
      .select(
        `
        *,
        participant:participant_id (name, email, phone),
        event:event_id (title)
      `
      )
      .eq("id", order_id)
      .single();

    if (!order) return res.status(404).json({ message: "Order not found" });

    // Cek status
    if (order.status === "paid" || order.status === "settlement") {
      return res.status(400).json({ message: "Order already paid" });
    }

    // 2. Parameter Midtrans
    const parameter = {
      payment_type: "gopay",
      gopay: {
        enable_qr: true, // ← bagian terpenting
      },
      transaction_details: {
        order_id: order.id,
        gross_amount: Math.round(order.amount), // Pastikan integer
      },
      customer_details: {
        first_name: order.participant.name,
        email: order.participant.email,
        phone: order.participant.phone,
      },
      item_details: [
        {
          id: order.event_id,
          price: Math.round(order.amount),
          quantity: 1,
          name: order.event.title.substring(0, 49), // Batas karakter Midtrans
        },
      ],
    };

    // 3. Charge ke Midtrans
    const response = await coreApi.charge(parameter);

    // 4. Cari URL QR Code
    const actions = response.actions || [];
    const qrAction = actions.find((a) => a.name === "generate-qr-code");
    const qrUrl = qrAction ? qrAction.url : null;

    if (!qrUrl) {
      throw new Error("Gagal mendapatkan QR Code dari Midtrans");
    }

    res.status(200).json({
      qr_url: qrUrl,
      order_id: order.id,
      amount: order.amount,
      expiry_time: response.expiry_time,
    });
  } catch (error) {
    console.error("Payment Error:", error.message);
    res.status(500).json({ message: "Gagal memproses pembayaran QRIS" });
  }
};

// Webhook Handler untuk Notifikasi Midtrans
exports.webhookHandler = async (req, res) => {
  try {
    const statusResponse = await coreApi.transaction.notification(req.body);
    const orderId = statusResponse.order_id;
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    let orderStatus = null;

    // Logika Status Midtrans
    if (transactionStatus == "capture") {
      if (fraudStatus == "challenge") {
        orderStatus = "challenge";
      } else if (fraudStatus == "accept") {
        orderStatus = "paid";
      }
    } else if (transactionStatus == "settlement") {
      orderStatus = "paid";
    } else if (
      transactionStatus == "cancel" ||
      transactionStatus == "deny" ||
      transactionStatus == "expire"
    ) {
      orderStatus = "failed";
    }

    if (orderStatus === "paid") {
      // 1. Update Order jadi PAID
      await supabase.from("order").update({ status: "paid" }).eq("id", orderId);

      // 2. Buat Tiket Baru (PENTING!)
      // Cek dulu biar gak duplikat tiket kalau webhook dikirim berkali-kali
      const { data: existingTicket } = await supabase
        .from("ticket")
        .select("id")
        .eq("order_id", orderId)
        .single();

      if (!existingTicket) {
        await supabase.from("ticket").insert([
          {
            order_id: orderId,
            qr_token: `TCK-${orderId.substring(0, 8)}-${Date.now()}`,
            qr_status: true,
          },
        ]);
      }

      // 3. Catat di Payment Log
      // Cek payment log existing
      const { data: existingLog } = await supabase
        .from("payment")
        .select("id")
        .eq("order_id", orderId)
        .eq("status", "paid")
        .single();

      if (!existingLog) {
        await supabase.from("payment").insert([
          {
            order_id: orderId,
            midtrans_id: statusResponse.transaction_id,
            channel: "qris",
            status: "paid",
            paid_at: new Date(),
          },
        ]);
      }
    } else if (orderStatus === "failed") {
      await supabase
        .from("order")
        .update({ status: "failed" })
        .eq("id", orderId);
    }

    res.status(200).send("OK");
  } catch (e) {
    console.error("Webhook Error:", e);
    res.status(500).send("Error");
  }
};

/**
 * =========================================
 * BAGIAN 2: CRUD PAYMENT (ADMIN DASHBOARD)
 * =========================================
 */

/**
 * GET /payments
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
    const sortDir =
      (req.query.sort_dir || "desc").toLowerCase() === "asc" ? "asc" : "desc";

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
        filters: {
          order_id: orderId || null,
          status: status || null,
          midtrans_id: midtransId || null,
        },
      },
      data,
    });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ message: "Error while getting payments", error: e.message });
  }
};

/** GET /payments/:id */
exports.getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("payment")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: "Payment not found" });
    res.status(200).json({ message: "Get payment by ID successfully", data });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ message: "Error while getting payment", error: e.message });
  }
};

/** POST /payments (Manual Create - Opsional) */
exports.createPayment = async (req, res) => {
  try {
    const { order_id, channel, midtrans_id } = req.body;
    if (!order_id)
      return res.status(400).json({ message: "order_id is required" });

    const { data: order, error: e1 } = await supabase
      .from("order")
      .select("id, amount, status")
      .eq("id", order_id)
      .single();
    if (e1 || !order)
      return res.status(404).json({ message: "Order not found" });

    const ticketAmount = Number(order.amount) || 0;

    // Gunakan fungsi admin fee jika perlu, atau pakai amount order langsung
    // const admin_fee = calcAdminFee(ticketAmount);

    const { data: payment, error: e2 } = await supabase
      .from("payment")
      .insert([
        {
          order_id,
          midtrans_id: midtrans_id ?? null,
          channel: channel ?? null,
          status: "pending",
          paid_at: null,
        },
      ])
      .select()
      .single();
    if (e2) throw e2;

    res.status(201).json({
      message: "Payment created manually",
      data: payment,
    });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ message: "Error while creating payment", error: e.message });
  }
};

/** PUT /payments/:id */
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

    const newStatus = (payload.status || "").toLowerCase();
    if (newStatus === "settlement" || newStatus === "paid") {
      const { data: payRow } = await supabase
        .from("payment")
        .select("order_id")
        .eq("id", id)
        .single();
      if (payRow?.order_id) {
        await supabase
          .from("order")
          .update({ status: "paid" })
          .eq("id", payRow.order_id);
      }
    }

    res
      .status(200)
      .json({ message: "Payment updated successfully", data: payment });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ message: "Error while updating payment", error: e.message });
  }
};

/** DELETE /payments/:id */
exports.deletePayment = async (req, res) => {
  try {
    const { id } = req.params;

    const { count: logCount } = await supabase
      .from("webhook_log")
      .select("*", { head: true, count: "exact" })
      .eq("related_payment_id", id);

    if ((logCount ?? 0) > 0) {
      return res.status(409).json({
        message: "Cannot delete payment — related webhook logs exist.",
      });
    }

    const { error } = await supabase.from("payment").delete().eq("id", id);
    if (error) throw error;

    res.status(200).json({ message: "Payment deleted successfully" });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ message: "Error while deleting payment", error: e.message });
  }
};
