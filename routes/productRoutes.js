const express = require("express");
const Product = require("../models/Product");
const Ingredient = require("../models/Ingredient");
const auth = require("../middleware/authMiddleware");

const router = express.Router();
router.use(auth);

// SKU generator
const generateSKU = (name) => {
  const prefix = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3);
  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}-${timestamp}`;
};

const generateUniqueSKU = async (name) => {
  let sku;
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 5) {
    sku = generateSKU(name);
    const existing = await Product.findOne({ sku });
    if (!existing) exists = false;
    else attempts++;
  }

  if (exists) {
    throw new Error(
      "Noyob SKU yaratilolmadi. Iltimos, keyinroq urinib ko‘ring."
    );
  }

  return sku;
};

// Ingredient validatsiyasi
const validateIngredients = async (ingredients) => {
  if (!Array.isArray(ingredients))
    return "Ingredientlar massiv bo‘lishi kerak.";

  for (const item of ingredients) {
    if (!item.ingredient || !item.quantity || !item.unit) {
      return "Har bir ingredientda 'ingredient', 'quantity', va 'unit' bo‘lishi kerak.";
    }
    const doc = await Ingredient.findById(item.ingredient);
    if (!doc) return `Ingredient topilmadi: ${item.ingredient}`;
  }

  return null;
};

// Collaboration validatsiyasi
const validateCollaborations = async (collaboration, selfSKU = null) => {
  if (!Array.isArray(collaboration))
    return "Hamkor mahsulotlar massiv bo‘lishi kerak.";

  for (const item of collaboration) {
    if (!item.product || !item.quantity) {
      return "Har bir hamkor mahsulotda 'product' va 'quantity' bo‘lishi kerak.";
    }

    const productDoc = await Product.findById(item.product);
    if (!productDoc) {
      return `Hamkor mahsulot topilmadi: ${item.product}`;
    }

    if (selfSKU && productDoc.sku === selfSKU) {
      return "Mahsulot o‘zini o‘zi hamkor qila olmaydi.";
    }
  }

  return null;
};

// Ingredientlar narxidan costPrice hisoblash
const calculateCostPrice = async (ingredients) => {
  let total = 0;
  for (const item of ingredients) {
    const doc = await Ingredient.findById(item.ingredient);
    total += doc.purchasePrice * item.quantity;
  }
  return total;
};

// === CREATE PRODUCT ===
router.post("/", async (req, res) => {
  try {
    const { name, ingredients, unit, salePrice, collaboration = [] } = req.body;

    if (!name || !unit) {
      return res
        .status(400)
        .json({ message: "Nomi va o‘lchov birligi majburiy." });
    }

    const ingredientErr = await validateIngredients(ingredients);
    if (ingredientErr) return res.status(400).json({ message: ingredientErr });

    const collabErr = await validateCollaborations(collaboration);
    if (collabErr) return res.status(400).json({ message: collabErr });

    const sku = await generateUniqueSKU(name);
    const costPrice = await calculateCostPrice(ingredients);

    const newProduct = new Product({
      name,
      ingredients,
      unit,
      salePrice,
      costPrice,
      collaboration,
      sku,
    });

    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (err) {
    res
      .status(400)
      .json({ message: "Mahsulot yaratishda xato", error: err.message });
  }
});

// === UPDATE PRODUCT BY SKU ===
router.put("/:sku", async (req, res) => {
  try {
    const { name, ingredients, unit, salePrice, collaboration = [] } = req.body;

    if (!name || !unit) {
      return res
        .status(400)
        .json({ message: "Nomi va o‘lchov birligi majburiy." });
    }

    const ingredientErr = await validateIngredients(ingredients);
    if (ingredientErr) return res.status(400).json({ message: ingredientErr });

    const collabErr = await validateCollaborations(
      collaboration,
      req.params.sku
    );
    if (collabErr) return res.status(400).json({ message: collabErr });

    const costPrice = await calculateCostPrice(ingredients);

    const updatedProduct = await Product.findOneAndUpdate(
      { sku: req.params.sku },
      {
        name,
        ingredients,
        unit,
        salePrice,
        costPrice,
        collaboration,
      },
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ message: "Mahsulot topilmadi" });
    }

    res.status(200).json(updatedProduct);
  } catch (err) {
    res.status(400).json({ message: "Yangilashda xato", error: err.message });
  }
});

// === GET ALL PRODUCTS ===
router.get("/", async (req, res) => {
  try {
    const products = await Product.find().populate([
      { path: "ingredients.ingredient" },
      { path: "collaboration.product" },
    ]);
    res.status(200).json(products);
  } catch (err) {
    res
      .status(400)
      .json({ message: "Mahsulotlarni olishda xato", error: err.message });
  }
});

// === GET SINGLE PRODUCT BY SKU ===
router.get("/:sku", async (req, res) => {
  try {
    const product = await Product.findOne({ sku: req.params.sku }).populate([
      { path: "ingredients.ingredient" },
      { path: "collaboration.product" },
    ]);
    if (!product) {
      return res.status(404).json({ message: "Mahsulot topilmadi" });
    }
    res.status(200).json(product);
  } catch (err) {
    res
      .status(400)
      .json({ message: "Mahsulotni olishda xato", error: err.message });
  }
});

// === DELETE PRODUCT BY SKU ===
router.delete("/:sku", async (req, res) => {
  try {
    const deleted = await Product.findOneAndDelete({ sku: req.params.sku });
    if (!deleted) {
      return res.status(404).json({ message: "Mahsulot topilmadi" });
    }
    res.status(200).json({ message: "Mahsulot o‘chirildi" });
  } catch (err) {
    res.status(400).json({ message: "O‘chirishda xato", error: err.message });
  }
});

module.exports = router;
