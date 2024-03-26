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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "views")));
app.use(
  session({
    secret: process.env.SESSION_SECRET, // Use a .env variable for the secret
    resave: false,
    saveUninitialized: true,
  }),
);

// Set view engine to EJS
app.set("view engine", "ejs");

// Routers
app.use("/auth", studentLoginRouter);
app.use("/auth", adminLoginRouter);

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "student-login.html"));
});

app.get("/admin-login", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "admin-login.html"));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

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
