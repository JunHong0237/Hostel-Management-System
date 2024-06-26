import express from "express";
import session from "express-session";
import mysql from "mysql2";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import bcrypt from "bcrypt";

const saltRounds = 10;

async function hashPassword(plainPassword) {
  try {
    const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
    return hashedPassword;
  } catch (err) {
    console.error("Error hashing password:", err);
    throw err;
  }
}

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(
  session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  }),
);

app.get("/preventBack.js", (req, res) => {
  res.type(".js");
  res.send(`
    function preventBack() {
      window.history.forward();
    }

    preventBack();
    setTimeout(preventBack, 0);

    window.onunload = function () {
      null;
    };
  `);
});

// For __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set up storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// MySQL connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

app.use(express.json());

const openaiApiKey = process.env.OPENAI_API_KEY;

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
    "SELECT * FROM Student_Details WHERE std_id = ?",
    [std_id],
    async (error, results) => {
      if (error) {
        console.error("Error during login:", error);
        res.status(500).send("An error occurred during login.");
        return;
      }

      if (results.length > 0) {
        const student = results[0];

        try {
          const isMatch = await bcrypt.compare(
            std_password,
            student.std_password,
          );
          if (isMatch) {
            // Store user information in session
            req.session.user = {
              id: std_id,
              name: student.std_fullname,
              room_id: student.room_id,
            };

            if (student.room_id) {
              const roomDetailsQuery = `
                SELECT r.room_no, r.room_capacity, r.room_occupancy
                FROM Room_Details r
                JOIN Student_Details s ON r.room_id = s.room_id
                WHERE s.std_id = ?
              `;
              const roommatesQuery = `
                SELECT std_id, std_fullname, std_gender, std_faculty, std_year, std_state, std_pref, std_email, std_phone
                FROM Student_Details
                WHERE room_id = ? AND std_id != ?
              `;
              db.query(roomDetailsQuery, [std_id], (error, roomResults) => {
                if (error) {
                  console.error("Error fetching room details:", error);
                  res
                    .status(500)
                    .send("An error occurred while fetching room details.");
                  return;
                }
                const roomDetails =
                  roomResults.length > 0 ? roomResults[0] : null;

                db.query(
                  roommatesQuery,
                  [student.room_id, std_id],
                  (error, roommates) => {
                    if (error) {
                      console.error("Error fetching roommates:", error);
                      res
                        .status(500)
                        .send("An error occurred while fetching roommates.");
                      return;
                    }
                    console.log("Student:", student);
                    console.log("Room Details:", roomDetails);
                    console.log("Roommates:", roommates);
                    res.render("dashboard", {
                      student,
                      roomDetails,
                      roommates,
                    });
                  },
                );
              });
            } else {
              res.render("dashboard", {
                student,
                roomDetails: null,
                roommates: [],
              });
            }
          } else {
            res.send(`
              <script>
                alert('Incorrect Student ID and/or Password!');
                window.location.href = '/login.html'; 
              </script>
            `);
          }
        } catch (err) {
          console.error("Error verifying password:", err);
          res.status(500).send("An error occurred during login.");
        }
      } else {
        res.send(`
          <script>
            alert('Incorrect Student ID and/or Password!');
            window.location.href = '/login.html'; 
          </script>
        `);
      }
    },
  );
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

app.post("/edit-profile", upload.single("profile_pic"), async (req, res) => {
  if (!req.session.user) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to edit your profile.");
  }

  const {
    std_email,
    std_phone,
    std_faculty,
    std_year,
    std_state,
    std_pref,
    std_password,
  } = req.body;
  let profilePicPath = req.file ? req.file.filename : null;

  let query =
    "UPDATE Student_Details SET std_email = ?, std_phone = ?, std_faculty = ?, std_year = ?, std_state = ?, std_pref = ? ";
  const params = [
    std_email,
    std_phone,
    std_faculty,
    std_year,
    std_state,
    std_pref,
    req.session.user.id,
  ];

  try {
    if (std_password) {
      // Hash the new password before updating it
      const hashedPassword = await bcrypt.hash(std_password, saltRounds);
      query += ", std_password = ? ";
      params.splice(params.length - 1, 0, hashedPassword); // Insert hashed password before std_id
    }

    if (profilePicPath) {
      query += ", profile_pic = ? ";
      params.splice(params.length - 1, 0, profilePicPath); // Insert profilePicPath before std_id
    }

    query += "WHERE std_id = ?";

    db.query(query, params, (error, results) => {
      if (error) {
        console.error("Error updating student details: ", error);
        res
          .status(500)
          .send("An error occurred while updating student details.");
        return;
      }

      res.redirect(`/dashboard`);
    });
  } catch (error) {
    console.error("Error hashing password: ", error);
    res.status(500).send("An error occurred while updating student details.");
  }
});

