import express from "express";
import mysql from "mysql2";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// For __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// MySQL connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting: " + err.stack);
    return;
  }
  console.log("Connected as id " + db.threadId);
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public")); // Serve static files
app.set("view engine", "ejs");

// Routes
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/login.html");
});

app.post("/login", (req, res) => {
  const { std_id, std_password } = req.body;
  db.query(
    "SELECT * FROM Student_Details WHERE std_id = ? AND std_password = ?",
    [std_id, std_password],
    (error, results) => {
      if (results.length > 0) {
        res.render("dashboard", { student: results[0] });
      } else {
        res.send("Incorrect Student ID and/or Password!");
      }
    },
  );
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

// Route to display room selection page
app.get("/select-room", (req, res) => {
  const studentId = req.query.std_id; // Retrieve the student ID from the query parameter

  if (!studentId) {
    res.status(400).send("Student ID is required.");
    return;
  }

  // First, check if the student already has a room assigned
  const checkRoomAssignedQuery =
    "SELECT room_id FROM Student_Details WHERE std_id = ? AND room_id IS NOT NULL";
  db.query(checkRoomAssignedQuery, [studentId], (error, results) => {
    if (error) {
      console.error("Error checking room assignment: " + error.message);
      res.status(500).send("An error occurred while checking room assignment.");
      return;
    }

    if (results.length > 0) {
      // The student already has a room assigned
      res.send("You have already selected a room.");
      return;
    }

    // If no room is assigned, proceed to show available rooms
    const query = `
      SELECT room_id, room_no, room_capacity, room_occupancy, (room_capacity - room_occupancy) AS bedAvail
      FROM Room_Details
      WHERE room_capacity > room_occupancy
    `;

    db.query(query, (error, rooms) => {
      if (error) {
        console.error("Error fetching rooms: " + error.message);
        res.status(500).send("An error occurred while fetching the rooms.");
        return;
      }
      // Render the select-room view with the available rooms and studentId
      res.render("select-room", { rooms: rooms, studentId: studentId });
    });
  });
});

// Route to view details for a specific room
app.get("/view-room-details/:room_id", (req, res) => {
  const { room_id } = req.params;
  const { std_id } = req.query; // Get the student ID from the query string

  if (!std_id) {
    res.send("Student ID is required.");
    return;
  }

  // Define the SQL query to fetch room details including details of other students in the same room
  const roomQuery = "SELECT * FROM Room_Details WHERE room_id = ?";
  const studentsQuery = `
    SELECT std_fullname, std_faculty, std_year, std_state, std_pref, std_email, std_phone
    FROM Student_Details
    WHERE room_id = ?
  `;

  db.query(roomQuery, [room_id], (error, roomDetails) => {
    if (error) {
      console.error("Database query error: " + error);
      res.send("An error occurred while fetching room details.");
      return;
    }
    if (roomDetails.length > 0) {
      // Now fetch details of other students in the same room
      db.query(studentsQuery, [room_id], (error, studentDetails) => {
        if (error) {
          console.error("Database query error: " + error);
          res.send("An error occurred while fetching student details.");
          return;
        }
        // Render the room details view with room info and list of students
        res.render("view-room-details", {
          room: roomDetails[0],
          students: studentDetails,
          studentId: std_id, // Pass the current student's ID
        });
      });
    } else {
      res.send("Room not found.");
    }
  });
});

// Route to handle room selection
app.post("/select-room/:room_id", (req, res) => {
  const { room_id } = req.params;
  const { std_id } = req.body; // Getting student's ID from the body
  console.log("std_id:", std_id);
  // Start a transaction to update both the Room_Details and Student_Details atomically
  db.beginTransaction((err) => {
    if (err) {
      console.error("Error starting transaction: ", err);
      res.status(500).send("An error occurred.");
      return;
    }

    // Query to increment room occupancy and decrement available beds
    const updateRoomQuery =
      "UPDATE Room_Details SET room_occupancy = room_occupancy + 1 WHERE room_id = ? AND room_capacity > room_occupancy";

    db.query(updateRoomQuery, [room_id], (error, result) => {
      if (error) {
        db.rollback(() => {
          console.error("Error updating room details: ", error);
          res
            .status(500)
            .send("An error occurred while updating room details.");
        });
        return;
      }

      if (result.affectedRows === 0) {
        db.rollback(() => {
          console.log("No rows affected, possibly no available beds.");
          res.status(409).send("No available beds or room does not exist.");
        });
        return;
      }

      const updateStudentQuery =
        "UPDATE Student_Details SET room_id = ? WHERE std_id = ?";
      db.query(updateStudentQuery, [room_id, std_id], (error, result) => {
        if (error) {
          db.rollback(() => {
            console.error("Error updating student details: ", error);
            res
              .status(500)
              .send("An error occurred while updating student details.");
          });
          return;
        }

        db.commit((err) => {
          if (err) {
            db.rollback(() => {
              console.error("Error during transaction commit: ", err);
              res
                .status(500)
                .send("An error occurred during transaction commit.");
            });
            return;
          }
          console.log("Transaction Complete.");
          // Redirect or send a success message/page
          // Assuming you have a route for the dashboard
          res.redirect(`/dashboard?std_id=${std_id}`);
        });
      });
    });
  });
});

app.get("/dashboard", (req, res) => {
  const studentId = req.query.std_id;

  if (!studentId) {
    res.status(400).send("Student ID is required.");
    return;
  }

  const studentDetailsQuery = `
    SELECT s.*, r.room_no, r.room_capacity, r.room_occupancy
    FROM Student_Details s
    LEFT JOIN Room_Details r ON s.room_id = r.room_id
    WHERE s.std_id = ?
  `;

  db.query(studentDetailsQuery, [studentId], (error, studentResults) => {
    if (error) {
      console.error("Error fetching student details: " + error.message);
      res.status(500).send("An error occurred while fetching student details.");
      return;
    }
    if (studentResults.length > 0) {
      const student = studentResults[0];
      const roomDetails = student.room_id
        ? {
            room_no: student.room_no,
            room_capacity: student.room_capacity,
            room_occupancy: student.room_occupancy,
          }
        : null;

      // Check if the student has a room and get roommates details
      if (student.room_id) {
        const roommatesQuery = `
          SELECT std_fullname, std_faculty, std_year, std_state, std_pref, std_email, std_phone
          FROM Student_Details
          WHERE room_id = ? AND std_id != ?
        `;
        db.query(
          roommatesQuery,
          [student.room_id, studentId],
          (error, roommatesResults) => {
            if (error) {
              console.error(
                "Error fetching roommates details: " + error.message,
              );
              res
                .status(500)
                .send("An error occurred while fetching roommates details.");
              return;
            }
            res.render("dashboard", {
              student: student,
              roomDetails: roomDetails,
              roommates: roommatesResults,
            });
          },
        );
      } else {
        // Student does not have a room
        res.render("dashboard", {
          student: student,
          roomDetails: null,
          roommates: [],
        });
      }
    } else {
      res.send("Student not found.");
    }
  });
});

app.post("/admin/login", (req, res) => {
  const { admin_id, admin_password } = req.body;
  console.log("Admin ID:", admin_id); // For debugging
  console.log("Admin Password:", admin_password); // For debugging

  // SQL query to check admin credentials
  const query =
    "SELECT * FROM Admin_Details WHERE admin_id = ? AND admin_password = ?";

  db.query(query, [admin_id, admin_password], (error, results) => {
    if (error) {
      // Handle any errors that occur during the query
      console.error("Error in admin login query: ", error);
      res.status(500).send("An error occurred during the login process.");
      return;
    }

    console.log("Query Results:", results); // For debugging
    if (results.length > 0) {
      // If the query returns a record, login is successful
      res.render("admin-dashboard", { admin: results[0] }); // Pass the admin data to the dashboard
    } else {
      // If the record is not found, send an error message
      res.send("Incorrect username and/or password!");
    }
  });
});

app.get("/admin/dashboard", (req, res) => {
  // Render the admin dashboard view
  res.render("admin-dashboard");
});

app.get("/admin/students", (req, res) => {
  // Query to select all student details
  const query = "SELECT * FROM Student_Details";

  db.query(query, (error, results) => {
    if (error) {
      // Handle any errors that occur during the query
      console.error("Error fetching student details: ", error);
      res.status(500).send("An error occurred while fetching student details.");
      return;
    }

    // Render the admin-student-details view, passing the student data
    res.render("admin-student-details", { students: results });
  });
});

app.get("/admin/rooms", (req, res) => {
  // Query to select all room details
  const query =
    "SELECT room_id, room_no, room_capacity, room_occupancy, (room_capacity - room_occupancy) AS bedAvail, room_gender FROM Room_Details";

  db.query(query, (error, results) => {
    if (error) {
      // Handle any errors that occur during the query
      console.error("Error fetching room details: ", error);
      res.status(500).send("An error occurred while fetching room details.");
      return;
    }

    // Render the admin-room-details view, passing the room data
    res.render("admin-room-details", { rooms: results });
  });
});

app.post("/admin/students/register", (req, res) => {
  const { std_id, std_fullName, std_gender, std_password } = req.body;

  // Creating a new Date object
  const now = new Date();
  // Formatting date and time: YYYY-MM-DD HH:MM:SS
  const reg_date = now.toISOString().slice(0, 19).replace("T", " ");

  // SQL query to insert a new student record
  const query =
    "INSERT INTO Student_Details (std_id, std_fullName, std_gender, std_password, reg_date) VALUES (?, ?, ?, ?, ?)";

  db.query(
    query,
    [std_id, std_fullName, std_gender, std_password, reg_date],
    (error, results) => {
      if (error) {
        // Handle any errors that occur during the query
        console.error("Error registering new student: ", error);
        res
          .status(500)
          .send("An error occurred while registering the student.");
        return;
      }

      // After registration, redirect back to the student details page or send a success message
      res.redirect("/admin/students");
      // Or you could render the page with a success message
      // res.render("admin-student-details", { successMessage: "Student registered successfully." });
    },
  );
});

app.get("/admin/room/view/:room_id", async (req, res) => {
  const { room_id } = req.params;

  try {
    const roomDetailsQuery = "SELECT * FROM Room_Details WHERE room_id = ?";
    const [roomDetails] = await db.promise().query(roomDetailsQuery, [room_id]);

    const studentQuery = "SELECT * FROM Student_Details WHERE room_id = ?";
    const [students] = await db.promise().query(studentQuery, [room_id]);

    res.render("view-room", {
      room: roomDetails[0],
      students: students,
    });
  } catch (error) {
    console.error("Error fetching room details: ", error);
    res.status(500).send("An error occurred while fetching room details.");
  }
});
app.get("/admin/room/unassign/:std_id", async (req, res) => {
  const { std_id } = req.params;

  try {
    // First, retrieve the current room ID for the student
    const getRoomIdQuery =
      "SELECT room_id FROM Student_Details WHERE std_id = ?";
    const [studentRoom] = await db.promise().query(getRoomIdQuery, [std_id]);
    const { room_id } = studentRoom[0];

    // Begin a transaction to ensure data consistency
    await db.promise().beginTransaction();

    // Unassign the student
    const unassignStudentQuery =
      "UPDATE Student_Details SET room_id = NULL WHERE std_id = ?";
    await db.promise().query(unassignStudentQuery, [std_id]);

    // Decrement room occupancy
    const updateRoomQuery =
      "UPDATE Room_Details SET room_occupancy = room_occupancy - 1 WHERE room_id = ?";
    await db.promise().query(updateRoomQuery, [room_id]);

    // Commit the transaction
    await db.promise().commit();

    // Redirect back to the room details page or send a success message
    res.redirect("back");
  } catch (error) {
    // If an error occurs, rollback the transaction
    await db.promise().rollback();
    console.error(
      "Error unassigning student and updating room details: ",
      error,
    );
    res
      .status(500)
      .send(
        "An error occurred while unassigning the student and updating room details.",
      );
  }
});
app.post("/admin/rooms/add", async (req, res) => {
  const { room_no, room_capacity, room_gender } = req.body;
  const room_occupancy = 0;
  const bedAvail = room_capacity; // Initially equal to capacity

  try {
    const query =
      "INSERT INTO Room_Details (room_no, room_capacity, room_gender, room_occupancy, bedAvail) VALUES (?, ?, ?, ?, ?)";
    await db
      .promise()
      .query(query, [
        room_no,
        room_capacity,
        room_gender,
        room_occupancy,
        bedAvail,
      ]);

    // Redirect back to the room details page or send a success message
    res.redirect("/admin/rooms");
  } catch (error) {
    console.error("Error adding new room: ", error);
    res.status(500).send("An error occurred while adding the room.");
  }
});
app.get("/admin/rooms/check-students/:room_id", async (req, res) => {
  const { room_id } = req.params;
  try {
    const query =
      "SELECT COUNT(*) AS studentCount FROM Student_Details WHERE room_id = ?";
    const [results] = await db.promise().query(query, [room_id]);
    res.json({ studentCount: results[0].studentCount });
  } catch (error) {
    console.error("Error checking students in room: ", error);
    res.status(500).send("An error occurred while checking students in room.");
  }
});
app.post("/admin/rooms/delete/:room_id", async (req, res) => {
  const { room_id } = req.params;
  try {
    await db.promise().beginTransaction();

    // Unassign students
    const unassignQuery =
      "UPDATE Student_Details SET room_id = NULL WHERE room_id = ?";
    await db.promise().query(unassignQuery, [room_id]);

    // Delete the room
    const deleteRoomQuery = "DELETE FROM Room_Details WHERE room_id = ?";
    await db.promise().query(deleteRoomQuery, [room_id]);

    await db.promise().commit();
    res.json({
      success: true,
      message:
        "Room and all student assignments have been deleted successfully.",
    });
  } catch (error) {
    await db.promise().rollback();
    console.error("Error deleting room: ", error);
    res.status(500).json({ success: false, message: "Failed to delete room." });
  }
});
