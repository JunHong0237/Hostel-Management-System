// studentLogin.js
import express from "express";
import mysql from "mysql";

// Create a router for this module
const router = express.Router();

// MySQL connection (make sure to fill this with your own database credentials)
const dbConnection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

// Connect to the database
dbConnection.connect((error) => {
  if (error) throw error;
  console.log("Successfully connected to the database.");
});

router.post("/student-login", (req, res) => {
  const { std_id, std_password } = req.body;
  const query =
    "SELECT * FROM Student_Details WHERE std_id = ? AND std_password = ?";

  dbConnection.query(query, [std_id, std_password], (error, results) => {
    if (error) {
      res.status(500).send("Database query failed");
    } else if (results.length > 0) {
      // Set the session user object
      req.session.user = { std_id: results[0].std_id };
      console.log("Student logged in:", req.session.user); // Add for debugging
      // Explicitly save the session before redirecting
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          res.status(500).send("Failed to save session");
        } else {
          // Redirect to the student dashboard only after the session is saved
          res.redirect("/student-dashboard");
        }
      });
    } else {
      res.redirect("/"); // Redirect to login page if authentication fails
    }
  });
});

export default router;