// New route to handle profile picture upload
app.post("/upload-profile-pic", upload.single("profile_pic"), (req, res) => {
  if (!req.session.user) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to upload a profile picture.");
  }

  const std_id = req.session.user.id;
  const profilePicPath = req.file.filename;

  db.query(
    "UPDATE Student_Details SET profile_pic = ? WHERE std_id = ?",
    [profilePicPath, std_id],
    (error, results) => {
      if (error) {
        console.error("Error updating profile picture:", error);
        res
          .status(500)
          .send("An error occurred while updating profile picture.");
        return;
      }
      res.redirect(`/dashboard`);
    },
  );
});

// Route to display room selection page
app.get("/select-room", (req, res) => {
  if (!req.session.user) {
    return res.send(`
             <script>
               alert('Unauthorized: Please log in to perform this action.');
               window.location.href = '/login.html'; 
             </script>
           `);
  }

  const studentId = req.session.user.id;

  const checkStudentQuery = `
    SELECT std_faculty, std_year, std_state, std_pref, std_gender 
    FROM Student_Details 
    WHERE std_id = ?`;

  db.query(checkStudentQuery, [studentId], (error, studentResults) => {
    if (error) {
      console.error("Error checking student details: " + error.message);
      res.status(500).send("An error occurred while checking student details.");
      return;
    }

    if (studentResults.length > 0) {
      const student = studentResults[0];

      const roomQuery = `
        SELECT room_id, room_no, room_capacity, room_occupancy, room_gender 
        FROM Room_Details 
        WHERE room_capacity > room_occupancy AND room_gender = ?`;

      db.query(roomQuery, [student.std_gender], (error, roomResults) => {
        if (error) {
          console.error("Error fetching rooms: " + error.message);
          res.status(500).send("An error occurred while fetching the rooms.");
          return;
        }

        if (roomResults.length === 0) {
          res.render("select-room", { rooms: [], studentId });
          return;
        }

        // Fetch roommates for all rooms in a single query
        const roomIds = roomResults.map((room) => room.room_id);
        const roommatesQuery = `
          SELECT room_id, std_faculty, std_year, std_state, std_pref 
          FROM Student_Details 
          WHERE room_id IN (?)`;

        db.query(roommatesQuery, [roomIds], (error, roommatesResults) => {
          if (error) {
            console.error("Error fetching roommates: " + error.message);
            res.status(500).send("An error occurred while fetching roommates.");
            return;
          }

          const roommatesByRoom = roommatesResults.reduce((acc, roommate) => {
            if (!acc[roommate.room_id]) {
              acc[roommate.room_id] = [];
            }
            acc[roommate.room_id].push(roommate);
            return acc;
          }, {});

          // Calculate recommendation scores
          const roomsWithScores = roomResults.map((room) => {
            const roommates = roommatesByRoom[room.room_id] || [];
            let score = 0;
            let preferenceMatchCount = 0;
            let facultyMatchCount = 0;
            let yearMatchCount = 0;
            let stateMatchCount = 0;

            roommates.forEach((roommate) => {
              if (student.std_pref === "FLEXIBLE") {
                if (
                  roommate.std_pref === "SOCIAL" ||
                  roommate.std_pref === "QUIET"
                ) {
                  score += 40;
                  preferenceMatchCount++;
                }
              } else if (student.std_pref === "SOCIAL") {
                if (
                  roommate.std_pref === "SOCIAL" ||
                  roommate.std_pref === "FLEXIBLE"
                ) {
                  score += 40;
                  preferenceMatchCount++;
                }
              } else if (student.std_pref === "QUIET") {
                if (
                  roommate.std_pref === "QUIET" ||
                  roommate.std_pref === "FLEXIBLE"
                ) {
                  score += 40;
                  preferenceMatchCount++;
                }
              }

              if (roommate.std_faculty === student.std_faculty) {
                score += 20;
                facultyMatchCount++;
              }
              if (roommate.std_year === student.std_year) {
                score += 10;
                yearMatchCount++;
              }
              if (roommate.std_state === student.std_state) {
                score += 5;
                stateMatchCount++;
              }
            });

            const totalMatches = roommates.length;
            const recommendationPercentage =
              totalMatches > 0 ? (score / (totalMatches * 75)) * 100 : 0;

            return {
              ...room,
              score,
              recommendationPercentage,
              totalMatches,
              preferenceMatchCount,
              facultyMatchCount,
              yearMatchCount,
              stateMatchCount,
            };
          });

          // Sort rooms by recommendation score
          roomsWithScores.sort(
            (a, b) => b.recommendationPercentage - a.recommendationPercentage,
          );

          res.render("select-room", { rooms: roomsWithScores, studentId });
        });
      });
    } else {
      res.send("Student not found.");
    }
  });
});

