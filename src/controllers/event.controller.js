const supabase = require("../utils/supabase");

/**
 * GET /events
 * Query params:
 *  - page (default 1)
 *  - limit (default 10, max 100)
 *  - q            : search (title/description/location, ILIKE)
 *  - status       : draft|published|cancelled|completed (opsional)
 *  - date_from    : YYYY-MM-DD (opsional)
 *  - date_to      : YYYY-MM-DD (opsional)
 *  - location     : partial match, ILIKE (opsional)
 *  - sort_by      : datetime|title|price|capacity|status (default: datetime)
 *  - sort_dir     : asc|desc (default: asc)
 */
exports.getAllEvent = async (req, res) => {
  try {
    // 1) Pagination
    const page = Math.max(parseInt(req.query.page ?? "1", 10), 1);
    const rawLimit = Math.max(parseInt(req.query.limit ?? "10", 10), 1);
    const limit = Math.min(rawLimit, 100);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // 2) Filters
    const q = (req.query.q || "").trim();
    const status = (req.query.status || "").trim();
    const dateFrom = (req.query.date_from || "").trim();
    const dateTo = (req.query.date_to || "").trim();
    const loc = (req.query.location || "").trim();

    // 3) Sorting (whitelist)
    const SORTABLE = new Set([
      "datetime",
      "title",
      "price",
      "capacity",
      "status",
    ]);
    const sortBy = SORTABLE.has((req.query.sort_by || "").trim())
      ? req.query.sort_by.trim()
      : "datetime";
    const sortDir =
      (req.query.sort_dir || "asc").toLowerCase() === "desc" ? "desc" : "asc";

    // 4) Base query + count
    let query = supabase.from("event").select("*", { count: "exact" });

    // 5) Apply filters
    if (q) {
      // cari di title, description, location
      query = query.or(
        `title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%`
      );
    }
    if (status) query = query.eq("status", status);
    if (dateFrom) query = query.gte("datetime", dateFrom);
    if (dateTo) query = query.lte("datetime", dateTo);
    if (loc) query = query.ilike("location", `%${loc}%`);

    // 6) Sorting + pagination
    query = query
      .order(sortBy, { ascending: sortDir === "asc" })
      .range(from, to);

    const { data: events, count, error } = await query;
    if (error) throw error;

    const total = count ?? 0;
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    res.status(200).json({
      message: "Get events successfully",
      meta: {
        page,
        limit,
        total,
        total_pages: totalPages,
        sort_by: sortBy,
        sort_dir: sortDir,
        filters: {
          q: q || null,
          status: status || null,
          date_from: dateFrom || null,
          date_to: dateTo || null,
          location: loc || null,
        },
      },
      data: events,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error while getting events",
      error: error.message,
    });
  }
};

exports.getMyEvents = async (req, res) => {
  try {
    const userId = req.userId; // dari middleware auth / JWT
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { data, error } = await supabase
      .from("event")
      .select("*")
      .eq("owner_id", userId)
      .order("datetime", { ascending: true });

    if (error) throw error;

    res.status(200).json({
      message: "Get my events successfully",
      data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error while getting my events",
      error: error.message,
    });
  }
};

/**
 * GET /events/:id
 * Ambil event berdasarkan ID
 */
exports.getEventById = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: event, error } = await supabase
      .from("event")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      // Supabase: no rows found => PGRST116
      if (error.code === "PGRST116") {
        return res.status(404).json({ message: "Event not found" });
      }

      console.error(error);
      return res.status(500).json({
        message: "Error while getting event by ID",
        error: error.message,
      });
    }

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.status(200).json({
      message: "Get event by ID successfully",
      data: event,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error while getting event by ID",
      error: error.message,
    });
  }
};

/**
 * POST /events
 * Tambah event baru
 */
exports.createEvent = async (req, res) => {
  try {
    const userId = req.userId; // dari JWT
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { title, description, datetime, location, capacity, price, status } =
      req.body;

    const { data, error } = await supabase
      .from("event")
      .insert([
        {
          title,
          description,
          datetime,
          location,
          capacity,
          price,
          status,
          owner_id: userId, // 🔥 penting: set pemilik event
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: "Event created successfully",
      data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error while creating event",
      error: error.message,
    });
  }
};

/**
 * PUT /events/:id
 * Update event berdasarkan ID
 */
exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, datetime, location, capacity, price, status } =
      req.body;

    const { data, error } = await supabase
      .from("event")
      .update({
        title,
        description,
        datetime,
        location,
        capacity,
        price,
        status,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({
      message: "Event updated successfully",
      data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error while updating event",
      error: error.message,
    });
  }
};

/**
 * DELETE /events/:id
 * Hapus event berdasarkan ID
 */
exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase.from("event").delete().eq("id", id);

    if (error) throw error;

    res.status(200).json({
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error while deleting event",
      error: error.message,
    });
  }
};
