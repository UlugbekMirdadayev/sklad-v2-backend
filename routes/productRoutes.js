const express = require("express");
const router = express.Router();
const Product = require("../models/products/product.model");
const authMiddleware = require("../middleware/authMiddleware");
const { body, validationResult } = require("express-validator");
const multer = require("multer");
const {
  uploadPhotoToTelegram,
  getFileUrlFromTelegram,
} = require("../config/tg");

/** Multer config for memory storage (для загрузки в Telegram) */
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB лимит (Telegram поддерживает до 20MB для фото)
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

/** Product validation rules */
const productValidation = [
  body("name").trim().notEmpty().withMessage("Product name is required"),
  body("costPrice").isNumeric().withMessage("Cost price must be a number"),
  body("salePrice").isNumeric().withMessage("Sale price must be a number"),
  body("quantity")
    .isNumeric({ min: 0 })
    .withMessage("Quantity must be a non-negative number"),
  body("minQuantity")
    .isNumeric({ min: 0 })
    .withMessage("Minimal quantity must be a non-negative number"),
  body("unit").notEmpty().withMessage("Unit is required"),
  body("currency")
    .isIn(["UZS", "USD"])
    .withMessage("Currency must be UZS or USD"),
  body("createdBy").isMongoId().withMessage("Invalid creator ID"),
  body("branch").isMongoId().withMessage("Invalid branch ID"),
  body("images").optional().isArray().withMessage("Images must be an array"),
  body("images.*")
    .optional()
    .custom((value) => {
      if (typeof value !== "string") {
        throw new Error("Each image must be a string (Telegram file_id)");
      }
      return true;
    }),
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
  body("isAvailable")
    .optional()
    .isBoolean()
    .withMessage("isAvailable must be a boolean"),
];