// Route to view details for a specific room
app.get("/view-room-details/:room_id", (req, res) => {
  if (!req.session.user) {
    return res.send(`
               <script>
                 alert('Unauthorized: Please log in to view room details.');
                 window.location.href = '/login.html'; 
               </script>
             `);
  }

  const { room_id } = req.params;
  const std_id = req.session.user.id;

  const studentQuery = "SELECT * FROM Student_Details WHERE std_id = ?";
  const roomQuery = "SELECT * FROM Room_Details WHERE room_id = ?";
  const studentsQuery = `
        SELECT std_fullname, std_faculty, std_year, std_state, std_pref, std_email, std_phone,
        (CASE
            WHEN std_faculty = ? THEN 20 ELSE 0 END +
         CASE
            WHEN std_year = ? THEN 10 ELSE 0 END +
         CASE
            WHEN std_state = ? THEN 5 ELSE 0 END +
         CASE
            WHEN (? = 'FLEXIBLE' AND (std_pref = 'SOCIAL' OR std_pref = 'QUIET')) OR
                 (? = 'SOCIAL' AND (std_pref = 'SOCIAL' OR std_pref = 'FLEXIBLE')) OR
                 (? = 'QUIET' AND (std_pref = 'QUIET' OR std_pref = 'FLEXIBLE')) OR
                 (? = std_pref) THEN 40 ELSE 0 END
        ) AS matchingPercentage
        FROM Student_Details
        WHERE room_id = ?
    `;

  db.query(studentQuery, [std_id], (err, selectedStudentResults) => {
    if (err || selectedStudentResults.length === 0) {
      res.send("Student not found.");
      return;
    }

    const selectedStudent = selectedStudentResults[0];

    db.query(roomQuery, [room_id], (err, roomDetails) => {
      if (err || roomDetails.length === 0) {
        res.send("Room not found.");
        return;
      }

      db.query(
        studentsQuery,
        [
          selectedStudent.std_faculty,
          selectedStudent.std_year,
          selectedStudent.std_state,
          selectedStudent.std_pref,
          selectedStudent.std_pref,
          selectedStudent.std_pref,
          selectedStudent.std_pref,
          room_id,
        ],
        (err, studentDetails) => {
          if (err) {
            res.send("An error occurred while fetching student details.");
            return;
          }

          res.render("view-room-details", {
            room: roomDetails[0],
            students: studentDetails,
            selectedStudent: selectedStudent,
            showSuccessModal: req.query.success || false,
          });
        },
      );
    });
  });
});

