// routes/adminLogin.js
import express from "express";
import mysql from "mysql";
import { fileURLToPath } from "url";
import path from "path";

const router = express.Router();

// ES6 modules fix for __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// MySQL connection (make sure to fill this with your own database credentials)
const dbConnection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

// Connect to the database
dbConnection.connect((error) => {
  if (error) {
    console.error("Error connecting to the database:", error);
    return;
  }
  console.log("Successfully connected to the database for admin routes.");
});

// Route to handle the POST request from the admin login form
router.post("/admin-login", (req, res) => {
  const { admin_id, admin_password } = req.body;
  const query =
    "SELECT * FROM Admin_Details WHERE admin_id = ? AND admin_password = ?";

  dbConnection.query(query, [admin_id, admin_password], (error, results) => {
    if (error) {
      res.status(500).send("Database query failed");
    } else if (results.length > 0) {
      // TODO: Implement session or token logic here if needed
      res.send("Admin Login Successful!");
    } else {
      res.status(401).send("Invalid admin ID or password");
    }
  });
});

export default router;
