const express = require("express");
const router = express.Router();
const Product = require("../models/products/product.model");
const authMiddleware = require("../middleware/authMiddleware");
const { body, validationResult } = require("express-validator");

// Валидация для создания/обновления продукта
const productValidation = [
  body("name").trim().notEmpty().withMessage("Название продукта обязательно"),
  body("category")
    .isIn(["Oil", "Filter", "SparePart", "Other"])
    .withMessage("Неверная категория продукта"),
  body("createdBy").isMongoId().withMessage("Неверный ID создателя"),
];

// Создание нового продукта
router.post("/", authMiddleware, productValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const product = new Product(req.body);
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение списка продуктов
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { category, search, createdBy } = req.query;
    let query = {};

    if (category) {
      query.category = category;
    }
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }
    if (createdBy) {
      query.createdBy = createdBy;
    }

    const products = await Product.find(query)
      .populate("createdBy")
      .sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение продукта по ID
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("createdBy");
    if (!product) {
      return res.status(404).json({ message: "Продукт не найден" });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Обновление продукта
router.patch("/:id", authMiddleware, productValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Продукт не найден" });
    }

    Object.assign(product, req.body);
    await product.save();
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Удаление продукта
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Продукт не найден" });
    }

    await product.deleteOne();
    res.json({ message: "Продукт успешно удален" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение статистики по продуктам
router.get("/stats/summary", authMiddleware, async (req, res) => {
  try {
    const stats = await Product.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          products: { $push: "$name" },
        },
      },
    ]);

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Поиск продуктов
router.get("/search/:query", authMiddleware, async (req, res) => {
  try {
    const { query } = req.params;
    const products = await Product.find({
      name: { $regex: query, $options: "i" },
    })
      .populate("createdBy")
      .limit(10);

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
