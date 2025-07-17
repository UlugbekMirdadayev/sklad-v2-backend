const express = require("express");
const router = express.Router();
const Product = require("../models/products/product.model");
const authMiddleware = require("../middleware/authMiddleware");
const { body, validationResult } = require("express-validator");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

/** Multer config for file upload */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, "../public/uploads/products");
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

/** Product validation rules */
const productValidation = [
  body("name").trim().notEmpty().withMessage("Product name is required"),
  body("costPrice").isNumeric().withMessage("Cost price must be a number"),
  body("salePrice").isNumeric().withMessage("Sale price must be a number"),
  body("quantity")
    .isInt({ min: 0 })
    .withMessage("Quantity must be a non-negative integer"),
  body("minQuantity")
    .isInt({ min: 0 })
    .withMessage("Minimal quantity must be a non-negative integer"),
  body("oilKm").optional().isNumeric().withMessage("OilKm must be a number"),
  // Новые поля:
  body("clients")
    .optional()
    .isArray()
    .withMessage("Clients must be an array of IDs"),
  body("clients.*")
    .optional()
    .isMongoId()
    .withMessage("Each client must be a valid Mongo ID"),
  body("cars").optional().isArray().withMessage("Cars must be an array of IDs"),
  body("cars.*")
    .optional()
    .isMongoId()
    .withMessage("Each car must be a valid Mongo ID"),
  body("dailyKm")
    .optional()
    .isNumeric()
    .withMessage("dailyKm must be a number"),
  body("monthlyKm")
    .optional()
    .isNumeric()
    .withMessage("monthlyKm must be a number"),
  body("unit").notEmpty().withMessage("Unit is required"),
  body("currency")
    .isIn(["UZS", "USD"])
    .withMessage("Currency must be UZS or USD"),
  body("createdBy").isMongoId().withMessage("Invalid creator ID"),
  body("branch").isMongoId().withMessage("Invalid branch ID"),
  body("discount")
    .optional()
    .custom((value) => {
      if (typeof value === "string") value = JSON.parse(value);
      if (typeof value !== "object")
        throw new Error("Discount must be an object");
      if (value.price !== undefined && typeof value.price !== "number")
        throw new Error("Discount price must be a number");
      if (value.children && !Array.isArray(value.children))
        throw new Error("Discount children must be an array");
      if (value.children) {
        value.children.forEach((child) => {
          if (
            typeof child.quantity !== "number" ||
            typeof child.value !== "number"
          ) {
            throw new Error(
              "Discount children must have numeric quantity and value"
            );
          }
        });
      }
      return true;
    }),
  body("description")
    .optional()
    .isString()
    .withMessage("Description must be a string"),
  body("vipPrice")
    .optional()
    .isNumeric()
    .withMessage("vipPrice must be a number"),
];

/** Create product with images */
router.post(
  "/",
  authMiddleware,
  upload.array("images", 10),
  productValidation,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      if (req.files) {
        await Promise.all(req.files.map((f) => fs.promises.unlink(f.path)));
      }
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      let images = [];
      if (req.files && req.files.length > 0) {
        images = req.files.map((file) => "/uploads/products/" + file.filename);
      } else if (Array.isArray(req.body.images)) {
        images = req.body.images;
      }

      if (typeof req.body.discount === "string") {
        req.body.discount = JSON.parse(req.body.discount);
      }

      const product = new Product({ ...req.body, images });
      await product.save();
      const populatedProduct = await Product.findById(product._id)
        .populate("createdBy", "-password")
        .populate("branch")
        .populate("batch_number");
      res.status(201).json(populatedProduct);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

/** Get all products */
router.get("/", async (req, res) => {
  try {
    const {
      name,
      createdBy,
      minCostPrice,
      maxCostPrice,
      minSalePrice,
      maxSalePrice,
      search,
      batch_number,
    } = req.query;

    const query = { isDeleted: false };
    if (name) query.name = { $regex: name, $options: "i" };
    if (createdBy) query.createdBy = createdBy;
    if (batch_number) query.batch_number = batch_number;
    if (minCostPrice || maxCostPrice) {
      query.costPrice = {};
      if (minCostPrice) query.costPrice.$gte = Number(minCostPrice);
      if (maxCostPrice) query.costPrice.$lte = Number(maxCostPrice);
    }
    if (minSalePrice || maxSalePrice) {
      query.salePrice = {};
      if (minSalePrice) query.salePrice.$gte = Number(minSalePrice);
      if (maxSalePrice) query.salePrice.$lte = Number(maxSalePrice);
    }
    if (search) query.name = { $regex: search, $options: "i" };

    const products = await Product.find(query)
      .populate("createdBy", "-password")
      .populate("branch")
      .populate("batch_number")
      .sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Get product by ID */
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      isDeleted: false,
    })
      .populate("createdBy", "-password")
      .populate("branch")
      .populate("batch_number");
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Update product by ID */
router.patch(
  "/:id",
  authMiddleware,
  upload.array("images", 10),
  productValidation,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      if (req.files) {
        await Promise.all(req.files.map((f) => fs.promises.unlink(f.path)));
      }
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const product = await Product.findOne({
        _id: req.params.id,
        isDeleted: false,
      });
      if (!product)
        return res.status(404).json({ message: "Product not found" });

      let images = product.images || [];
      if (req.files && req.files.length > 0) {
        images = req.files.map((file) => "/uploads/products/" + file.filename);
      } else if (Array.isArray(req.body.images)) {
        images = req.body.images;
      }

      if (typeof req.body.discount === "string") {
        req.body.discount = JSON.parse(req.body.discount);
      }

      Object.assign(product, req.body, { images });
      await product.save();
      const populatedProduct = await Product.findById(product._id)
        .populate("createdBy", "-password")
        .populate("branch")
        .populate("batch_number");
      res.json(populatedProduct);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

/** Soft delete product by ID */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      isDeleted: false,
    });
    if (!product) return res.status(404).json({ message: "Product not found" });
    product.isDeleted = true;
    product.deletedAt = new Date();
    await product.save();
    res.json({ message: "Product soft deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Quick search products by name */
router.get("/search/:query", async (req, res) => {
  try {
    const { query } = req.params;
    const products = await Product.find({
      name: { $regex: query, $options: "i" },
      isDeleted: false,
    })
      .populate("createdBy", "-password")
      .populate("branch")
      .populate("batch_number")
      .limit(10);
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
