// src/controllers/superadmin.controller.js
const supabase = require("../utils/supabase");

// GET /api/superadmin/users
// Mengambil semua user dengan fitur pencarian
exports.getAllUsers = async (req, res) => {
  try {
    const { q = "", role = "" } = req.query;
    
    let query = supabase
      .from("users")
      .select("id, name, email, role, is_verified, created_at")
      .order("created_at", { ascending: false });

    if (q) {
      query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
    }
    if (role && role !== "all") {
      query = query.eq("role", role);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.json({ data });
  } catch (error) {
    console.error("getAllUsers error:", error);
    return res.status(500).json({ message: "Gagal mengambil data user" });
  }
};

// PATCH /api/superadmin/users/:id
// Mengubah data user (Role, Block/Unblock via is_verified, dll)
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, is_verified } = req.body; // Bisa ditambah is_blocked jika ada di DB

    const updates = {};
    if (role) updates.role = role;
    if (typeof is_verified === "boolean") updates.is_verified = is_verified;

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return res.json({ message: "User berhasil diperbarui", data });
  } catch (error) {
    console.error("updateUser error:", error);
    return res.status(500).json({ message: "Gagal update user" });
  }
};

// DELETE /api/superadmin/users/:id
// Menghapus user
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("users").delete().eq("id", id);

    if (error) throw error;

    return res.json({ message: "User berhasil dihapus" });
  } catch (error) {
    console.error("deleteUser error:", error);
    return res.status(500).json({ message: "Gagal menghapus user" });
  }
};

// GET /api/superadmin/organizers
// Mengambil pengajuan organizer (bisa filter status pending)
exports.getAllOrganizers = async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase
      .from("organizers")
      .select("*, users:user_id(name, email)")
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.json({ data });
  } catch (error) {
    console.error("getAllOrganizers error:", error);
    return res.status(500).json({ message: "Gagal mengambil data organizer" });
  }
};

// PATCH /api/superadmin/organizers/:id/status
// Mengubah status pengajuan (pending -> approved/rejected)
exports.updateOrganizerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'approved' or 'rejected'

    if (!['approved', 'rejected', 'pending'].includes(status)) {
        return res.status(400).json({ message: "Status tidak valid" });
    }

    // Update status organizer
    const { data: orgData, error: orgError } = await supabase
      .from("organizers")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (orgError) throw orgError;

    // Jika di-approve, otomatis ubah role user menjadi 'admin' (jika belum)
    if (status === 'approved' && orgData) {
        await supabase
            .from("users")
            .update({ role: "admin" })
            .eq("id", orgData.user_id);
    }

    return res.json({ message: "Status organizer diperbarui", data: orgData });
  } catch (error) {
    console.error("updateOrganizerStatus error:", error);
    return res.status(500).json({ message: "Gagal update status organizer" });
  }
};