// Route to handle room selection
app.post("/select-room/:room_id", (req, res) => {
  if (!req.session.user) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to select a room.");
  }

  const { room_id } = req.params;
  const std_id = req.session.user.id;

  db.beginTransaction((err) => {
    if (err) {
      console.error("Error starting transaction: ", err);
      res.status(500).send("An error occurred.");
      return;
    }

    const updateRoomQuery = `
      UPDATE Room_Details 
      SET room_occupancy = room_occupancy + 1, 
          bedAvail = bedAvail - 1 
      WHERE room_id = ? AND room_capacity > room_occupancy`;

    db.query(updateRoomQuery, [room_id], (err, result) => {
      if (err) {
        db.rollback(() => {
          console.error("Error updating room details: ", err);
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
      db.query(updateStudentQuery, [room_id, std_id], (err) => {
        if (err) {
          db.rollback(() => {
            console.error("Error updating student details: ", err);
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
          res.redirect(`/view-room-details/${room_id}?success=true`);
        });
      });
    });
  });
});

app.get("/dashboard", (req, res) => {
  if (!req.session.user) {
    return res.send(`
             <script>
               alert('Unauthorized: Please log in to view the dashboard.');
               window.location.href = '/'; 
             </script>
           `);
  }

  const studentId = req.session.user.id;

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
          SELECT std_id, std_gender, std_fullname, std_faculty, std_year, std_state, std_pref, std_email, std_phone
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
  const query = "SELECT * FROM Admin_Details WHERE admin_id = ?";

  db.query(query, [admin_id], async (error, results) => {
    if (error) {
      // Handle any errors that occur during the query
      console.error("Error in admin login query: ", error);
      res.status(500).send("An error occurred during the login process.");
      return;
    }

    console.log("Query Results:", results); // For debugging
    if (results.length > 0) {
      const admin = results[0];

      try {
        const isMatch = await bcrypt.compare(
          admin_password,
          admin.admin_password,
        );
        if (isMatch) {
          // Store admin information in session
          req.session.admin = { id: admin_id, name: admin.admin_name };

          // Redirect to the admin dashboard or render it with session data
          res.render("admin-dashboard", { admin });
        } else {
          // If the password doesn't match, send an error message
          res.send(`
            <script>
              alert('Incorrect username and/or password!');
              window.location.href = '/admin-login.html'; 
            </script>
          `);
        }
      } catch (err) {
        console.error("Error comparing passwords: ", err);
        res.status(500).send("An error occurred during the login process.");
      }
    } else {
      // If the record is not found, send an error message
      res.send(`
        <script>
          alert('Incorrect username and/or password!');
          window.location.href = '/admin-login.html'; // Adjust this path to your login page
        </script>
      `);
    }
  });
});

app.get("/admin/dashboard", (req, res) => {
  if (!req.session.admin) {
    return res.send(`
              <script>
                alert('Unauthorized: Please log in to view the dashboard.');
                window.location.href = '/admin-login.html'; 
              </script>
            `);
  }
  res.render("admin-dashboard", { admin: req.session.admin });
});

const formatDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

//admin-stdeunt-details route
app.get("/admin/students", (req, res) => {
  if (!req.session.admin) {
    return res.send(`
             <script>
               alert('Unauthorized: Please log in to view this page.');
               window.location.href = '/admin-login.html'; 
             </script>
           `);
  }

  const { gender, faculty, year, state, pref, search } = req.query;

  let query = "SELECT * FROM Student_Details WHERE 1=1";
  const queryParams = [];

  if (gender && gender !== "All") {
    query += " AND std_gender = ?";
    queryParams.push(gender);
  }

  if (faculty && faculty !== "All") {
    query += " AND std_faculty = ?";
    queryParams.push(faculty);
  }

  if (year && year !== "All") {
    query += " AND std_year = ?";
    queryParams.push(year);
  }

  if (state && state !== "All") {
    query += " AND std_state = ?";
    queryParams.push(state);
  }

  if (pref && pref !== "All") {
    query += " AND std_pref = ?";
    queryParams.push(pref);
  }

  if (search) {
    query += ` AND (
      LOWER(std_id) LIKE ? OR 
      LOWER(std_fullname) LIKE ? OR 
      LOWER(std_gender) LIKE ? OR 
      LOWER(std_email) LIKE ? OR 
      LOWER(std_phone) LIKE ? OR 
      LOWER(std_faculty) LIKE ? OR 
      LOWER(std_year) LIKE ? OR 
      LOWER(std_state) LIKE ? OR 
      LOWER(std_pref) LIKE ? OR 
      LOWER(reg_date) LIKE ?
    )`;
    const searchQuery = `%${search.toLowerCase()}%`;
    queryParams.push(
      searchQuery,
      searchQuery,
      searchQuery,
      searchQuery,
      searchQuery,
      searchQuery,
      searchQuery,
      searchQuery,
      searchQuery,
      searchQuery,
    );
  }

  db.query(query, queryParams, (error, results) => {
    if (error) {
      console.error("Error fetching student details: ", error);
      res.status(500).send("An error occurred while fetching student details.");
      return;
    }

    results.forEach((student) => {
      student.reg_date = formatDate(student.reg_date);
    });

    res.render("admin-student-details", { students: results });
  });
});

//admin-room-details route
app.get("/admin/rooms", (req, res) => {
  if (!req.session.admin) {
    return res.send(`
              <script>
                alert('Unauthorized: Please log in to view this page.');
                window.location.href = '/admin-login.html'; 
              </script>
            `);
  }

  const { capacity, gender } = req.query;

  let query =
    "SELECT room_id, room_no, room_capacity, room_occupancy, (room_capacity - room_occupancy) AS bedAvail, room_gender FROM Room_Details";
  const queryParams = [];

  if (capacity && capacity !== "All") {
    query += " WHERE room_capacity = ?";
    queryParams.push(capacity);
  }

  if (gender && gender !== "All") {
    if (queryParams.length > 0) {
      query += " AND";
    } else {
      query += " WHERE";
    }
    query += " room_gender = ?";
    queryParams.push(gender);
  }

  db.query(query, queryParams, (error, results) => {
    if (error) {
      console.error("Error fetching room details: ", error);
      res.status(500).send("An error occurred while fetching room details.");
      return;
    }

    res.render("admin-room-details", { rooms: results });
  });
});

app.post("/admin/students/register", async (req, res) => {
  if (!req.session.admin) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to perform this action.");
  }

  const { std_id, std_fullName, std_gender, std_password } = req.body;

  // Creating a new Date object
  const now = new Date();
  // Formatting date and time: YYYY-MM-DD HH:MM:SS
  const reg_date = now.toISOString().slice(0, 19).replace("T", " ");

  try {
    // Check if std_id already exists
    const checkQuery = "SELECT std_id FROM Student_Details WHERE std_id = ?";
    db.query(checkQuery, [std_id], async (checkError, checkResults) => {
      if (checkError) {
        console.error("Error checking student ID: ", checkError);
        return res
          .status(500)
          .send("An error occurred while checking the student ID.");
      }

      if (checkResults.length > 0) {
        // Student ID already exists
        return res.send(
          `
              <script>
                alert('A student with this ID already exists. Please use a different ID.');
                window.location.href = '/admin/students'; 
              </script>
            `,
        );
      }

      // Hash the password before storing it
      const hashedPassword = await bcrypt.hash(std_password, saltRounds);

      // SQL query to insert a new student record
      const insertQuery =
        "INSERT INTO Student_Details (std_id, std_fullName, std_gender, std_password, reg_date) VALUES (?, ?, ?, ?, ?)";

      db.query(
        insertQuery,
        [std_id, std_fullName, std_gender, hashedPassword, reg_date],
        (insertError, insertResults) => {
          if (insertError) {
            // Handle any errors that occur during the query
            console.error("Error registering new student: ", insertError);
            return res
              .status(500)
              .send("An error occurred while registering the student.");
          }

          // After registration, redirect back to the student details page or send a success message
          res.redirect("/admin/students");
        },
      );
    });
  } catch (error) {
    // Handle any errors that occur during hashing
    console.error("Error hashing password: ", error);
    res.status(500).send("An error occurred while registering the student.");
  }
});

app.get("/admin/room/view/:room_id", async (req, res) => {
  if (!req.session.admin) {
    return res.send(`
              <script>
                alert('Unauthorized: Please log in to view this page.');
                window.location.href = '/admin-login.html'; 
              </script>
            `);
  }

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
  if (!req.session.admin) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to perform this action.");
  }

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

    // Decrement room occupancy and increment bed availability
    const updateRoomQuery = `
      UPDATE Room_Details 
      SET room_occupancy = room_occupancy - 1, 
          bedAvail = bedAvail + 1 
      WHERE room_id = ?`;
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
  if (!req.session.admin) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to perform this action.");
  }

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

    // Redirect back to the room details page
    res.redirect("/admin/rooms");
  } catch (error) {
    console.error("Error adding new room: ", error);
    res.status(500).send("An error occurred while adding the room.");
  }
});