/** Create product with images uploaded to Telegram */
router.post(
  "/",
  authMiddleware,
  upload.array("images", 10),
  productValidation,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      let images = [];

      // Загружаем файлы в Telegram и получаем file_id
      if (req.files && req.files.length > 0) {
        const uploadPromises = req.files.map(async (file) => {
          const caption = `Product: ${req.body.name || "Unknown"}`;
          return await uploadPhotoToTelegram(file.buffer, caption);
        });
        images = await Promise.all(uploadPromises);
      } else if (Array.isArray(req.body.images)) {
        // Если передаются уже существующие file_id
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
      console.error("Error creating product:", error);
      res.status(500).json({
        message: error.message,
        error: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
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
      isAvailable,
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
    if (isAvailable !== undefined) {
      query.isAvailable = isAvailable === "true";
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

      // Загружаем новые файлы в Telegram, если есть
      if (req.files && req.files.length > 0) {
        const uploadPromises = req.files.map(async (file) => {
          const caption = `Product Update: ${req.body.name || product.name}`;
          return await uploadPhotoToTelegram(file.buffer, caption);
        });
        const newImages = await Promise.all(uploadPromises);
        images = [...images, ...newImages]; // Добавляем к существующим
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
      console.error("Error updating product:", error);
      res.status(500).json({
        message: error.message,
        error: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
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
    const { isAvailable } = req.query;

    const searchQuery = {
      name: { $regex: query, $options: "i" },
      isDeleted: false,
    };

    if (isAvailable !== undefined) {
      searchQuery.isAvailable = isAvailable === "true";
    }

    const products = await Product.find(searchQuery)
      .populate("createdBy", "-password")
      .populate("branch")
      .populate("batch_number")
      .limit(10);
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Get image from Telegram by file_id */
router.get("/image/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    const imageUrl = await getFileUrlFromTelegram(fileId);

    // Можем либо вернуть URL, либо проксировать изображение
    if (req.query.proxy === "true") {
      // Проксируем изображение через наш сервер
      const axios = require("axios");
      const response = await axios.get(imageUrl, { responseType: "stream" });

      res.setHeader(
        "Content-Type",
        response.headers["content-type"] || "image/jpeg"
      );
      res.setHeader("Cache-Control", "public, max-age=86400"); // Кешируем на день

      response.data.pipe(res);
    } else {
      // Просто возвращаем URL
      res.json({ imageUrl });
    }
  } catch (error) {
    console.error("Error getting image from Telegram:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

/**
 * @swagger
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       required:
 *         - name
 *         - costPrice
 *         - salePrice
 *         - quantity
 *         - minQuantity
 *         - unit
 *         - currency
 *         - createdBy
 *         - branch
 *       properties:
 *         _id:
 *           type: string
 *           description: Unique identifier for the product
 *         name:
 *           type: string
 *           description: Product name
 *         costPrice:
 *           type: number
 *           description: Cost price of the product
 *         salePrice:
 *           type: number
 *           description: Sale price of the product
 *         quantity:
 *           type: number
 *           minimum: 0
 *           description: Current quantity in stock
 *         minQuantity:
 *           type: number
 *           minimum: 0
 *           description: Minimum quantity threshold
 *         images:
 *           type: array
 *           items:
 *             type: string
 *             description: Telegram file_id of uploaded image
 *           description: Array of Telegram file_ids
 *         unit:
 *           type: string
 *           description: Unit of measurement
 *         currency:
 *           type: string
 *           enum: [UZS, USD]
 *           description: Currency type
 *         createdBy:
 *           type: string
 *           description: ID of the admin who created the product
 *         branch:
 *           type: string
 *           description: ID of the branch
 *         batch_number:
 *           type: string
 *           description: Batch number
 *         vipPrice:
 *           type: number
 *           description: VIP price for special customers
 *         discount:
 *           type: object
 *           properties:
 *             price:
 *               type: number
 *               default: 0
 *               description: Fixed discount price
 *             children:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   quantity:
 *                     type: number
 *                     description: Quantity threshold for discount
 *                   value:
 *                     type: number
 *                     description: Discount percentage or value
 *               description: Array of quantity-based discounts
 *           description: Discount configuration for the product
 *         description:
 *           type: string
 *           description: Product description
 *         isAvailable:
 *           type: boolean
 *           default: true
 *           description: Whether the product is available for sale
 *         isDeleted:
 *           type: boolean
 *           default: false
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     ProductInput:
 *       type: object
 *       required:
 *         - name
 *         - costPrice
 *         - salePrice
 *         - quantity
 *         - minQuantity
 *         - unit
 *         - currency
 *         - createdBy
 *         - branch
 *       properties:
 *         name:
 *           type: string
 *           example: "Motor Oil 5W-30"
 *           description: Product name
 *         costPrice:
 *           type: number
 *           example: 50000
 *           description: Cost price of the product
 *         salePrice:
 *           type: number
 *           example: 75000
 *           description: Sale price of the product
 *         quantity:
 *           type: number
 *           minimum: 0
 *           example: 100.5
 *           description: Current quantity in stock
 *         minQuantity:
 *           type: number
 *           minimum: 0
 *           example: 10.5
 *           description: Minimum quantity threshold
 *         images:
 *           type: array
 *           items:
 *             type: string
 *             example: "BAADBAADtgIAAuWfHwTKrF1rVVxxdRYE"
 *           description: Array of Telegram file_ids
 *         unit:
 *           type: string
 *           example: "литр"
 *           description: Unit of measurement
 *         currency:
 *           type: string
 *           enum: [UZS, USD]
 *           example: "UZS"
 *           description: Currency type
 *         createdBy:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *           description: ID of the admin who created the product
 *         branch:
 *           type: string
 *           example: "507f1f77bcf86cd799439012"
 *           description: ID of the branch
 *         batch_number:
 *           type: string
 *           example: "BATCH001"
 *           description: Batch number
 *         vipPrice:
 *           type: number
 *           example: 70000
 *           description: VIP price for special customers
 *         discount:
 *           type: object
 *           properties:
 *             price:
 *               type: number
 *               example: 5000
 *               description: Fixed discount price
 *             children:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   quantity:
 *                     type: number
 *                     example: 5
 *                     description: Quantity threshold for discount
 *                   value:
 *                     type: number
 *                     example: 10
 *                     description: Discount percentage or value
 *               description: Array of quantity-based discounts
 *           description: Discount configuration for the product
 *         description:
 *           type: string
 *           example: "High quality motor oil for modern engines"
 *           description: Product description
 *         isAvailable:
 *           type: boolean
 *           example: true
 *           description: Whether the product is available for sale
 *
 *     ProductFormInput:
 *       type: object
 *       required:
 *         - name
 *         - costPrice
 *         - salePrice
 *         - quantity
 *         - minQuantity
 *         - unit
 *         - currency
 *         - createdBy
 *         - branch
 *       properties:
 *         name:
 *           type: string
 *           description: Product name
 *         costPrice:
 *           type: number
 *           description: Cost price of the product
 *         salePrice:
 *           type: number
 *           description: Sale price of the product
 *         quantity:
 *           type: number
 *           minimum: 0
 *           description: Current quantity in stock
 *         minQuantity:
 *           type: number
 *           minimum: 0
 *           description: Minimum quantity threshold
 *         images:
 *           type: array
 *           items:
 *             type: string
 *             format: binary
 *           description: Image files to upload (max 10 files, 20MB each)
 *         unit:
 *           type: string
 *           description: Unit of measurement
 *         currency:
 *           type: string
 *           enum: [UZS, USD]
 *           description: Currency type
 *         createdBy:
 *           type: string
 *           description: ID of the admin who created the product
 *         branch:
 *           type: string
 *           description: ID of the branch
 *         batch_number:
 *           type: string
 *           description: Batch number
 *         vipPrice:
 *           type: number
 *           description: VIP price for special customers
 *         discount:
 *           type: string
 *           description: JSON string of discount configuration
 *         description:
 *           type: string
 *           description: Product description
 *         isAvailable:
 *           type: boolean
 *           description: Whether the product is available for sale
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create a new product with multipart form data or JSON
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/ProductFormInput'
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProductInput'
 *           example:
 *             name: "Motor Oil 5W-30"
 *             costPrice: 50000
 *             salePrice: 75000
 *             quantity: 100.5
 *             minQuantity: 10.5
 *             images: ["BAADBAADtgIAAuWfHwTKrF1rVVxxdRYE"]
 *             unit: "литр"
 *             currency: "UZS"
 *             createdBy: "507f1f77bcf86cd799439011"
 *             branch: "507f1f77bcf86cd799439012"
 *             batch_number: "BATCH001"
 *             description: "High quality motor oil"
 *             vipPrice: 70000
 *             isAvailable: true
 *             discount:
 *               price: 5000
 *               children:
 *                 - quantity: 5
 *                   value: 10
 *                 - quantity: 10
 *                   value: 15
 *     responses:
 *       201:
 *         description: Product created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       msg:
 *                         type: string
 *                       param:
 *                         type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 *
 *   get:
 *     summary: Get all products
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Filter by product name (case insensitive)
 *       - in: query
 *         name: createdBy
 *         schema:
 *           type: string
 *         description: Filter by creator ID
 *       - in: query
 *         name: batch_number
 *         schema:
 *           type: string
 *         description: Filter by batch number
 *       - in: query
 *         name: minCostPrice
 *         schema:
 *           type: number
 *         description: Minimum cost price filter
 *       - in: query
 *         name: maxCostPrice
 *         schema:
 *           type: number
 *         description: Maximum cost price filter
 *       - in: query
 *         name: minSalePrice
 *         schema:
 *           type: number
 *         description: Minimum sale price filter
 *       - in: query
 *         name: maxSalePrice
 *         schema:
 *           type: number
 *         description: Maximum sale price filter
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by product name
 *       - in: query
 *         name: isAvailable
 *         schema:
 *           type: boolean
 *         description: Filter by product availability
 *     responses:
 *       200:
 *         description: List of products
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Product'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Get product by ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Product details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 *
 *   patch:
 *     summary: Update product by ID
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/ProductFormInput'
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProductInput'
 *     responses:
 *       200:
 *         description: Product updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 *
 *   delete:
 *     summary: Soft delete product by ID
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Product soft deleted successfully"
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/products/search/{query}:
 *   get:
 *     summary: Quick search products by name
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query for product name
 *       - in: query
 *         name: isAvailable
 *         schema:
 *           type: boolean
 *         description: Filter by product availability
 *     responses:
 *       200:
 *         description: Search results (limited to 10)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Product'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/products/image/{fileId}:
 *   get:
 *     summary: Get image from Telegram by file_id
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: Telegram file_id of the image
 *       - in: query
 *         name: proxy
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *         description: Whether to proxy the image through our server or return the URL
 *     responses:
 *       200:
 *         description: Image URL or proxied image
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imageUrl:
 *                   type: string
 *                   example: "https://api.telegram.org/file/bot123:ABC/photos/file_123.jpg"
 *                   description: Direct URL to the image (when proxy=false)
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *               description: Image binary data (when proxy=true)
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *               description: Image binary data (when proxy=true)
 *       500:
 *         description: Internal server error
 */
