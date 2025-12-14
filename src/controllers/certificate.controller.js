const supabase = require("../utils/supabase");
const { sendCertificateEmail } = require("../utils/emailService");

/**
 * 1. Terbitkan Sertifikat untuk Peserta Hadir
 */
const issueCertificates = async (req, res) => {
  const { eventId } = req.params;

  try {
    // 1. Cek Event & Template Background
    const { data: event } = await supabase
      .from("event")
      .select("*")
      .eq("id", eventId)
      .single();

    if (!event || !event.cert_background) {
      return res.status(400).json({ 
        message: "Template sertifikat belum diatur (background kosong)." 
      });
    }

    // 2. Cari Peserta yang SUDAH check-in (attendance)
    // Join attendance -> ticket -> order -> participant
    const { data: attendees, error: attendError } = await supabase
      .from("attendance")
      .select(`
        ticket:ticket_id (
          order:order_id (
            participant:participant_id (id, name, email)
          )
        )
      `)
      .eq("ticket.order.event_id", eventId); // Note: Query ini mungkin perlu penyesuaian tergantung relasi foreign key persisnya di supabase-js, tapi logikanya begini.

    // Alternatif query jika relasi di atas kompleks:
    // Ambil order id dari event, ambil ticket dari order, ambil attendance dari ticket.
    // Untuk simplifikasi kode di sini, kita asumsikan kita dapat list participant_id yang hadir.
    
    // FETCH MANUAL untuk memastikan data benar (Safe Approach)
    const { data: orders } = await supabase.from("order").select("id, participant_id").eq("event_id", eventId).eq("status", "paid");
    const orderIds = orders.map(o => o.id);
    
    const { data: tickets } = await supabase.from("ticket").select("id, order_id").in("order_id", orderIds);
    const ticketIds = tickets.map(t => t.id);

    const { data: attendanceLogs } = await supabase.from("attendance").select("ticket_id").in("ticket_id", ticketIds);
    const presentTicketIds = attendanceLogs.map(a => a.ticket_id);

    // Filter tiket yang hadir
    const presentTickets = tickets.filter(t => presentTicketIds.includes(t.id));
    const presentOrderIds = presentTickets.map(t => t.order_id);
    
    // Ambil data peserta final
    const { data: participantsToCertify } = await supabase
      .from("order")
      .select(`
        participant (id, name, email)
      `)
      .in("id", presentOrderIds);

    let issuedCount = 0;

    // 3. Loop peserta dan buat sertifikat
    for (const item of participantsToCertify) {
      const participant = item.participant;

      // Cek apakah sudah punya sertifikat
      const { data: existing } = await supabase
        .from("certificate")
        .select("id")
        .eq("event_id", eventId)
        .eq("participant_id", participant.id)
        .single();

      let certId = existing?.id;

      if (!existing) {
        // Generate Nomor Sertifikat (Format: NO/TAHUN/ACAK)
        const certNo = `CRT/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`;

        const { data: newCert } = await supabase
          .from("certificate")
          .insert({
            event_id: eventId,
            participant_id: participant.id,
            cert_no: certNo,
          })
          .select()
          .single();
        
        certId = newCert.id;
      }

      // 4. Kirim Email Notifikasi
      // Link mengarah ke Frontend Public Page
      const certificateLink = `${process.env.FRONTEND_URL}/certificate/${certId}`;
      await sendCertificateEmail(participant.email, participant.name, event.title, certificateLink);
      
      issuedCount++;
    }

    return res.status(200).json({
      message: "Proses penerbitan selesai.",
      issued_count: issuedCount
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Gagal menerbitkan sertifikat." });
  }
};

/**
 * 2. Get Public Certificate Data (Tanpa Auth / Public Read)
 * Dipakai oleh halaman /certificate/[id]
 */
const getCertificatePublic = async (req, res) => {
  const { id } = req.params;

  try {
    const { data: cert, error } = await supabase
      .from("certificate")
      .select(`
        id, cert_no, issued_at,
        participant:participant_id (name),
        event:event_id (title, datetime, location, cert_background)
      `)
      .eq("id", id)
      .single();

    if (error || !cert) {
      return res.status(404).json({ message: "Sertifikat tidak ditemukan." });
    }

    return res.json(cert);
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { issueCertificates, getCertificatePublic };