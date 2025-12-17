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

    // 1. Insert User ke Supabase
    const { data: user, error: userError } = await supabase
      .from("users")
      .insert({
        name,
        email,
        password_hash: passwordHash,
        is_verified: false, // Default belum verifikasi
      })
      .select("id, name, email")
      .single();

    if (userError) {
      console.error(userError);
      if (userError.code === "23505") {
        return res
          .status(409)
          .json({ message: "Email sudah terdaftar, gunakan email lain." });
      }
      return res.status(500).json({ message: "Gagal mendaftar." });
    }

    // 2. Logika Verifikasi Email
    try {
      // A. Generate Token Random
      const rawToken = crypto.randomBytes(32).toString("hex");

      // B. Hash Token untuk disimpan di DB
      const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

      // C. Hitung waktu expire (24 jam dari sekarang)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      // D. Simpan ke tabel email_verifications via Supabase
      const { error: verifyError } = await supabase
        .from("email_verifications")
        .insert({
          user_id: user.id,
          token_hash: tokenHash,
          expires_at: expiresAt.toISOString(),
        });

      if (verifyError) {
        console.error("Gagal simpan token verifikasi:", verifyError);
        // Opsional: Anda bisa menghapus user yang baru dibuat jika gagal bikin token
      } else {
        // E. Buat Link & Kirim Email
        // Pastikan CLIENT_URL di set di .env (misal: http://localhost:3000)
        const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
        const verifyLink = `${clientUrl}/auth/verify-email?token=${rawToken}&uid=${user.id}`;

        await sendVerificationEmail(email, name, verifyLink);
      }
    } catch (verifErr) {
      console.error("Error proses verifikasi:", verifErr);
      // Jangan return error 500 disini agar user tetap terdaftar walau email gagal
    }

    return res.status(201).json({
      success: true,
      message: "Registrasi berhasil. Silakan cek email Anda untuk verifikasi.",
      data: user,
    });
  } catch (error) {
    console.error("register error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// POST /api/auth/verify-email
exports.verifyEmail = async (req, res) => {
  try {
    const { uid, token } = req.body;

    if (!uid || !token) {
      return res
        .status(400)
        .json({ success: false, message: "Data tidak lengkap" });
    }

    // 1. Hash token yang diterima
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // 2. Cari token valid di DB via Supabase
    const { data: verification, error: fetchError } = await supabase
      .from("email_verifications")
      .select("*")
      .eq("user_id", uid)
      .eq("token_hash", tokenHash)
      .is("used_at", null) // Belum dipakai
      .gt("expires_at", new Date().toISOString()) // Belum expired
      .single();

    if (fetchError || !verification) {
      return res.status(400).json({
        success: false,
        message: "Token verifikasi tidak valid atau sudah kadaluwarsa.",
      });
    }

    // 3. Update status user menjadi verified
    const { error: updateUserError } = await supabase
      .from("users")
      .update({ is_verified: true })
      .eq("id", uid);

    if (updateUserError) {
      return res
        .status(500)
        .json({ success: false, message: "Gagal mengupdate status user." });
    }

    // 4. Tandai token sudah dipakai
    await supabase
      .from("email_verifications")
      .update({ used_at: new Date().toISOString() })
      .eq("id", verification.id);

    return res.json({
      success: true,
      message: "Email berhasil diverifikasi. Silakan login.",
    });
  } catch (error) {
    console.error("verifyEmail error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
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
      return res.status(401).json({ message: "Email atau password salah." });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: "Email atau password salah." });
    }

    // Cek apakah email sudah diverifikasi
    if (!user.is_verified) {
      return res.status(403).json({
        message:
          "Email belum diverifikasi. Silakan cek inbox Anda atau hubungi admin.",
      });
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