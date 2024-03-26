// index.js
import express from "express";
import session from "express-session";
import studentLoginRouter from "./routes/studentLogin.js";
import adminLoginRouter from "./routes/adminLogin.js";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "views")));

// Configure express-session
app.use(
  session({
    secret: "secret", // Change this to a secret phrase
    resave: false,
    saveUninitialized: true,
  }),
);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "student-login.html"));
});

// Register routes
app.use("/auth", studentLoginRouter);
app.use("/auth", adminLoginRouter);

app.get("/admin-login", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "admin-login.html"));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Add this route in index.js or in a new router file
app.get("/dashboard", (req, res) => {
  if (!req.session.studentId) {
    return res.status(403).send("Not logged in");
  }

  const studentId = req.session.studentId;
  const query =
    "SELECT std_fullName, std_gender, std_email, std_phone, std_faculty, std_year, std_state, std_pref FROM Student_Details WHERE std_id = ?";

  dbConnection.query(query, [studentId], (error, results) => {
    if (error) {
      return res.status(500).send("Database query failed");
    }
    if (results.length > 0) {
      const studentInfo = results[0];
      // Assuming you are using EJS as your template engine
      res.render("studentDashboard", { student: studentInfo });
    } else {
      res.status(404).send("Student not found");
    }
  });
});

app.set("view engine", "ejs");
