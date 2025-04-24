const express = require("express");
const router = express.Router();
const Inventory = require("../models/Inventory");
const Product = require("../models/Product");
const Ingredient = require("../models/Ingredient");
const Balance = require("../models/Balance");
const Transaction = require("../models/Transaction");
const Worker = require("../models/Worker");
const Branch = require("../models/Branch");
const auth = require("../middleware/authMiddleware");
const postTelegramMessage = require("../config/tg");
const Admin = require("../models/Admin");

// ✅ Omborga mahsulot qo'shish yoki yangilash
router.post("/", auth, async (req, res) => {
  try {
    const { productId, quantity, chef: chefId, branch: branchId } = req.body;

    if (!productId || !quantity || !chefId || !branchId) {
      return res.status(400).json({
        message: "Mahsulot ID, miqdor, chef ID va branch ID kiritilishi shart!",
      });
    }

    const chef = await Worker.findById(chefId);
    if (!chef) {
      return res.status(404).json({ message: "Tayyorlovchi topilmadi!" });
    }

    const branch = await Branch.findById(branchId);
    if (!branch) {
      return res.status(404).json({ message: "Filial topilmadi!" });
    }

    const product = await Product.findById(productId).populate(
      "ingredients.ingredient"
    );
    if (!product) {
      return res.status(404).json({ message: "Mahsulot topilmadi!" });
    }

    for (const item of product.ingredients) {
      const ingredientDoc = await Ingredient.findById(item.ingredient);
      if (!ingredientDoc) {
        return res
          .status(404)
          .json({ message: `Ingredient topilmadi: ${item.ingredient}` });
      }

      const totalUsage = item.quantity * quantity;
      if (ingredientDoc.currentStock < totalUsage) {
        return res
          .status(400)
          .json({ message: `Omborda ${ingredientDoc.name} yetarli emas.` });
      }

      ingredientDoc.currentStock -= totalUsage;
      await ingredientDoc.save();
    }

    let inventory = await Inventory.findOne({
      product: productId,
      chef: chefId,
      branch: branchId,
    });
    if (!inventory) {
      inventory = new Inventory({
        product: productId,
        quantity,
        chef: chefId,
        branch: branchId,
      });
    } else {
      inventory.quantity += +quantity;
      inventory.updatedAt = Date.now();
    }

    await inventory.save();
    res.status(201).json({ message: "Ombor yangilandi!", inventory });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Xatolik yuz berdi!", error: error.message });
  }
});

// 📦 Ombordagi mahsulotlar (pagination bilan)
router.get("/", auth, async (req, res) => {
  try {
    let { page = 1, limit = 10 } = req.query;
    page = Math.max(1, Math.round(page));
    limit = Math.max(1, Math.round(limit));
    const skip = (page - 1) * limit;

    const inventory = await Inventory.find()
      .sort({ createdAt: -1 })
      .populate("product", "name sku unit")
      .populate("chef", "fullName phone balance role")
      .populate("branch", "name")
      .skip(skip)
      .limit(limit);

    const total = await Inventory.countDocuments();

    res.status(200).json({
      inventory,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalItems: total,
    });
  } catch (error) {
    res.status(500).json({
      message: "Ma'lumotlarni olishda xatolik!",
      error: error.message,
    });
  }
});

