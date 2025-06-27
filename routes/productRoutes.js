const express = require("express");
const router = express.Router();
const Product = require("../models/products/product.model");
const authMiddleware = require("../middleware/authMiddleware");
const { body, validationResult } = require("express-validator");

/**
 * @swagger
 * tags:
 *   name: Product
 *   description: Продукты
 */

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Создать продукт
 *     tags: [Product]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Product'
 *     responses:
 *       201:
 *         description: Продукт создан
 *       400:
 *         description: Ошибка валидации
 */

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Получить список продуктов
 *     tags: [Product]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Поиск по имени
 *     responses:
 *       200:
 *         description: Список продуктов
 */

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Получить продукт по ID
 *     tags: [Product]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID продукта
 *     responses:
 *       200:
 *         description: Продукт найден
 *       404:
 *         description: Продукт не найден
 *   patch:
 *     summary: Обновить продукт по ID
 *     tags: [Product]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID продукта
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Product'
 *     responses:
 *       200:
 *         description: Продукт обновлен
 *       404:
 *         description: Продукт не найден
 *   delete:
 *     summary: Удалить продукт по ID (soft delete)
 *     tags: [Product]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID продукта
 *     responses:
 *       200:
 *         description: Продукт удален
 *       404:
 *         description: Продукт не найден
 */

// Validation rules for creating/updating a product
const productValidation = [
  body("name").trim().notEmpty().withMessage("Product name is required"),
  body("costPrice").isNumeric().withMessage("Cost price must be a number"),
  body("salePrice").isNumeric().withMessage("Sale price must be a number"),
  body("quantity")
    .isInt({ min: 0 })
    .withMessage("Quantity must be a non-negative integer"),
  body("createdBy").isMongoId().withMessage("Invalid creator ID"),
  body("batch_number").isString().withMessage("Invalid batch_number ID"),
  body("discount")
    .optional()
    .custom((value) => {
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
];

// Create a new product
router.post("/", authMiddleware, productValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const product = new Product(req.body);
    await product.save();
    const populatedProduct = await Product.findById(product._id).populate(
      "createdBy",
      "-password"
    );
    res.status(201).json(populatedProduct);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all products (with optional filters)
router.get("/", authMiddleware, async (req, res) => {
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

    // Фильтрация по себестоимости
    if (minCostPrice || maxCostPrice) {
      query.costPrice = {};
      if (minCostPrice) query.costPrice.$gte = Number(minCostPrice);
      if (maxCostPrice) query.costPrice.$lte = Number(maxCostPrice);
    }

    // Фильтрация по цене продажи
    if (minSalePrice || maxSalePrice) {
      query.salePrice = {};
      if (minSalePrice) query.salePrice.$gte = Number(minSalePrice);
      if (maxSalePrice) query.salePrice.$lte = Number(maxSalePrice);
    }
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }
    const products = await Product.find(query)
      .populate("createdBy", "-password")
      .sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get a product by ID
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      isDeleted: false,
    }).populate("createdBy", "-password");
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update a product by ID
router.patch("/:id", authMiddleware, productValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      isDeleted: false,
    });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    Object.assign(product, req.body);
    await product.save();
    const populatedProduct = await Product.findById(product._id).populate(
      "createdBy",
      "-password"
    );
    res.json(populatedProduct);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete a product by ID (soft delete)
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      isDeleted: false,
    });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    product.isDeleted = true;
    product.deletedAt = new Date();
    await product.save();
    res.json({ message: "Product soft deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/products/search/{query}:
 *   get:
 *     summary: Быстрый поиск продуктов по имени
 *     tags: [Product]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Поисковый запрос
 *     responses:
 *       200:
 *         description: Список продуктов
 */

// Search products by name (quick search)
router.get("/search/:query", async (req, res) => {
  try {
    const { query } = req.params;
    const products = await Product.find({
      name: { $regex: query, $options: "i" },
      isDeleted: false,
    })
      .populate("createdBy", "-password")
      .limit(10);
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
