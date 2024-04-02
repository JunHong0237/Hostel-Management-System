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

  // Query to get all rooms with at least one available bed
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

// Route to view details for a specific room
app.get("/view-room-details/:room_id", (req, res) => {
  const { room_id } = req.params;
  const { std_id } = req.query; // Get the student ID from the query string

  // Ensure that the student ID is provided
  if (!std_id) {
    res.send("Student ID is required.");
    return;
  }

  // Define the SQL query to fetch room details
  const query = "SELECT * FROM Room_Details WHERE room_id = ?";

  db.query(query, [room_id], (error, roomDetails) => {
    if (error) {
      console.error("Database query error: " + error);
      res.send("An error occurred while fetching room details.");
      return;
    }
    if (roomDetails.length > 0) {
      // Render the room details view
      res.render("view-room-details", {
        room: roomDetails[0],
        studentId: std_id, // Pass the student ID to the view
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
          res.redirect("/dashboard"); // Assuming you have a route for the dashboard
        });
      });
    });
  });
});
