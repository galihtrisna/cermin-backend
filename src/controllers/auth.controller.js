// src/controllers/auth.controller.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const supabase = require("../utils/supabase");

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
    role: user.role, // bisa null
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

/**
 * POST /register
 */
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "name, email dan password wajib diisi" });
    }

    const { data: existing, error: existingError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingError) {
      console.error(existingError);
      return res.status(500).json({ message: "Gagal cek email" });
    }

    if (existing) {
      return res.status(409).json({ message: "Email sudah terdaftar" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const { data: user, error: insertError } = await supabase
      .from("users")
      .insert({ name, email, password_hash })
      .select("id, name, email, role, is_verified, created_at")
      .single();

    if (insertError) {
      console.error(insertError);
      return res.status(500).json({ message: "Gagal membuat user" });
    }

    return res.status(201).json({
      message: "Register berhasil",
      data: user,
    });
  } catch (error) {
    console.error("register error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * POST /login
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "email dan password wajib diisi" });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, email, password_hash, role, is_verified")
      .eq("email", email)
      .single();

    if (error || !user) {
      console.error(error);
      return res.status(401).json({ message: "Email atau password salah" });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: "Email atau password salah" });
    }

    const { token, expireMs } = generateAccessToken(user);

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: ACCESS_TOKEN_TTL_MS,
    });

    return res.json({
      message: "Login berhasil",
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isVerified: user.is_verified,
        },
        accessToken: token,
        expire: expireMs,
      },
    });
  } catch (error) {
    console.error("login error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * DELETE /logout
 */
exports.logout = async (_req, res) => {
  try {
    res.clearCookie("token");
    return res.json({
      message: "Logout berhasil",
      data: { success: true },
    });
  } catch (error) {
    console.error("logout error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * GET /users
 * optional: ?name=&email=
 */
exports.getAllUsers = async (req, res) => {
  try {
    const { name = "", email = "" } = req.query;

    let query = supabase
      .from("users")
      .select("id, name, email, role, is_verified, created_at")
      .order("created_at", { ascending: false });

    if (name) query = query.ilike("name", `%${name}%`);
    if (email) query = query.ilike("email", `%${email}%`);

    const { data, error } = await query;

    if (error) {
      console.error(error);
      return res.status(500).json({ message: "Gagal mengambil data user" });
    }

    return res.json({
      message: "Get all users successfully",
      data,
    });
  } catch (error) {
    console.error("getAllUsers error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * PATCH /users/:id
 * bisa update name, email, role
 */
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role } = req.body;

    const payload = {};
    if (name !== undefined) payload.name = name;
    if (email !== undefined) payload.email = email;
    if (role !== undefined) payload.role = role;

    const { data, error } = await supabase
      .from("users")
      .update(payload)
      .eq("id", id)
      .select("id, name, email, role, is_verified")
      .single();

    if (error) {
      console.error(error);
      return res.status(500).json({ message: "Gagal mengupdate user" });
    }

    return res.json({
      message: "Update user successfully",
      data,
    });
  } catch (error) {
    console.error("updateUser error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * DELETE /users/:id
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase.from("users").delete().eq("id", id);

    if (error) {
      console.error(error);
      return res.status(500).json({ message: "Gagal menghapus user" });
    }

    return res.json({
      message: "Delete user successfully",
      data: { id },
    });
  } catch (error) {
    console.error("deleteUser error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// GET /users/admin
exports.getCurrentUserAdmin = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, email, role, is_verified")
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

    // Ambil user sekarang
    const { data: current, error: currentError } = await supabase
      .from("users")
      .select("id, name, email, role, is_verified")
      .eq("id", userId)
      .single();

    if (currentError) {
      console.error(currentError);
      return res.status(500).json({ message: "Gagal mengambil user" });
    }

    // Kalau role sudah ada dan bukan null, jangan diubah-ubah lagi
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
      .select("id, name, email, role, is_verified")
      .single();

    if (updateError) {
      console.error(updateError);
      return res.status(500).json({ message: "Gagal mengupdate role" });
    }

    // Buat token baru dengan role yang sudah di-update
    const { token, expireMs } = generateAccessToken(updated);

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60,
    });

    return res.json({
      message: "Role berhasil diupdate",
      data: {
        user: updated,
        accessToken: token,
        expire: expireMs,
      },
    });
  } catch (error) {
    console.error("setMyRole error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