app.get("/admin/rooms/check-students/:room_id", async (req, res) => {
  if (!req.session.admin) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to perform this action.");
  }

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
  if (!req.session.admin) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to perform this action.");
  }

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

// Route to analyze data with api
app.post("/api/analyze-data", async (req, res) => {
  if (!req.session.admin) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to perform this action.");
  }

  const { stage, data } = req.body;

  let prompt;
  if (stage === "descriptive") {
    prompt = `Perform a detailed descriptive analysis on the following data. Provide clear and specific insights based on patterns and anomalies found in the data:\n\n${JSON.stringify(data, null, 2)}`;
  } else if (stage === "predictive_prescriptive") {
    prompt = `Based on the following descriptive analysis and original data, perform predictive and prescriptive analysis. Predict specific trends and provide actionable recommendations to optimize operations and resource allocation. Make sure to avoid generic statements and focus on practical, data-driven suggestions:\n\nDescriptive Analysis:\n${JSON.stringify(data.descriptiveAnalysis, null, 2)}\n\nOriginal Data:\n${JSON.stringify(data.originalData, null, 2)}`;
  } else {
    res.status(400).json({ error: "Invalid analysis stage" });
    return;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are an AI that analyzes data and generates reports with detailed descriptive, predictive, and prescriptive insights.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 3000,
      }),
    });

    const result = await response.json();

    if (result.choices && result.choices.length > 0) {
      res.json({ message: result.choices[0].message.content });
    } else {
      console.error("Unexpected API response:", result);
      res.status(500).json({ error: "Unexpected API response" });
    }
  } catch (error) {
    console.error("Error calling OpenAI API:", error);
    res.status(500).json({ error: "Error calling OpenAI API" });
  }
});

