// Import statements
import express from "express";
import session from "express-session";
import studentLoginRouter from "./routes/studentLogin.js";
import adminLoginRouter from "./routes/adminLogin.js";
import apiRoutes from "./routes/apiRoutes.js";
import path from "path";
import { fileURLToPath } from "url";

// Dynamic import of express-mysql-session within an async function
const setupExpressApp = async () => {
  const MySQLStore = (await import("express-mysql-session")).default(session);

  const app = express();
  const port = process.env.PORT || 3000;

  // MySQL session store options
  const options = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  };

  const sessionStore = new MySQLStore(options);

  app.use(
    session({
      key: "session_cookie_name",
      secret: "this-is-my-secret-key-for-my-project",
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: true, // Set to true in production if using HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    }),
  );

  // ES6 modules fix for __dirname
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve static files from 'views' and 'public' directories
  app.use(express.static(path.join(__dirname, "views")));
  app.use(express.static(path.join(__dirname, "public")));

  // Routes
  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "student-login.html"));
  });

  app.use("/auth", studentLoginRouter);
  app.use("/auth", adminLoginRouter);
  app.get("/student-dashboard", (req, res) => {
    console.log("Accessing student dashboard. Session user:", req.session.user);
    if (req.session.user && req.session.user.std_id) {
      res.sendFile(path.join(__dirname, "views", "student-dashboard.html"));
    } else {
      console.log("Redirecting to login. No valid session.");
      res.redirect("/");
    }
  });

  app.get("/admin-login", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "admin-login.html"));
  });

  app.use("/api", apiRoutes);

  // Start the server
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
};

setupExpressApp().catch((error) =>
  console.error("Failed to setup express app:", error),
);
