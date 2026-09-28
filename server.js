// server.js
require("dotenv").config();

const express = require("express");
const { engine } = require("express-handlebars");
const path = require("path");

// ✅ Use global fetch (Node ≥18.17) or fall back to node-fetch
const fetchFn = global.fetch || require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE = process.env.API_BASE;

// ── Handlebars ───────────────────────────────
app.engine(
  "html",
  engine({
    extname: ".html",
    defaultLayout: "layout",
    layoutsDir: path.join(__dirname, "views"),
    partialsDir: path.join(__dirname, "views"),
    helpers: {
      formatNumber(n) {
        if (n === undefined || n === null || isNaN(n)) return "0";
        return Number(n).toLocaleString("en-US");
      },
      eq(a, b) {
        return a === b;
      },
    },
  })
);
app.set("view engine", "html");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));

// ── In-memory cache: fetch stats at most once per 24h ──
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
let statsCache = { data: null, fetchedAt: 0 };

async function getStatsCached() {
  const now = Date.now();

  // Serve from cache if fresh
  if (statsCache.data && now - statsCache.fetchedAt < ONE_DAY_MS) {
    return statsCache.data;
  }

  let timeout;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetchFn(`${API_BASE}/api/stats`, {
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Stats API ${res.status}`);
    const json = await res.json();

    statsCache.data = json.data;
    statsCache.fetchedAt = now;
    return statsCache.data;
  } catch (e) {
    console.warn("Stats fetch failed, using stale cache:", e.message);
    return statsCache.data; // may be null on cold start
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

// ── Routes ────────────────────────────────────
app.get("/", async (req, res) => {
  const stats = await getStatsCached();
  res.render("index", {
    title: "PiiChat - Connect, Chat, Share",
    isHome: true,
    stats,
  });
});

app.get("/community-guide", (req, res) => {
  res.render("community-guide", {
    title: "Community Guide - PiiChat",
    isCommunityGuide: true,
  });
});

// server.js (website) — update the /verify route

// ============================================================
// VERIFY PAGE
// ============================================================
app.get("/verify", async (req, res) => {
  const { uid, t, userId, emailToken } = req.query;
  const resolvedUserId = uid || userId;
  const resolvedToken = t || emailToken;

  if (!resolvedUserId) {
    return res.render("verify", {
      title: "Verification - PiiChat",
      isVerify: true,
      step: "error",
      errorMessage: "Missing verification parameters.",
      userId: null,
      userFullName: null,
      userPhone: null,
      userEmail: null,
      emailVerified: false,
      phoneVerified: false,
      deepLink: null,
    });
  }

  let emailVerified = false;
  let phoneVerified = false;
  let userFullName = null;
  let userPhone = null;
  let userEmail = null;
  let errorMessage = null;
  let step = "error";

  if (resolvedToken === "verified" || resolvedToken === "phone_pending") {
    // Just read status
    try {
      const statusRes = await fetchFn(
        `${API_BASE}/api/verification/status?uid=${encodeURIComponent(
          resolvedUserId
        )}`
      );
      const data = await statusRes.json();
      if (statusRes.ok && data?.status === "success") {
        emailVerified = data.data.emailVerified;
        phoneVerified = data.data.phoneVerified;
        userFullName = data.data.userFullName;
        userPhone = data.data.userPhone;
        userEmail = data.data.userEmail;

        if (phoneVerified) {
          step = "done";
        } else if (emailVerified) {
          // Check if phone verification is pending
          if (
            resolvedToken === "phone_pending" ||
            data.data.phoneVerificationPending
          ) {
            step = "phone";
          } else {
            step = "email_done";
          }
        } else {
          step = "error";
          errorMessage = "Email not verified.";
        }
      } else {
        step = "error";
        errorMessage = data?.message || "Could not read status.";
      }
    } catch (err) {
      step = "error";
      errorMessage = "Could not read status.";
    }
  } else {
    // Verify email with token
    try {
      const apiRes = await fetchFn(
        `${API_BASE}/api/verification/verify-email` +
          `?uid=${encodeURIComponent(resolvedUserId)}` +
          `&t=${encodeURIComponent(resolvedToken)}`
      );
      const data = await apiRes.json();

      if (apiRes.ok && data?.status === "success") {
        emailVerified = true;
        userFullName = data.data.userFullName;
        userPhone = data.data.userPhone;
        userEmail = data.data.userEmail;
        phoneVerified = data.data.phoneVerified;

        if (phoneVerified) {
          step = "done";
        } else {
          step = "email_done"; // ✅ Show "request phone verification" button
        }
      } else {
        errorMessage =
          data?.message || "Verification link is invalid or has expired.";
        step = "error";
      }
    } catch (err) {
      console.error("Verify API call failed:", err.message);
      errorMessage = "We couldn't reach the verification server.";
      step = "error";
    }
  }

  res.render("verify", {
    title: "Verify your PiiChat account",
    isVerify: true,
    step,
    errorMessage,
    userId: resolvedUserId,
    userFullName,
    userPhone,
    userEmail,
    emailVerified,
    phoneVerified,
    deepLink: "piichat://verify-email?status=success",
  });
});

// ============================================================
// REQUEST PHONE VERIFICATION — called from verify page
// ============================================================
app.post("/request-phone-verification", express.json(), async (req, res) => {
  const { userId, phone } = req.body || {};
  if (!userId) {
    return res.status(400).json({ status: "error", message: "Missing userId" });
  }

  try {
    const apiRes = await fetchFn(`${API_BASE}/api/verification/request-phone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, phone }),
    });
    const data = await apiRes.json();
    res.status(apiRes.status).json(data);
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Failed to request phone verification. Try again.",
    });
  }
});

// ============================================================
// VERIFY PHONE — browser form POST → API
// ============================================================
app.post(
  "/verify-phone",
  express.urlencoded({ extended: true }),
  express.json(),
  async (req, res) => {
    const { phone, code } = req.body || {};
    if (!phone || !code) {
      return res
        .status(400)
        .json({ status: "error", message: "Missing phone or code" });
    }

    try {
      const apiRes = await fetchFn(
        `${API_BASE}/api/verification/verify-phone`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, code }),
        }
      );
      const data = await apiRes.json();
      res.status(apiRes.status).json(data);
    } catch (err) {
      res.status(500).json({
        status: "error",
        message: "Failed to verify phone. Try again.",
      });
    }
  }
);

app.get("/about", (req, res) => {
  res.render("about", { title: "About - PiiChat", isAbout: true });
});

app.get("/privacy", (req, res) => {
  res.render("privacy", { title: "Privacy Policy - PiiChat", isPrivacy: true });
});

app.get("/terms", (req, res) => {
  res.render("terms", { title: "Terms & Conditions - PiiChat", isTerms: true });
});

app.get("/delete-account", (req, res) => {
  res.render("delete-account", {
    title: "Delete Your Account - PiiChat",
    isDelete: true,
  });
});

app.get("/help", (req, res) => {
  res.render("help", { title: "Help & Feedback - PiiChat", isHelp: true });
});

app.use((req, res) => {
  res.status(404).render("index", {
    title: "Page Not Found - PiiChat",
    isHome: true,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 PiiChat website running at {API_BASE}:${PORT}`);
  console.log(`📡 Using API base: ${API_BASE}`);
});
