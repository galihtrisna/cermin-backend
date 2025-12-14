const supabase = require("../utils/supabase");

const uploadImage = async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "Tidak ada file yang diupload." });
    }

    // Validasi tipe file (hanya gambar)
    if (!file.mimetype.startsWith("image/")) {
      return res.status(400).json({ message: "File harus berupa gambar (JPG/PNG)." });
    }

    // Nama file unik: timestamp-namafileasli
    // Kita bersihkan nama file dari spasi agar aman di URL
    const fileName = `${Date.now()}-${file.originalname.replace(/\s/g, "_")}`;

    // Upload ke Supabase Storage (Bucket 'certificates')
    const { data, error } = await supabase.storage
      .from("certificates") // Nama bucket yang tadi dibuat
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw error;
    }

    // Ambil Public URL agar bisa diakses frontend
    const { data: publicUrlData } = supabase.storage
      .from("certificates")
      .getPublicUrl(fileName);

    return res.status(200).json({
      message: "Upload berhasil",
      url: publicUrlData.publicUrl, // URL ini yang nanti disimpan di database event
    });

  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ message: "Gagal mengupload gambar." });
  }
};

module.exports = { uploadImage };