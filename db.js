import express from "express";
import mysql from "mysql";
import dotenv from "dotenv";
dotenv.config(); // Load environment variables from .env file

console.log(process.env.MY_SECRET); // Logs the value of MY_SECRET to the console

const app = express();
const port = process.env.PORT || 3000;

// Configure database connection
const dbConnection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

// Attempt to connect to the database
dbConnection.connect((error) => {
  global.dbConnected = !error;
  if (error) {
    console.error("Error connecting to the database:", error);
  } else {
    console.log("Successfully connected to the database.");
  }
});

// Serve an HTML page with database connection status
app.get("/", (req, res) => {
  const htmlResponse = global.dbConnected
    ? "<h1>Database Connection Successful</h1>"
    : "<h1>Database Connection Failed</h1>";
  res.send(htmlResponse);
});

app.listen(port, () => {
  console.log(`Express server initialized on port ${port}`);
});
