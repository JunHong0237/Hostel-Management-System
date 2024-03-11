import express from "express";

const app = express();
const port = process.env.PORT || 3000; // Use the PORT environment variable provided by Render

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Express server initialized on port ${port}`);
});
