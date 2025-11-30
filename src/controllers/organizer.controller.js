const supabase = require("../utils/supabase");

// POST /api/organizers/apply
exports.applyOrganizer = async (req, res) => {
  try {
    const userId = req.userId;
    const { organizer_name, description, website, contact_phone } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!organizer_name || !description) {
      return res.status(400).json({
        message: "Nama penyelenggara dan deskripsi wajib diisi",
      });
    }

    const { data: existing, error: existingError } = await supabase
      .from("organizers")
      .select("id, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingError) {
      console.error(existingError);
      return res.status(500).json({ message: "Gagal mengecek pengajuan" });
    }

    if (existing && existing.status === "pending") {
      return res.status(409).json({
        message: "Pengajuan sebagai penyelenggara masih pending",
      });
    }

    const { data, error } = await supabase
      .from("organizers")
      .insert({
        user_id: userId,
        organizer_name,
        description,
        website,
        contact_phone,
        status: "pending",
      })
      .select("*")
      .single();

    if (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Gagal mengajukan penyelenggara" });
    }

    return res.status(201).json({
      message:
        "Pengajuan penyelenggara berhasil dikirim. Menunggu verifikasi superadmin.",
      data,
    });
  } catch (error) {
    console.error("applyOrganizer error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
