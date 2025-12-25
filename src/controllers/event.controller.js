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
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // [UPDATE] Tambahkan select "orders(count)" untuk menghitung jumlah peserta
    // Asumsi: Nama tabel order di database adalah 'orders' dan punya foreign key event_id
    // Kita filter orders yang statusnya sukses/paid jika perlu, tapi untuk simpel kita hitung semua order
    const { data, error } = await supabase
      .from("event")
      .select("*, orders(count)") 
      .eq("owner_id", userId)
      .order("datetime", { ascending: true });

    if (error) throw error;

    // Format data agar frontend lebih mudah membacanya
    const formattedData = data.map((event) => ({
      ...event,
      // Supabase mengembalikan array [{ count: n }] untuk relation count
      participant_count: event.orders ? event.orders[0].count : 0, 
    }));

    res.status(200).json({
      message: "Get my events successfully",
      data: formattedData,
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

    const {
      title,
      description,
      datetime,
      location,
      capacity,
      price,
      status,
      subtitle,
      duration,
      benefits,
      image,
    } = req.body;

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
          owner_id: userId,
          subtitle,
          duration,
          benefits,
          image, // 🔥 penting: set pemilik event
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
    const userId = req.userId;
    const userRole = req.role;

    // 1. Cek dulu eventnya ada atau tidak
    const { data: existingEvent, error: fetchError } = await supabase
      .from("event")
      .select("owner_id")
      .eq("id", id)
      .single();

    if (fetchError || !existingEvent) {
      return res.status(404).json({ message: "Event tidak ditemukan" });
    }

    // 2. Validasi Kepemilikan (Authorization)
    // Boleh edit jika: Role Superadmin ATAU User ID sama dengan Owner ID
    if (userRole !== "superadmin" && existingEvent.owner_id !== userId) {
      return res
        .status(403)
        .json({ message: "Forbidden: Anda bukan pemilik event ini." });
    }

    // 3. Lakukan Update
    const {
      title,
      description,
      datetime,
      location,
      capacity,
      price,
      status,
      subtitle,
      duration,
      benefits,
      image,
      cert_background, // [FIX] Tambahkan field ini agar sertifikat bisa disimpan
    } = req.body;

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
        subtitle,
        duration,
        benefits,
        image,
        cert_background, // [FIX] Masukkan ke payload update
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
    const userId = req.userId;
    const userRole = req.role;

    // 1. Cek event & kepemilikan
    const { data: existingEvent, error: fetchError } = await supabase
      .from("event")
      .select("owner_id")
      .eq("id", id)
      .single();

    if (fetchError || !existingEvent) {
      return res.status(404).json({ message: "Event tidak ditemukan" });
    }

    if (userRole !== "superadmin" && existingEvent.owner_id !== userId) {
      return res
        .status(403)
        .json({ message: "Forbidden: Anda bukan pemilik event ini." });
    }

    // 2. Hapus
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

// ... kode lama ...

/**
 * POST /events/:id/staff
 * Menambahkan staff ke event berdasarkan email
 */
exports.addEventStaff = async (req, res) => {
  try {
    const { id } = req.params; // Event ID
    const { email } = req.body;
    const ownerId = req.userId; // ID Admin yang login

    // 1. Cek kepemilikan event
    const { data: event } = await supabase
      .from("event")
      .select("owner_id")
      .eq("id", id)
      .single();
    if (!event)
      return res.status(404).json({ message: "Event tidak ditemukan" });

    // Hanya owner atau superadmin yang boleh add staff
    if (event.owner_id !== ownerId && req.role !== "superadmin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // 2. Cari User berdasarkan email
    const { data: user } = await supabase
      .from("users")
      .select("id, role")
      .eq("email", email)
      .single();

    if (!user) {
      return res
        .status(404)
        .json({ message: "Email belum terdaftar di sistem." });
    }

    if (user.role !== "staff") {
      return res
        .status(400)
        .json({ message: "User tersebut bukan Staff (Role user salah)." });
    }

    // 3. Masukkan ke tabel event_staff
    const { error: insertError } = await supabase.from("event_staff").insert({
      event_id: id,
      user_id: user.id,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        // Unique violation
        return res
          .status(400)
          .json({ message: "Staff sudah terdaftar di event ini." });
      }
      throw insertError;
    }

    res.status(201).json({ message: "Staff berhasil ditambahkan." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * GET /events/:id/staff
 * List staff di event tertentu
 */
exports.getEventStaffList = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("event_staff")
      .select("id, user:user_id(id, name, email)")
      .eq("event_id", id);

    if (error) throw error;
    res.json({ message: "Success", data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * DELETE /events/:id/staff/:staffId
 * Hapus akses staff (staffId di sini adalah ID tabel event_staff, bukan user_id)
 */
exports.removeEventStaff = async (req, res) => {
  try {
    const { staffId } = req.params; // ID dari tabel event_staff
    const { error } = await supabase
      .from("event_staff")
      .delete()
      .eq("id", staffId);
    if (error) throw error;
    res.json({ message: "Staff dihapus dari event." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /events/staff/assigned
 * Mengambil list event di mana user login terdaftar sebagai staff
 */
exports.getStaffAssignedEvents = async (req, res) => {
  try {
    const userId = req.userId;
    // Join event_staff -> event
    const { data, error } = await supabase
      .from("event_staff")
      .select("event:event_id(*)") // Mengambil detail event
      .eq("user_id", userId);

    if (error) throw error;

    // Flatten data
    const events = data.map((item) => item.event);

    res.json({ message: "Success", data: events });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
