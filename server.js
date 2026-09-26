// server.js
require("dotenv").config();

const express = require("express");
const { engine } = require("express-handlebars");
const path = require("path");

// ✅ Use global fetch (Node ≥18.17) or fall back to node-fetch
const fetchFn = global.fetch || require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE =
  process.env.API_BASE ||
  "https://dating-app-api-1-3zzv.onrender.com" ||
  "http://localhost:9000";

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
  console.log(`🚀 PiiChat website running at http://localhost:${PORT}`);
  console.log(`📡 Using API base: ${API_BASE}`);
});
