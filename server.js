require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const http = require("http");
const app = express();
const server = http.createServer(app);
const { swaggerUi, swaggerSpec } = require("./swagger");
const branchRoutes = require("./routes/branchRoutes");
const adminRoutes = require("./routes/adminRoutes");
const clientRoutes = require("./routes/clientRoutes");
const debtorsRoutes = require("./routes/debtorsRoutes");
const orderRoutes = require("./routes/orderRoutes");
const producRoutes = require("./routes/productRoutes");
const batchRoutes = require("./routes/batchRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const serviceListRoutes = require("./routes/serviceListRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const transactionRoutes = require("./routes/transactionRoutes");

// Middleware
app.use(express.json());
app.use(cors());
// Statik rasm va fayllar uchun
app.use("/uploads", express.static(__dirname + "/public/uploads"));

// Connect to MongoDB
connectDB();

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use("/api/branches", branchRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/debtors", debtorsRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/products", producRoutes);
app.use("/api/batches", batchRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/servicelist", serviceListRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/transactions", transactionRoutes);


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

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: "Internal Server Error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
    timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
  });
});

// Server startup
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server ${PORT}-portda ishlayapti`);
  console.log(
    `Server started at: ${new Date(
      new Date().setHours(new Date().getHours() + 5)
    )
      .toISOString()
      .slice(0, 19)
      .replace("T", " ")}`
  );
});
