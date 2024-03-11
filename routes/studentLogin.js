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

// Route to handle the POST request from the login form
router.post("/student-login", (req, res) => {
  const { std_id, std_password } = req.body;
  const query =
    "SELECT * FROM Student_Details WHERE std_id = ? AND std_password = ?";

  dbConnection.query(query, [std_id, std_password], (error, results) => {
    if (error) {
      res.status(500).send("Database query failed");
    } else if (results.length > 0) {
      // TODO: Implement session or token logic here if needed
      res.send("Login Successful!");
    } else {
      res.status(401).send("Invalid student ID or password");
    }
  });
});

export default router;
