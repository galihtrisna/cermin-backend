const supabase = require("../utils/supabase");

/**
 * GET /participants
 * Query:
 *  - page=1&limit=10 (max 100)
 *  - q=keyword            (cari di name/email/phone; ILIKE)
 *  - sort_by=name|email|created_at (default: name)
 *  - sort_dir=asc|desc (default: asc)
 */
exports.getAllParticipants = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page ?? "1", 10), 1);
    const rawLimit = Math.max(parseInt(req.query.limit ?? "10", 10), 1);
    const limit = Math.min(rawLimit, 100);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const q = (req.query.q || "").trim();

    const SORTABLE = new Set(["name", "email", "created_at"]);
    const sortBy = SORTABLE.has((req.query.sort_by || "").trim())
      ? req.query.sort_by.trim()
      : "name";
    const sortDir = (req.query.sort_dir || "asc").toLowerCase() === "desc" ? "desc" : "asc";

    let query = supabase.from("participant").select("*", { count: "exact" });

    if (q) {
      query = query.or(
        `name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`
      );
    }

    query = query.order(sortBy, { ascending: sortDir === "asc" }).range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;

    res.status(200).json({
      message: "Get participants successfully",
      meta: {
        page,
        limit,
        total: count ?? 0,
        total_pages: Math.max(Math.ceil((count ?? 0) / limit), 1),
        sort_by: sortBy,
        sort_dir: sortDir,
        q: q || null,
      },
      data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error while getting participants", error: err.message });
  }
};

/**
 * GET /participants/:id
 */
exports.getParticipantById = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("participant")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: "Participant not found" });

    res.status(200).json({ message: "Get participant by ID successfully", data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error while getting participant by ID", error: err.message });
  }
};

/**
 * POST /participants
 * Body: { name, email, phone }
 */
exports.createParticipant = async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: "name and email are required" });
    }

    const { data, error } = await supabase
      .from("participant")
      .insert([{ name, email, phone }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: "Participant created successfully", data });
  } catch (err) {
    console.error(err);
    const dup = err?.message?.toLowerCase?.().includes("duplicate");
    res.status(dup ? 409 : 500).json({
      message: dup ? "Email already exists" : "Error while creating participant",
      error: err.message,
    });
  }
};

/**
 * PUT /participants/:id
 * Body: { name?, email?, phone? }
 */
exports.updateParticipant = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = {};
    ["name", "email", "phone"].forEach((k) => {
      if (req.body[k] !== undefined) payload[k] = req.body[k];
    });

    const { data, error } = await supabase
      .from("participant")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({ message: "Participant updated successfully", data });
  } catch (err) {
    console.error(err);
    const dup = err?.message?.toLowerCase?.().includes("duplicate");
    res.status(dup ? 409 : 500).json({
      message: dup ? "Email already exists" : "Error while updating participant",
      error: err.message,
    });
  }
};

/**
 * DELETE /participants/:id
 * (Catatan: FK ON DELETE RESTRICT ke order/sertifikat bisa bikin gagal delete)
 */
exports.deleteParticipant = async (req, res) => {
  try {
    const { id } = req.params;

    // cek dulu apakah punya order / certificate
    const { count: orderCount } = await supabase
      .from("order")
      .select("*", { count: "exact", head: true })
      .eq("participant_id", id);

    const { count: certCount } = await supabase
      .from("certificate")
      .select("*", { count: "exact", head: true })
      .eq("participant_id", id);

    if ((orderCount ?? 0) > 0 || (certCount ?? 0) > 0) {
      return res.status(409).json({
        message:
          "Cannot delete participant — related orders or certificates exist.",
      });
    }

    const { error } = await supabase.from("participant").delete().eq("id", id);
    if (error) throw error;

    res.status(200).json({ message: "Participant deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Error while deleting participant",
      error: err.message,
    });
  }
};


/**
 * GET /participants/:id/orders
 * List order milik participant (join event biar enak dibaca)
 * Query: status?=pending|paid|...
 */
exports.getParticipantOrders = async (req, res) => {
  try {
    const { id } = req.params;
    const status = (req.query.status || "").trim();

    // ambil orders milik participant
    let orderQuery = supabase
      .from("order")
      .select("*, event:event_id (id, title, datetime, location, price, status)")
      .eq("participant_id", id)
      .order("created_at", { ascending: false }); // kalau kolom created_at ada di order kamu

    if (status) orderQuery = orderQuery.eq("status", status);

    const { data, error } = await orderQuery;
    if (error) throw error;

    res.status(200).json({
      message: "Get participant orders successfully",
      data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Error while getting participant orders",
      error: err.message,
    });
  }
};
