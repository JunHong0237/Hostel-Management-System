// index.js
import express from "express";
import session from "express-session";
import studentLoginRouter from "./routes/studentLogin.js";
import adminLoginRouter from "./routes/adminLogin.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Since 'express-mysql-session' is a CommonJS module, you need to use dynamic import
const MySQLStorePromise = import("express-mysql-session").then((module) =>
  module.default(session),
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "views")));

// Set the view engine to ejs
app.set("view engine", "ejs");

// You need to ensure that MySQLStore is available before setting up the session middleware
MySQLStorePromise.then((MySQLStore) => {
  const options = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  };

  const sessionStore = new MySQLStore(options);

  app.use(
    session({
      key: "session_cookie_name",
      secret: process.env.SESSION_SECRET,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false }, // Set to true if serving over HTTPS
    }),
  );

  // Continue setting up your routes and other middleware

  // Routes
  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "student-login.html"));
  });

  app.get("/admin-login", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "admin-login.html"));
  });

  // Use routers
  app.use("/auth", studentLoginRouter);
  app.use("/auth", adminLoginRouter);

  // ... other routes like "/dashboard"
  // Add this in index.js or in a suitable router file
  app.get("/dashboard", (req, res) => {
    if (!req.session.studentId) {
      // Redirect to login page if not logged in
      return res.redirect("/");
    }

    const studentId = req.session.studentId;
    const query =
      "SELECT std_fullName, std_gender, std_email, std_phone, std_faculty, std_year, std_state, std_pref FROM Student_Details WHERE std_id = ?";

    dbConnection.query(query, [studentId], (error, results) => {
      if (error) {
        console.error("Error fetching student info:", error);
        return res.status(500).send("Internal Server Error");
      }
      if (results.length > 0) {
        const studentInfo = results[0];
        // Render the dashboard view with student info
        res.render("studentDashboard", { student: studentInfo });
      } else {
        console.log("Student not found with ID:", studentId);
        res.status(404).send("Student not found");
      }
    });
  });

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}).catch((error) => {
  console.error("Failed to load express-mysql-session:", error);
});
