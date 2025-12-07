const supabase = require("../utils/supabase");
const { calculateAdminFee } = require("../utils/fees");
/**
 * GET /orders
 * Query:
 *  - page, limit (default 1,10 | max 100)
 *  - q : cari di status / event title / participant name/email
 *  - event_id, participant_id, status
 *  - date_from, date_to
 *  - sort_by=created_at|amount|status
 *  - sort_dir=asc|desc
 *  - expand=true (join event & participant)
 */
exports.getAllOrders = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page ?? "1", 10), 1);
    const rawLimit = Math.max(parseInt(req.query.limit ?? "10", 10), 1);
    const limit = Math.min(rawLimit, 100);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const q = (req.query.q || "").trim().toLowerCase();
    const eventId = (req.query.event_id || "").trim();
    const participantId = (req.query.participant_id || "").trim();
    const status = (req.query.status || "").trim();
    const expand = (req.query.expand || "").toLowerCase() === "true";

    const SORTABLE = new Set(["created_at", "amount", "status"]);
    const sortBy = SORTABLE.has((req.query.sort_by || "").trim())
      ? req.query.sort_by.trim()
      : "created_at";
    const sortDir = (req.query.sort_dir || "desc").toLowerCase() === "asc" ? "asc" : "desc";

    let selectCols = "*";
    if (expand) {
      selectCols = "*, event:event_id(id, title, location, price), participant:participant_id(id, name, email, phone)";
    }

    let query = supabase.from("order").select(selectCols, { count: "exact" });

    if (eventId) query = query.eq("event_id", eventId);
    if (participantId) query = query.eq("participant_id", participantId);
    if (status) query = query.eq("status", status);

    query = query.order(sortBy, { ascending: sortDir === "asc" }).range(from, to);

    let { data, count, error } = await query;
    if (error) throw error;

    // search manual (Supabase gak support OR ke relasi)
    if (q && expand && data?.length) {
      data = data.filter((x) => {
        const inStatus = (x.status || "").toLowerCase().includes(q);
        const inEvent = (x.event?.title || "").toLowerCase().includes(q);
        const inParticipant =
          (x.participant?.name || "").toLowerCase().includes(q) ||
          (x.participant?.email || "").toLowerCase().includes(q);
        return inStatus || inEvent || inParticipant;
      });
    }

    res.status(200).json({
      message: "Get all orders successfully",
      meta: {
        page,
        limit,
        total: count ?? data.length,
        total_pages: Math.max(Math.ceil((count ?? data.length) / limit), 1),
        sort_by: sortBy,
        sort_dir: sortDir,
      },
      data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error while getting orders", error: err.message });
  }
};

/**
 * GET /orders/:id
 * ?expand=true untuk join event & participant
 */
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const expand = (req.query.expand || "").toLowerCase() === "true";

    const selectCols = expand
      ? "*, event:event_id(id, title, location, price), participant:participant_id(id, name, email, phone)"
      : "*";

    const { data, error } = await supabase.from("order").select(selectCols).eq("id", id).single();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: "Order not found" });

    res.status(200).json({ message: "Get order by ID successfully", data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error while getting order", error: err.message });
  }
};

/**
 * POST /orders
 * Body: { event_id, participant_id, amount?, status? }
 * - amount otomatis diambil dari event.price jika kosong
 */
exports.createOrder = async (req, res) => {
  try {
    const { event_id, name, email, phone } = req.body;

    // 1. Validasi Email Unik (Per Event) & Status Bayar
    // Cari participant id dulu
    const { data: existingUser } = await supabase
      .from("participant")
      .select("id")
      .eq("email", email)
      .single();

    if (existingUser) {
      // Cek apakah user ini punya order sukses di event ini
      const { data: existingOrder } = await supabase
        .from("order")
        .select("id, status")
        .eq("event_id", event_id)
        .eq("participant_id", existingUser.id)
        .or("status.eq.paid,status.eq.settlement") // Cek status paid/settlement
        .single();

      if (existingOrder) {
        return res.status(400).json({
          message: "Email ini sudah terdaftar dan lunas untuk event ini.",
        });
      }
    }

    // 2. Insert/Get Participant
    let participantId;
    if (existingUser) {
      participantId = existingUser.id;
      // Update data terbaru (opsional)
      await supabase
        .from("participant")
        .update({ name, phone })
        .eq("id", participantId);
    } else {
      const { data: newUser, error: userError } = await supabase
        .from("participant")
        .insert([{ name, email, phone }])
        .select()
        .single();
      
      if (userError) throw userError;
      participantId = newUser.id;
    }

    // 3. Ambil Harga Event & Hitung Admin Fee
    const { data: eventData } = await supabase
      .from("event")
      .select("price, title")
      .eq("id", event_id)
      .single();

    if (!eventData) throw new Error("Event tidak ditemukan");

    const price = parseFloat(eventData.price);
    const adminFee = calculateAdminFee(price); // Pakai helper
    const totalAmount = price + adminFee;

    // 4. Buat Order
    const { data: newOrder, error: orderError } = await supabase
      .from("order")
      .insert([
        {
          event_id,
          participant_id: participantId,
          price: price, // Harga asli event
          amount: totalAmount, // Total yang harus dibayar (termasuk admin)
          status: "pending",
        },
      ])
      .select()
      .single();

    if (orderError) throw orderError;

    res.status(201).json({
      message: "Order created successfully",
      data: newOrder,
    });

  } catch (error) {
    console.error("createOrder error:", error);
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};

/**
 * PUT /orders/:id
 * Body: { amount?, status? }
 */
exports.updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = {};
    ["amount", "status"].forEach((k) => {
      if (req.body[k] !== undefined) payload[k] = req.body[k];
    });

    if (!Object.keys(payload).length)
      return res.status(400).json({ message: "Nothing to update" });

    const { data, error } = await supabase
      .from("order")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    res.status(200).json({ message: "Order updated successfully", data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error while updating order", error: err.message });
  }
};

/**
 * DELETE /orders/:id
 * - gagal jika masih punya payment/ticket karena ON DELETE RESTRICT
 */
exports.deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const { count: payCount } = await supabase
      .from("payment")
      .select("*", { head: true, count: "exact" })
      .eq("order_id", id);

    const { count: tixCount } = await supabase
      .from("ticket")
      .select("*", { head: true, count: "exact" })
      .eq("order_id", id);

    if ((payCount ?? 0) > 0 || (tixCount ?? 0) > 0) {
      return res.status(409).json({
        message:
          "Cannot delete order — related payments or tickets exist. Delete them first.",
      });
    }

    const { error } = await supabase.from("order").delete().eq("id", id);
    if (error) throw error;

    res.status(200).json({ message: "Order deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error while deleting order", error: err.message });
  }
};

/**
 * GET /orders/:id/payments
 */
exports.getOrderPayments = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("payment")
      .select("*")
      .eq("order_id", id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    res.status(200).json({ message: "Get order payments successfully", data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error while getting order payments", error: err.message });
  }
};

/**
 * GET /orders/:id/ticket
 */
exports.getOrderTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from("ticket").select("*").eq("order_id", id).single();
    if (error && error.code !== "PGRST116") throw error;
    if (!data) return res.status(404).json({ message: "Ticket not found" });

    res.status(200).json({ message: "Get order ticket successfully", data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error while getting order ticket", error: err.message });
  }
};
