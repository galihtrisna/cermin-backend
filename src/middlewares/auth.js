// src/middlewares/auth.js
const jwt = require("jsonwebtoken");

function extractToken(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (
    authHeader &&
    typeof authHeader === "string" &&
    authHeader.startsWith("Bearer ")
  ) {
    return authHeader.substring(7);
  }
  // FIX: Tambahkan pengecekan cookie dengan nama "token" (sesuai controller login)
  const cookieToken =
    req.cookies?.["token"] ||
    req.cookies?.["sb-access-token"] ||
    req.cookies?.["access_token"];
  return cookieToken || null;
}

function verifySupabaseJwt(token) {
  const secret = process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_JWT;
  if (!secret) {
    const err = new Error("Missing SUPABASE_JWT_SECRET in environment");
    err.code = "NO_JWT_SECRET";
    throw err;
  }
  return jwt.verify(token, secret, { algorithms: ["HS256"] });
}

function resolveRoleFromClaims(payload) {
  // Prioritaskan role yang ada di root payload (yang kita set di controller)
  return (
    payload?.role ||
    payload?.user_metadata?.role ||
    payload?.app_metadata?.role ||
    null
  );
}

function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ message: "Unauthorized: token missing" });
    }

    const payload = verifySupabaseJwt(token);
    req.auth = payload;
    req.userId = payload?.sub || payload?.user_id || null;
    req.role = resolveRoleFromClaims(payload);
    return next();
  } catch (err) {
    if (err?.code === "NO_JWT_SECRET") {
      console.error(err);
      return res.status(500).json({ message: "Server configuration error" });
    }
    return res.status(401).json({ message: "Unauthorized: invalid token" });
  }
}

function requireRoles(allowedRoles = []) {
  return (req, res, next) => {
    // Panggil requireAuth terlebih dahulu untuk memvalidasi token
    requireAuth(req, res, function afterAuth() {
      // Jika terjadi error di requireAuth dan response sudah dikirim, berhenti.
      if (res.headersSent) return;

      if (!allowedRoles || allowedRoles.length === 0) return next();

      const role = req.role;
      // Jika user tidak punya role, atau role tidak ada di list
      if (!role || !allowedRoles.includes(role)) {
        return res
          .status(403)
          .json({ message: "Forbidden: insufficient permissions" });
      }
      return next();
    });
  };
}

function extractToken(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (
    authHeader &&
    typeof authHeader === "string" &&
    authHeader.startsWith("Bearer ")
  ) {
    return authHeader.substring(7);
  }
  // Cek cookie dengan berbagai kemungkinan nama
  return req.cookies?.["token"] || req.cookies?.["access_token"] || null;
}

// Roles definitions
const requireUser = requireRoles(["staff", "admin", "superadmin"]);
const requireAdmin = requireRoles(["admin", "superadmin"]);

module.exports = {
  requireAuth, // Export requireAuth dasar (login saja cukup)
  requireRoles,
  requireUser,
  requireAdmin,
};
