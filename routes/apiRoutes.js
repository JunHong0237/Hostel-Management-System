import express from "express";
import dbConnection from "../db.js";

const router = express.Router();

// Middleware to check if a user is logged in
function isAuthenticated(req, res, next) {
  if (!req.session.user) {
    return res.status(401).send("User not authenticated");
  }
  next();
}

// Apply isAuthenticated middleware to all routes in this router
router.use(isAuthenticated);

// Fetch student information
router.get("/student-info", (req, res) => {
  const studentId = req.session.user.std_id;

  const query =
    "SELECT std_id, std_fullName, std_gender, std_email, std_phone, std_faculty, std_year, std_state, std_pref FROM Student_Details WHERE std_id = ?";
  dbConnection.query(query, [studentId], (error, results) => {
    if (error) {
      return res.status(500).send("Error fetching student information");
    }
    if (results.length > 0) {
      return res.json(results[0]);
    } else {
      return res.status(404).send("Student not found");
    }
  });
});

// Update student information
router.put("/student-info", (req, res) => {
  // Extract and validate the fields that can be updated
  const { std_email, std_phone, std_faculty, std_year, std_state, std_pref } =
    req.body;
  const studentId = req.session.user.std_id;

  // Basic validation (Expand this based on your requirements)
  if (!std_email || !std_phone) {
    return res.status(400).send("Required fields are missing");
  }

  const query =
    "UPDATE Student_Details SET std_email = ?, std_phone = ?, std_faculty = ?, std_year = ?, std_state = ?, std_pref = ? WHERE std_id = ?";
  dbConnection.query(
    query,
    [
      std_email,
      std_phone,
      std_faculty,
      std_year,
      std_state,
      std_pref,
      studentId,
    ],
    (error, results) => {
      if (error) {
        return res.status(500).send("Error updating student information");
      }
      if (results.affectedRows > 0) {
        return res.status(204).send(); // No content to send back
      } else {
        // No records updated, could be because the student ID didn't match
        return res.status(404).send("Student not found or no changes made.");
      }
    },
  );
});

export default router;
