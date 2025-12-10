const nodemailer = require("nodemailer");
const QRCode = require("qrcode");

// Konfigurasi Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true, // true untuk 465, false untuk lainnya
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Format Rupiah
 */
const formatRupiah = (amount) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

/**
 * Kirim Email Tiket
 * @param {Object} orderData - Data lengkap order (join event & participant)
 * @param {Object} ticketData - Data tiket (qr_token)
 * @param {Object} paymentData - Data pembayaran (midtrans_id, paid_at)
 */
const sendTicketEmail = async (orderData, ticketData, paymentData) => {
  try {
    // 1. Generate QR Code menjadi Data URL (Base64)
    const qrCodeDataUrl = await QRCode.toDataURL(ticketData.qr_token, {
      width: 300,
      margin: 2,
      color: {
        dark: "#344270",
        light: "#ffffff",
      },
    });

    // 2. Siapkan konten email (HTML)
    const eventDate = new Date(orderData.event.datetime).toLocaleDateString(
      "id-ID",
      {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }
    );

    const paidAt = new Date(paymentData.paid_at).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta", 
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short", // Akan menampilkan "WIB"
    });

    // === MODIFIKASI DIMULAI DARI SINI ===
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden;">
        <div style="background: linear-gradient(90deg, #50A3FB 0%, #A667E4 100%); padding: 20px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 24px;">E-Ticket & Bukti Pembayaran</h1>
          <p style="margin: 5px 0 0;">Terima kasih, pembayaran Anda berhasil!</p>
        </div>

        <div style="padding: 20px; background-color: #ffffff;">
          
          <h2 style="color: #344270; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px;">Detail Acara</h2>
          <table style="width: 100%; margin-bottom: 20px;">
            <tr>
              <td style="color: #666; width: 100px; padding: 5px 0;">Event</td>
              <td style="font-weight: bold; color: #333;">${orderData.event.title}</td>
            </tr>
            <tr>
              <td style="color: #666; padding: 5px 0;">Jadwal</td>
              <td style="font-weight: bold; color: #333;">${eventDate}</td>
            </tr>
            <tr>
              <td style="color: #666; padding: 5px 0;">Lokasi</td>
              <td style="font-weight: bold; color: #333;">${orderData.event.location}</td>
            </tr>
          </table>

          <h2 style="color: #344270; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px;">Data Peserta</h2>
          <table style="width: 100%; margin-bottom: 20px;">
            <tr>
              <td style="color: #666; width: 100px; padding: 5px 0;">Nama</td>
              <td style="font-weight: bold; color: #333;">${orderData.participant.name}</td>
            </tr>
            <tr>
              <td style="color: #666; padding: 5px 0;">Email</td>
              <td style="font-weight: bold; color: #333;">${orderData.participant.email}</td>
            </tr>
            <tr>
              <td style="color: #666; padding: 5px 0;">No. HP</td>
              <td style="font-weight: bold; color: #333;">${orderData.participant.phone || '-'}</td>
            </tr>
          </table>

          <div style="text-align: center; background-color: #f9faff; padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 1px dashed #50A3FB;">
            <p style="margin: 0 0 10px; color: #344270; font-weight: bold;">Scan QR ini untuk Check-in</p>
            <img src="cid:unique-qr-code" alt="QR Ticket" style="width: 200px; height: 200px;" />
            <p style="margin: 10px 0 0; color: #888; font-size: 12px;">Token: ${ticketData.qr_token}</p>
          </div>

          <h2 style="color: #344270; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px;">Rincian Pembayaran</h2>
          <table style="width: 100%;">
            <tr>
              <td style="color: #666; padding: 5px 0;">No. Order</td>
              <td style="text-align: right; color: #333;">#${orderData.id.split("-")[0]}</td>
            </tr>
            <tr>
              <td style="color: #666; padding: 5px 0;">Status</td>
              <td style="text-align: right; color: #28a745; font-weight: bold;">LUNAS (PAID)</td>
            </tr>
            <tr>
              <td style="color: #666; padding: 5px 0;">Metode</td>
              <td style="text-align: right; color: #333;">QRIS / Midtrans</td>
            </tr>
            <tr>
              <td style="color: #666; padding: 5px 0;">Waktu Bayar</td>
              <td style="text-align: right; color: #333;">${paidAt}</td>
            </tr>
            <tr>
              <td style="color: #666; padding: 10px 0; font-weight: bold; border-top: 1px solid #eee;">TOTAL BAYAR</td>
              <td style="text-align: right; font-weight: bold; color: #50A3FB; font-size: 18px; border-top: 1px solid #eee; padding: 10px 0;">
                ${formatRupiah(orderData.amount)}
              </td>
            </tr>
          </table>

        </div>

        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #888;">
          <p style="margin: 0;">Email ini adalah bukti pembayaran yang sah.</p>
          <p style="margin: 5px 0;">&copy; 2025 Cermin Event Platform</p>
        </div>
      </div>
    `;
    // === MODIFIKASI SELESAI ===

    // 3. Kirim Email
    const info = await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_USER}>`,
      to: orderData.participant.email,
      subject: `E-Ticket: ${orderData.event.title}`,
      html: htmlContent,
      // Embed QR code sebagai attachment dengan Content-ID agar tampil inline
      attachments: [
        {
          filename: "ticket-qr.png",
          path: qrCodeDataUrl,
          cid: "unique-qr-code", // Sesuai dengan src="cid:..." di HTML
        },
      ],
    });

    console.log("Email tiket terkirim ke:", orderData.participant.email, info.messageId);
    return true;
  } catch (error) {
    console.error("Gagal mengirim email tiket:", error);
    return false;
  }
};

module.exports = { sendTicketEmail };