// server.js
const express = require("express");
const { engine } = require("express-handlebars");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Handlebars setup
app.engine(
  "html",
  engine({
    extname: ".html",
    defaultLayout: "layout",
    layoutsDir: path.join(__dirname, "views"),
    partialsDir: path.join(__dirname, "views"),
  })
);
app.set("view engine", "html");
app.set("views", path.join(__dirname, "views"));

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.get("/", (req, res) => {
  res.render("index", {
    title: "PiiChat - Connect, Chat, Share",
    isHome: true,
  });
});

app.get("/privacy", (req, res) => {
  res.render("privacy", {
    title: "Privacy Policy - PiiChat",
    isPrivacy: true,
  });
});

app.get("/terms", (req, res) => {
  res.render("terms", {
    title: "Terms & Conditions - PiiChat",
    isTerms: true,
  });
});

app.get("/delete-account", (req, res) => {
  res.render("delete-account", {
    title: "Delete Your Account - PiiChat",
    isDelete: true,
  });
});

app.get("/about", (req, res) => {
  res.render("about", {
    title: "About - PiiChat",
    isAbout: true,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render("index", {
    title: "Page Not Found - PiiChat",
    isHome: true,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 PiiChat website running at http://localhost:${PORT}`);
});
