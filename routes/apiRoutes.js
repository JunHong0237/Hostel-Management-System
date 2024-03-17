import express from "express";
const router = express.Router();

// Assuming you're using the mysql connection setup from before
//import dbConnection from "./dbConnection"; // Ensure you export dbConnection from your existing file
// Update the import path to reference db.js from the root directory
import dbConnection from "../db.js";

// Fetch student information
router.get("/student-info", (req, res) => {
  // Replace 'authenticatedStudentId' with actual logic to retrieve the logged-in student's ID
  const studentId = req.session.authenticatedStudentId;

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
  // Extract the fields that can be updated
  const { std_email, std_phone, std_faculty, std_year, std_state, std_pref } =
    req.body;
  const studentId = req.session.authenticatedStudentId; // Again, ensure you get the actual student ID from session or another auth mechanism

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
      return res.send("Profile updated successfully");
    },
  );
});

export default router;
