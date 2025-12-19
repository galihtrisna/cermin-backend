const supabase = require("../utils/supabase");

exports.scanQrCode = async (req, res) => {
  try {
    const { event_id, qr_token } = req.body;
    const staffId = req.userId; // Pastikan middleware verifyToken berjalan

    console.log("Scanning Token:", qr_token, "for Event:", event_id);

    // 1. Validasi Token Tiket dengan Query yang Lebih Aman
    // Menggunakan sintaks template literal string untuk relasi nested yang lebih stabil
    const { data: ticket, error: ticketError } = await supabase
      .from("ticket")
      .select(
        `
        id, 
        qr_status, 
        qr_token,
        order_id,
        order:order_id (
          event_id,
          participant:participant_id (name, email)
        )
      `
      )
      .eq("qr_token", qr_token)
      .single();

    if (ticketError || !ticket) {
      console.error("Ticket Error:", ticketError);
      return res
        .status(404)
        .json({ message: "Tiket tidak ditemukan / Token invalid." });
    }

    // Safety Check: Pastikan data relasi order terambil
    if (!ticket.order) {
      return res
        .status(500)
        .json({
          message: "Data relasi order tiket hilang (Database integrity error).",
        });
    }

    // 2. Cek apakah tiket ini milik event yang sedang di-scan
    // Kita bandingkan sebagai String agar aman
    if (String(ticket.order.event_id) !== String(event_id)) {
      return res
        .status(400)
        .json({ message: "Gagal! Tiket ini untuk event yang berbeda." });
    }

    // 3. Cek Status Tiket (Aktif/Tidak)
    if (!ticket.qr_status) {
      return res
        .status(400)
        .json({ message: "Tiket tidak aktif / sudah dibatalkan." });
    }

    // 4. Cek apakah sudah pernah absen
    const { data: existingAttendance } = await supabase
      .from("attendance")
      .select("id, scanned_at")
      .eq("ticket_id", ticket.id)
      .single();

    if (existingAttendance) {
      // Jika sudah hadir, kembalikan 409 tapi sertakan data pesertanya agar panitia tahu siapa ini
      return res.status(409).json({
        message: "ALREADY SCANNED: Peserta sudah check-in sebelumnya.",
        data: {
          participant: ticket.order.participant,
          scanned_at: existingAttendance.scanned_at,
        },
      });
    }

    // 5. Catat Kehadiran
    const { data: attendance, error: insertError } = await supabase
      .from("attendance")
      .insert({
        ticket_id: ticket.id,
        scanned_at: new Date().toISOString(),
        staff: staffId || "system", // Fallback jika staffId kosong
        device_info: req.headers["user-agent"] || "Unknown Device",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert Attendance Error:", insertError);
      throw insertError;
    }

    res.status(200).json({
      message: "Check-in Berhasil!",
      data: {
        participant: ticket.order.participant,
        timestamp: attendance.scanned_at,
      },
    });
  } catch (error) {
    console.error("Scan Error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server saat scan." });
  }
};

// Get list kehadiran untuk event tertentu
exports.getEventAttendance = async (req, res) => {
  try {
    const { eventId } = req.params;

    // Ambil data attendance via Order -> Ticket -> Attendance
    const { data: orders, error } = await supabase
      .from("order")
      .select(
        `
                id,
                participant:participant_id(name, email, phone),
                ticket (
                    id, qr_token,
                    attendance (id, scanned_at, staff)
                )
            `
      )
      .eq("event_id", eventId)
      .eq("status", "paid");

    if (error) throw error;

    // Formatting data
    const result = orders.map((o) => {
      // Karena ticket relasinya mungkin array (tergantung definisi), kita handle aman
      const ticket = Array.isArray(o.ticket) ? o.ticket[0] : o.ticket;
      const attendance = ticket?.attendance
        ? Array.isArray(ticket.attendance)
          ? ticket.attendance[0]
          : ticket.attendance
        : null;

      return {
        participant_name: o.participant?.name || "Unknown",
        participant_email: o.participant?.email || "-",
        ticket_token: ticket?.qr_token || "-",
        status: attendance ? "Hadir" : "Belum Hadir",
        scanned_at: attendance?.scanned_at || null,
      };
    });

    res.json({ data: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};
