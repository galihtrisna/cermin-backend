const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const supabase = require("../utils/supabase");
const crypto = require("crypto");
const { sendVerificationEmail } = require("../utils/emailService");

const JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET ||
  process.env.SUPABASE_JWT ||
  "dev-secret-change-this";
const ACCESS_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 jam

function generateAccessToken(user) {
  const expireMs = Date.now() + ACCESS_TOKEN_TTL_MS;

  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role || null,
  };

  const token = jwt.sign(
    {
      ...payload,
      exp: Math.floor(expireMs / 1000),
    },
    JWT_SECRET,
    { algorithm: "HS256" }
  );

  return { token, expireMs };
}

function publicUser(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}

// POST /api/register
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "Nama, email, dan password wajib diisi." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from("users")
      .insert({
        name,
        email,
        password_hash: passwordHash,
      })
      .select("*")
      .single();

    if (error) {
      console.error(error);
      if (error.code === "23505") {
        return res
          .status(409)
          .json({ message: "Email sudah terdaftar, gunakan email lain." });
      }
      return res.status(500).json({ message: "Gagal mendaftar." });
    }

    return res.status(201).json({
      message: "Registrasi berhasil",
      data: publicUser(data),
    });
  } catch (error) {
    console.error("register error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// POST /api/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email dan password wajib diisi." });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !user) {
      console.error(error);
      return res.status(401).json({ message: "Email atau password salah." });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: "Email atau password salah." });
    }

    const { token, expireMs } = generateAccessToken(user);

    // optional cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: ACCESS_TOKEN_TTL_MS,
    });

    return res.json({
      message: "Login berhasil",
      data: {
        user: publicUser(user),
        accessToken: token,
        expire: expireMs,
      },
    });
  } catch (error) {
    console.error("login error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// DELETE /api/logout
exports.logout = async (req, res) => {
  try {
    res.clearCookie("token");
    return res.json({ message: "Logout berhasil" });
  } catch (error) {
    console.error("logout error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// GET /api/users/admin  → current user info
exports.getCurrentUserAdmin = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, email, role, is_verified, created_at")
      .eq("id", userId)
      .single();

    if (error || !user) {
      console.error(error);
      return res.status(404).json({ message: "User tidak ditemukan" });
    }

    return res.json({
      message: "Current user",
      data: user,
    });
  } catch (error) {
    console.error("getCurrentUserAdmin error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// PATCH /api/me/role  { role: "staff" | "admin" }
exports.setMyRole = async (req, res) => {
  try {
    const userId = req.userId;
    const { role } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!role || !["staff", "admin"].includes(role)) {
      return res.status(400).json({ message: "Role tidak valid" });
    }

    const { data: current, error: currentError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (currentError) {
      console.error(currentError);
      return res.status(500).json({ message: "Gagal mengambil user" });
    }

    if (current.role && current.role !== role) {
      return res.status(400).json({
        message:
          "Role sudah ditetapkan dan tidak bisa diubah lewat endpoint ini.",
      });
    }

    const { data: updated, error: updateError } = await supabase
      .from("users")
      .update({ role })
      .eq("id", userId)
      .select("*")
      .single();

    if (updateError) {
      console.error(updateError);
      return res.status(500).json({ message: "Gagal mengupdate role" });
    }

    const { token, expireMs } = generateAccessToken(updated);

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: ACCESS_TOKEN_TTL_MS,
    });

    return res.json({
      message: "Role berhasil diupdate",
      data: {
        user: publicUser(updated),
        accessToken: token,
        expire: expireMs,
      },
    });
  } catch (error) {
    console.error("setMyRole error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // ... (Validasi input & Cek email exist seperti biasa) ...

    const passwordHash = await bcrypt.hash(password, 10);

    // Insert User (Default is_verified = false dari DB)
    const newUser = await pool.query(
      `INSERT INTO public.users (name, email, password_hash) 
       VALUES ($1, $2, $3) RETURNING id, name, email`,
      [name, email, passwordHash]
    );
    
    const userId = newUser.rows[0].id;

    // --- LOGIKA VERIFIKASI ---
    // A. Generate Token Random
    const rawToken = crypto.randomBytes(32).toString("hex");
    
    // B. Hash Token untuk disimpan di DB (Keamanan)
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // C. Simpan ke tabel email_verifications (Expire 24 jam)
    await pool.query(
      `INSERT INTO public.email_verifications (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
      [userId, tokenHash]
    );

    // D. Buat Link Verifikasi (Arahkan ke Frontend Next.js)
    // Pastikan CLIENT_URL ada di .env (misal: http://localhost:3000)
    const verifyLink = `${process.env.CLIENT_URL}/auth/verify-email?token=${rawToken}&uid=${userId}`;

    // E. Kirim Email
    await sendVerificationEmail(email, name, verifyLink);

    res.status(201).json({
      success: true,
      message: "Registrasi berhasil. Silakan cek email Anda untuk verifikasi.",
      data: { id: userId, email }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// 2. VERIFY EMAIL CONTROLLER (BARU)
exports.verifyEmail = async (req, res) => {
  try {
    const { uid, token } = req.body; // Dikirim dari Frontend

    if (!uid || !token) {
      return res.status(400).json({ success: false, message: "Data tidak lengkap" });
    }

    // Hash token yang diterima dari user untuk dicocokkan dengan DB
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Panggil RPC Function yang kita buat di Bagian 1
    const result = await pool.query(
      `SELECT public.verify_user_email($1, $2) as result`,
      [uid, tokenHash]
    );

    const output = result.rows[0].result;

    if (!output.success) {
      return res.status(400).json({ success: false, message: output.message });
    }

    res.status(200).json({ success: true, message: output.message });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Gagal memverifikasi email" });
  }
};