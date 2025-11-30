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
