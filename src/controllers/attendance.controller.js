const supabase = require("../utils/supabase");

exports.scanQrCode = async (req, res) => {
  try {
    const { event_id, qr_token } = req.body;
    const staffId = req.userId; // User yang melakukan scan (Staff/Admin)

    // 1. Validasi Token Tiket
    const { data: ticket } = await supabase
      .from("ticket")
      .select("id, qr_status, order_id, order:order_id(event_id, participant:participant_id(name, email))")
      .eq("qr_token", qr_token)
      .single();

    if (!ticket) {
      return res.status(404).json({ message: "Tiket tidak ditemukan / Token invalid." });
    }

    // 2. Cek apakah tiket ini milik event yang sedang di-scan
    if (ticket.order.event_id !== event_id) {
      return res.status(400).json({ message: "Tiket ini untuk event yang berbeda!" });
    }

    // 3. Cek Status Tiket (Aktif/Tidak)
    if (!ticket.qr_status) {
      return res.status(400).json({ message: "Tiket tidak aktif / dibatalkan." });
    }

    // 4. Cek apakah sudah pernah absen (Scan hari ini? Atau one-time use?)
    // Asumsi: Tiket hanya bisa dipakai sekali check-in
    const { data: existingAttendance } = await supabase
      .from("attendance")
      .select("id, scanned_at")
      .eq("ticket_id", ticket.id)
      .single();

    if (existingAttendance) {
      return res.status(409).json({ 
        message: "Peserta sudah check-in sebelumnya.", 
        data: {
            participant: ticket.order.participant,
            scanned_at: existingAttendance.scanned_at
        }
      });
    }

    // 5. Catat Kehadiran
    const { data: attendance, error } = await supabase
      .from("attendance")
      .insert({
        ticket_id: ticket.id,
        scanned_at: new Date(),
        staff: staffId, // ID staff yang scan
        device_info: req.headers['user-agent'] || 'Unknown Device'
      })
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({
      message: "Check-in Berhasil!",
      data: {
        participant: ticket.order.participant,
        timestamp: attendance.scanned_at
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error saat scan." });
  }
};

// Get list kehadiran untuk event tertentu
exports.getEventAttendance = async (req, res) => {
    try {
        const { eventId } = req.params;
        
        // Ambil semua tiket di event ini, join ke attendance
        // Flow: Order -> Ticket -> Attendance
        // Karena struktur DB agak nested, kita tarik dari Order dulu
        const { data: orders, error } = await supabase
            .from("order")
            .select(`
                id,
                participant:participant_id(name, email, phone),
                ticket(
                    id, qr_token,
                    attendance(id, scanned_at, staff)
                )
            `)
            .eq("event_id", eventId)
            .eq("status", "paid"); // Hanya yang sudah bayar yang muncul di list presensi

        if(error) throw error;

        // Formatting data biar enak di frontend
        const result = orders.map(o => {
            const ticket = o.ticket?.[0] || null; // Asumsi 1 order 1 tiket (atau ambil array)
            const attendance = ticket?.attendance?.[0] || null;
            
            return {
                participant_name: o.participant.name,
                participant_email: o.participant.email,
                ticket_token: ticket?.qr_token,
                status: attendance ? 'Hadir' : 'Belum Hadir',
                scanned_at: attendance?.scanned_at || null
            };
        });

        res.json({ data: result });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
}