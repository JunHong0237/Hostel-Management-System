// db.js
import mysql from "mysql";
import dotenv from "dotenv";

dotenv.config(); // Load environment variables from .env file

// Configure database connection
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
    process.exit(1); // Stop the process if the database connection fails
  } else {
    console.log("Successfully connected to the database.");
  }
});

export default dbConnection;
