require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const http = require("http");
const workerRoutes = require("./routes/workerRoutes");
const adminRoutes = require("./routes/adminRoutes");
const productRoutes = require("./routes/productRoutes");
const ingredientRoutes = require("./routes/ingredientRoutes");
const balanceRoutes = require("./routes/balanceRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const branchRoutes = require("./routes/branchRoutes");

const app = express();
const server = http.createServer(app);

// Middleware
app.use(express.json());
app.use(cors());

// Connect to MongoDB
connectDB();

app.use("/api/worker", workerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ingredients", ingredientRoutes);
app.use("/api/products", productRoutes);
app.use("/api/dashboard", balanceRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/branches", branchRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: "Internal Server Error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
    timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
  });
});

// Handle 404 errors
app.use((req, res) => {
  req.path === "/privacy"
    ? res.sendFile(__dirname + "/public/privacy.html")
    : req.path === "/terms"
    ? res.sendFile(__dirname + "/public/terms.html")
    : req.path === "/help"
    ? res.sendFile(__dirname + "/public/help.html")
    : res.status(404).sendFile(__dirname + "/public/404.html");
});

// Server startup
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server ${PORT}-portda ishlayapti`);
  console.log(
    `Server started at: ${new Date()
      .toISOString()
      .slice(0, 19)
      .replace("T", " ")}`
  );
});