// Fetch summary data from the database
app.get("/admin/summary-data", (req, res) => {
  if (!req.session.admin) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to view this data.");
  }

  const queries = {
    totalStudents: "SELECT COUNT(*) as count FROM Student_Details",
    availableBeds: "SELECT SUM(bedAvail) as count FROM Room_Details",
    totalRooms: "SELECT COUNT(*) as count FROM Room_Details",
    totalBedsMale:
      "SELECT SUM(room_capacity) as count FROM Room_Details WHERE room_gender = 'Male'",
    totalBedsFemale:
      "SELECT SUM(room_capacity) as count FROM Room_Details WHERE room_gender = 'Female'",
    totalBeds: "SELECT SUM(room_capacity) as count FROM Room_Details",
    studentsWithoutRoom:
      "SELECT COUNT(*) as count FROM Student_Details WHERE room_id IS NULL",
  };

  db.query(queries.totalStudents, (error, totalStudentsResults) => {
    if (error) {
      console.error("Error fetching total students:", error);
      res.status(500).send("An error occurred while fetching total students.");
      return;
    }

    db.query(queries.availableBeds, (error, availableBedsResults) => {
      if (error) {
        console.error("Error fetching available beds:", error);
        res
          .status(500)
          .send("An error occurred while fetching available beds.");
        return;
      }

      db.query(queries.totalRooms, (error, totalRoomsResults) => {
        if (error) {
          console.error("Error fetching total rooms:", error);
          res.status(500).send("An error occurred while fetching total rooms.");
          return;
        }

        db.query(queries.totalBedsMale, (error, totalBedsMaleResults) => {
          if (error) {
            console.error("Error fetching total beds for males:", error);
            res
              .status(500)
              .send("An error occurred while fetching total beds for males.");
            return;
          }

          db.query(queries.totalBedsFemale, (error, totalBedsFemaleResults) => {
            if (error) {
              console.error("Error fetching total beds for females:", error);
              res
                .status(500)
                .send(
                  "An error occurred while fetching total beds for females.",
                );
              return;
            }

            db.query(queries.totalBeds, (error, totalBedsResults) => {
              if (error) {
                console.error("Error fetching total beds:", error);
                res
                  .status(500)
                  .send("An error occurred while fetching total beds.");
                return;
              }

              db.query(
                queries.studentsWithoutRoom,
                (error, studentsWithoutRoomResults) => {
                  if (error) {
                    console.error(
                      "Error fetching students without room:",
                      error,
                    );
                    res
                      .status(500)
                      .send(
                        "An error occurred while fetching students without room.",
                      );
                    return;
                  }

                  res.json({
                    totalStudents: totalStudentsResults[0].count,
                    availableBeds: availableBedsResults[0].count,
                    totalRooms: totalRoomsResults[0].count,
                    totalBedsMale: totalBedsMaleResults[0].count,
                    totalBedsFemale: totalBedsFemaleResults[0].count,
                    totalBeds: totalBedsResults[0].count,
                    studentsWithoutRoom: studentsWithoutRoomResults[0].count,
                  });
                },
              );
            });
          });
        });
      });
    });
  });
});

// Fetch gender distribution data from the database
app.get("/admin/gender-distribution", (req, res) => {
  if (!req.session.admin) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to view this data.");
  }

  const query =
    "SELECT std_gender, COUNT(*) as count FROM Student_Details GROUP BY std_gender";
  db.query(query, (error, results) => {
    if (error) {
      console.error("Error fetching gender distribution data:", error);
      res
        .status(500)
        .send("An error occurred while fetching gender distribution data.");
      return;
    }
    res.json(results);
  });
});

