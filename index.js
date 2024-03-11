// index.js
import express from "express";
import studentLoginRouter from "./routes/studentLogin.js";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

// ES6 modules fix for __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'views' directory
app.use(express.static(path.join(__dirname, "views")));

// Serve the student-login.html when the root route '/' is accessed
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "student-login.html"));
});

// Use the studentLoginRouter for the '/auth' path
app.use("/auth", studentLoginRouter);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
