const jwt = require("jsonwebtoken");

function extractToken(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  // Fallback to cookie used by Supabase Auth Helpers
  const cookieToken = req.cookies?.["sb-access-token"] || req.cookies?.["access_token"];
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
  return (
    payload?.user_metadata?.role ||
    payload?.app_metadata?.role ||
    (payload?.["https://hasura.io/jwt/claims"] &&
      payload["https://hasura.io/jwt/claims"]["x-hasura-role"]) ||
    payload?.role ||
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
      return res.status(500).json({ message: err.message });
    }
    return res.status(401).json({ message: "Unauthorized: invalid token" });
  }
}

function requireRoles(allowedRoles = []) {
  return (req, res, next) => {
    requireAuth(req, res, function afterAuth() {
      if (!allowedRoles || allowedRoles.length === 0) return next();
      const role = req.role;
      if (!role) {
        return res.status(403).json({ message: "Forbidden: role not found" });
      }
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({ message: "Forbidden: insufficient role" });
      }
      return next();
    });
  };
}

const requireUser = requireRoles(["user", "admin"]);
const requireAdmin = requireRoles(["admin"]);

module.exports = {
  requireAuth,
  requireRoles,
  requireUser,
  requireAdmin,
};