// Fetch students by faculty data from the database****
app.get("/admin/students-by-faculty", (req, res) => {
  if (!req.session.admin) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to view this data.");
  }

  const query =
    "SELECT std_faculty, COUNT(*) as count FROM Student_Details GROUP BY std_faculty";
  db.query(query, (error, results) => {
    if (error) {
      console.error("Error fetching students by faculty data:", error);
      res
        .status(500)
        .send("An error occurred while fetching students by faculty data.");
      return;
    }
    res.json(results);
  });
});

// Fetch room environment preference data from the database
app.get("/admin/room-environment-preference", (req, res) => {
  if (!req.session.admin) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to view this data.");
  }
  const query =
    "SELECT std_pref, COUNT(*) as count FROM Student_Details WHERE std_pref IS NOT NULL GROUP BY std_pref";
  db.query(query, (error, results) => {
    if (error) {
      console.error("Error fetching room environment preference data:", error);
      res
        .status(500)
        .send(
          "An error occurred while fetching room environment preference data.",
        );
      return;
    }
    res.json(results);
  });
});

// Fetch student registration over time data from the database
app.get("/admin/student-registration-over-time", (req, res) => {
  if (!req.session.admin) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to view this data.");
  }

  let { year } = req.query;
  let query = `
    SELECT DATE_FORMAT(reg_date, '%Y-%m') as date, std_gender, COUNT(*) as count 
    FROM Student_Details
  `;
  let conditions = [];

  if (year && year !== "all") {
    conditions.push(`YEAR(reg_date) = ${year}`);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " GROUP BY DATE_FORMAT(reg_date, '%Y-%m'), std_gender";

  db.query(query, (error, results) => {
    if (error) {
      console.error(
        "Error fetching student registration over time data:",
        error,
      );
      res
        .status(500)
        .send(
          "An error occurred while fetching student registration over time data.",
        );
      return;
    }
    res.json(results);
  });
});

// Fetch year of degree data from the database
app.get("/admin/year-of-degree", (req, res) => {
  if (!req.session.admin) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to view this data.");
  }
  const query = `
    SELECT 
      std_year, 
      COUNT(*) as count 
    FROM 
      Student_Details 
    WHERE 
      std_year IS NOT NULL
    GROUP BY 
      std_year;
  `;
  db.query(query, (error, results) => {
    if (error) {
      console.error("Error fetching year of degree data:", error);
      res
        .status(500)
        .send("An error occurred while fetching year of degree data.");
      return;
    }
    res.json(results);
  });
});

// Fetch room type distribution data from the database
app.get("/admin/room-type-distribution", (req, res) => {
  if (!req.session.admin) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to view this data.");
  }
  const query = `
    SELECT room_capacity, room_gender, COUNT(*) as count 
    FROM Room_Details 
    GROUP BY room_capacity, room_gender
  `;
  db.query(query, (error, results) => {
    if (error) {
      console.error("Error fetching room type distribution data:", error);
      res
        .status(500)
        .send("An error occurred while fetching room type distribution data.");
      return;
    }
    res.json(results);
  });
});

// Fetch room occupancy data from the database
app.get("/admin/room-occupancy", (req, res) => {
  if (!req.session.admin) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to view this data.");
  }
  const query = `
    SELECT room_gender, room_capacity, SUM(room_capacity) as total_capacity, 
           SUM(room_occupancy) as total_occupancy, 
           SUM(room_capacity - room_occupancy) as bed_avail
    FROM Room_Details 
    GROUP BY room_capacity, room_gender
  `;
  db.query(query, (error, results) => {
    if (error) {
      console.error("Error fetching room occupancy data:", error);
      res
        .status(500)
        .send("An error occurred while fetching room occupancy data.");
      return;
    }
    res.json(results);
  });
});

// Serve static files
app.use(express.static("public"));

// Fetch state of residence data from the database
app.get("/admin/state-of-residence", (req, res) => {
  if (!req.session.admin) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to view this data.");
  }
  const query = `
    SELECT std_state, COUNT(*) as count 
    FROM Student_Details 
    WHERE std_state IN ('JOHOR', 'KEDAH', 'KELANTAN', 'MELAKA', 'NEGERI SEMBILAN', 'PAHANG', 'PULAU PINANG', 'PERAK', 'PERLIS', 'SABAH', 'SARAWAK', 'SELANGOR', 'TERENGGANU', 'KUALA LUMPUR', 'LABUAN', 'PUTRAJAYA')
    GROUP BY std_state
  `;
  db.query(query, (error, results) => {
    if (error) {
      console.error("Error fetching state of residence data:", error);
      res
        .status(500)
        .send("An error occurred while fetching state of residence data.");
      return;
    }
    res.json(results);
  });
});