// 🛒 Mahsulotni sotish va tranzaksiya yozish
router.post("/sell", auth, async (req, res) => {
  try {
    const { items, paymentType } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0 || !paymentType) {
      return res.status(400).json({
        message: "Mahsulotlar ro‘yxati va to‘lov turi kiritilishi kerak.",
      });
    }

    if (!["cash", "card", "credit"].includes(paymentType)) {
      return res.status(400).json({
        message:
          "To‘lov turi noto‘g‘ri: 'cash' yoki 'card' ,'credit' bo‘lishi kerak.",
      });
    }

    let totalAmount = 0;
    const updatedInventories = [];
    const soldProducts = [];

    for (const item of items) {
      const { productId, quantity, chef, branch } = item;

      if (!productId || !quantity || !chef || !branch) {
        return res.status(400).json({
          message:
            "Har bir mahsulot uchun productId, quantity, chef va branch bo‘lishi kerak.",
        });
      }

      const isChef = await Worker.findById(chef);
      if (!isChef) {
        return res.status(404).json({ message: "Tayyorlovchi topilmadi!" });
      }

      const isBranch = await Branch.findById(branch);
      if (!isBranch) {
        return res.status(404).json({ message: "Filial topilmadi!" });
      }

      const product = await Product.findById(productId);
      if (!product) {
        return res
          .status(404)
          .json({ message: `Mahsulot topilmadi: ${productId}` });
      }

      const inventory = await Inventory.findOne({
        product: productId,
        chef,
        branch,
      });
      if (!inventory || inventory.quantity < quantity) {
        return res.status(400).json({
          message: `Omborda yetarli ${product.name} yo‘q (chef: ${chef}, branch: ${branch}).`,
        });
      }

      inventory.quantity -= quantity;
      await inventory.save();
      updatedInventories.push(inventory);

      const productTotal = product.salePrice * quantity;
      totalAmount += productTotal;

      soldProducts.push({
        name: product.name,
        quantity,
        unit: product.unit,
        total: productTotal,
        chef: isChef,
        branch: isBranch,
      });
    }

    let balance = await Balance.findOne();
    if (!balance) balance = new Balance({ amount: 0 });
    balance.amount += totalAmount;
    await balance.save();

    const transaction = new Transaction({
      type: "cash-in",
      amount: totalAmount,
      paymentType,
      description: `Mahsulotlar sotildi: ${soldProducts
        .map(
          (p) =>
            `${p.name} (${p.quantity} ${p.unit}), Chef: ${p.chef.fullName}, Filial: ${p.branch.name}`
        )
        .join(", ")}`,
      createdBy: req.user.adminId || req.user.workerId,
    });

    await transaction.save();

    const isUser = req.user.adminId
      ? await Admin.findById(req.user.adminId)
      : req.user.workerId
      ? await Worker.findById(req.user.workerId)
      : null;

    if (isUser) {
      const message = `Mahsulotlar sotildi:\n${soldProducts
        .map(
          (p) =>
            `${p.name} (${p.quantity} ${p.unit}), Chef: ${p.chef.fullName}, Filial: ${p.branch.name}`
        )
        .join("\n")}.\nTo'lov turi: ${
        paymentType === "cash"
          ? "Naqd"
          : paymentType === "card"
          ? "Karta"
          : "Nasiya"
      }.\nSotuvchi: ${
        isUser.fullName
      }.\nUmumiy miqdor: ${totalAmount?.toLocaleString()} uzs.\nHisob: ${balance.amount?.toLocaleString()} uzs.`;

      await postTelegramMessage(message);
    }

    res.status(200).json({
      message: "Sotuv muvaffaqiyatli amalga oshirildi!",
      transaction,
      updatedInventories,
      balance: balance.amount,
    });
  } catch (error) {
    res.status(500).json({ message: "Sotuvda xatolik!", error: error.message });
  }
});

// 📄 Ombordagi mahsulotni yangilash
router.put("/:id", auth, async (req, res) => {
  try {
    const inventory = await Inventory.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!inventory) {
      return res.status(404).json({ message: "Ombor yozuvi topilmadi!" });
    }
    res.json(inventory);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Yangilashda xatolik!", error: error.message });
  }
});

// ❌ Ombordan mahsulotni o‘chirish
router.delete("/:id", auth, async (req, res) => {
  try {
    const deleted = await Inventory.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res
        .status(404)
        .json({ message: "O‘chirish uchun yozuv topilmadi!" });
    }
    res.json({ message: "Mahsulot ombordan o‘chirildi." });
  } catch (error) {
    res
      .status(500)
      .json({ message: "O‘chirishda xatolik!", error: error.message });
  }
});

module.exports = router;
