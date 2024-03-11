import express from "express";
import mysql from "mysql";
import dotenv from "dotenv";

dotenv.config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 3001;

// Configure database connection
const dbConnection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

let dbConnected = false; // Better to manage connection state locally or with more sophisticated state management

// Attempt to connect to the database
dbConnection.connect((error) => {
  dbConnected = !error;
  if (error) {
    console.error("Error connecting to the database:", error);
  } else {
    console.log("Successfully connected to the database.");
  }
});

// Serve an HTML page with database connection status
app.get("/", (req, res) => {
  const htmlResponse = dbConnected
    ? "<h1>Database Connection Successful</h1>"
    : "<h1>Database Connection Failed</h1>";
  res.send(htmlResponse);
});

app.listen(port, () => {
  console.log(`Express server initialized on port ${port}`);
});