// Route to handle room update
app.post("/admin/rooms/edit", (req, res) => {
  if (!req.session.admin) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to view this data.");
  }
  const { room_id, room_no, room_capacity, room_gender } = req.body;

  const checkOccupancyQuery =
    "SELECT room_occupancy FROM Room_Details WHERE room_id = ?";

  db.query(checkOccupancyQuery, [room_id], (error, results) => {
    if (error) {
      console.error("Error checking room occupancy: ", error);
      res.status(500).send("An error occurred while checking room occupancy.");
      return;
    }

    if (results.length > 0 && results[0].room_occupancy > 0) {
      res.status(400).json({
        error:
          "Cannot edit room details as there are students assigned to this room.",
      });
      return;
    }

    const updateRoomQuery = `
      UPDATE Room_Details 
      SET room_no = ?, room_capacity = ?, room_gender = ?, room_occupancy = ?, bedAvail = ?
      WHERE room_id = ?
    `;

    const newBedAvail = room_capacity - results[0].room_occupancy;

    db.query(
      updateRoomQuery,
      [
        room_no,
        room_capacity,
        room_gender,
        results[0].room_occupancy,
        newBedAvail,
        room_id,
      ],
      (error, result) => {
        if (error) {
          console.error("Error updating room details: ", error);
          res
            .status(500)
            .send("An error occurred while updating room details.");
          return;
        }

        res.redirect("/admin/rooms");
      },
    );
  });
});

app.post("/admin/students/edit", async (req, res) => {
  if (!req.session.admin) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to view this data.");
  }
  const { original_std_id, std_fullname, std_password } = req.body;

  console.log(req.body); // Debug: log the received form data

  let updateQuery;
  let queryParams;

  try {
    if (std_password) {
      // Hash the new password before updating it
      const hashedPassword = await bcrypt.hash(std_password, saltRounds);
      updateQuery = `
        UPDATE Student_Details 
        SET std_fullname = ?, std_password = ?
        WHERE std_id = ?
      `;
      queryParams = [std_fullname, hashedPassword, original_std_id];
    } else {
      updateQuery = `
        UPDATE Student_Details 
        SET std_fullname = ?
        WHERE std_id = ?
      `;
      queryParams = [std_fullname, original_std_id];
    }

    db.query(updateQuery, queryParams, (error, result) => {
      if (error) {
        console.error("Error updating student details: ", error);
        res
          .status(500)
          .send("An error occurred while updating student details.");
        return;
      }

      res.redirect("/admin/students");
    });
  } catch (error) {
    console.error("Error hashing password: ", error);
    res.status(500).send("An error occurred while updating student details.");
  }
});

app.post("/admin/students/delete", async (req, res) => {
  if (!req.session.admin) {
    return res
      .status(401)
      .send("Unauthorized: Please log in to view this data.");
  }
  const { std_id } = req.body;

  try {
    await db.promise().beginTransaction();

    // Get the room ID of the student to be deleted
    const [studentRoom] = await db
      .promise()
      .query("SELECT room_id FROM Student_Details WHERE std_id = ?", [std_id]);

    if (studentRoom.length > 0 && studentRoom[0].room_id) {
      const room_id = studentRoom[0].room_id;

      // Unassign the student from the room
      const unassignQuery =
        "UPDATE Student_Details SET room_id = NULL WHERE std_id = ?";
      await db.promise().query(unassignQuery, [std_id]);

      // Update the room occupancy and bed availability
      const updateRoomQuery = `
        UPDATE Room_Details 
        SET room_occupancy = room_occupancy - 1, 
            bedAvail = bedAvail + 1 
        WHERE room_id = ?`;
      await db.promise().query(updateRoomQuery, [room_id]);
    }

    // Delete the student record
    const deleteQuery = "DELETE FROM Student_Details WHERE std_id = ?";
    await db.promise().query(deleteQuery, [std_id]);

    await db.promise().commit();

    res.redirect("/admin/students");
  } catch (error) {
    await db.promise().rollback();
    console.error("Error deleting student: ", error);
    res.status(500).send("An error occurred while deleting the student.");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error logging out:", err);
      return res.status(500).send("Error logging out");
    }
    console.log("Session destroyed, redirecting to login page.");
    res.redirect("/admin-login.html");
  });
});
