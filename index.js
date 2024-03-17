import express from "express";
import studentLoginRouter from "./routes/studentLogin.js";
import adminLoginRouter from "./routes/adminLogin.js";
import apiRoutes from "./routes/apiRoutes.js";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";

const app = express();
const port = process.env.PORT || 3000;

// Session middleware configuration
app.use(
  session({
    secret: "this-is-my-secret-key-for-my-project",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === "production", // `true` only if in production environment
      httpOnly: true, // Mitigate XSS attacks by not allowing JS access to the cookie
    },
  }),
);

// ES6 modules fix for __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'views' directory
app.use(express.static(path.join(__dirname, "views")));
app.use(express.static(path.join(__dirname, "public")));

// Serve the student-login.html when the root route '/' is accessed
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "student-login.html"));
});

// Use the studentLoginRouter and adminLoginRouter for the '/auth' path
app.use("/auth", studentLoginRouter);
app.use("/auth", adminLoginRouter);

// Serve the student-dashboard.html when the '/student-dashboard' route is accessed
app.get("/student-dashboard", (req, res) => {
  if (req.session.user && req.session.user.std_id) {
    res.sendFile(path.join(__dirname, "views", "student-dashboard.html"));
  } else {
    res.redirect("/"); // Redirect to login if not logged in
  }
});

// Serve the admin-login.html when the '/admin-login' route is accessed
app.get("/admin-login", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "admin-login.html"));
});

// API routes
app.use("/api", apiRoutes);

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
