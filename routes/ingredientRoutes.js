const express = require("express");
const Ingredient = require("../models/Ingredient");
const auth = require("../middleware/authMiddleware");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");
const Worker = require("../models/Worker");
const postTelegramMessage = require("../config/tg");
const Balance = require("../models/Balance");

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
  let sku,
    exists = true,
    attempts = 0;
  while (exists && attempts < 5) {
    sku = generateSKU(name);
    exists = !!(await Ingredient.findOne({ sku }));
    attempts++;
  }
  if (exists) throw new Error("Noyob SKU yaratilmadi.");
  return sku;
};

// POST - Ingredient qo‘shish
router.post("/", async (req, res) => {
  try {
    const {
      name,
      unit,
      minStock,
      currentStock = 0,
      purchasePrice,
      paymentType,
    } = req.body;

    if (!name || !unit || !paymentType) {
      return res
        .status(400)
        .json({ message: "Iltimos, barcha majburiy maydonlarni to‘ldiring." });
    }

    const sku = await generateUniqueSKU(name);
    const totalCost = purchasePrice * currentStock;

    let balance = await Balance.findOne();
    if (!balance) balance = new Balance({ amount: 0 });

    if (balance.amount < totalCost) {
      if (paymentType !== "credit") {
        return res.status(400).json({
          message: `Hisobda mablag‘ yetarli emas. Mavjud: ${balance.amount} so‘m, kerak: ${totalCost} so‘m.`,
        });
      }
    }

    const ingredient = new Ingredient({
      name,
      sku,
      unit,
      minStock,
      currentStock,
      purchasePrice,
    });
    await ingredient.save();

    const createdBy = req.user.adminId || req.user.workerId;
    const transaction = new Transaction({
      type: "cash-out",
      amount: totalCost,
      paymentType,
      description: `Yangi ingredient: ${name} (${currentStock} ${unit})`,
      createdBy,
    });
    await transaction.save();

    balance.amount -= totalCost;
    await balance.save();

    const user = req.user.adminId
      ? await Admin.findById(req.user.adminId)
      : await Worker.findById(req.user.workerId);

    postTelegramMessage(
      `🧾 Yangi ingredient qo‘shildi!\n` +
        `💸 Chiqim: <b>${totalCost.toLocaleString()} so‘m</b>\n` +
        `💳 To‘lov turi: <b>${
          paymentType === "cash"
            ? "Naqd"
            : paymentType === "card"
            ? "Karta"
            : "Nasiya"
        }</b>\n` +
        `📦 Mahsulot: <b>${name}</b> (${currentStock} ${unit})\n` +
        `👤 Kim tomonidan: <b>${user?.fullName}</b>`
    ).catch((err) =>
      console.log("Telegram xatosi:", err?.response?.data || err.message)
    );

    res
      .status(201)
      .json({ message: "Ingredient muvaffaqiyatli qo‘shildi", ingredient });
  } catch (error) {
    res.status(500).json({ message: `Xatolik: ${error.message}` });
  }
});

// GET - Barcha ingredientlar
router.get("/", async (req, res) => {
  try {
    const ingredients = await Ingredient.find();
    res.json({ message: "Ingredientlar ro‘yxati", ingredients });
  } catch (error) {
    res.status(500).json({ message: `Xatolik: ${error.message}` });
  }
});

// GET - Bitta ingredient
router.get("/:sku", async (req, res) => {
  try {
    const ingredient = await Ingredient.findOne({ sku: req.params.sku });
    if (!ingredient)
      return res.status(404).json({ message: "Ingredient topilmadi" });
    res.json({ message: "Ingredient topildi", ingredient });
  } catch (error) {
    res.status(500).json({ message: `Xatolik: ${error.message}` });
  }
});

// PUT - Ingredientni yangilash
router.put("/:id", async (req, res) => {
  try {
    const old = await Ingredient.findById(req.params.id);
    if (!old) return res.status(404).json({ message: "Ingredient topilmadi" });
    const { currentStock, purchasePrice, paymentType } = req.body;
    const diff = old.currentStock - +currentStock;
    const amount = Math.abs(diff * purchasePrice);

    let balance = await Balance.findOne();
    if (!balance) balance = new Balance({ amount: 0 });

    if (diff < 0 && balance.amount < amount) {
      if (paymentType !== "credit") {
        return res.status(400).json({
          message: `Hisobda yetarli mablag‘ yo‘q. Mavjud: ${balance.amount} so‘m, kerak: ${amount} so‘m.`,
        });
      }
    }

    const updated = await Ingredient.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    const transaction = new Transaction({
      type: diff > 0 ? "cash-in" : "cash-out",
      amount,
      paymentType,
      description: `Ingredient yangilandi: ${updated.name} (${Math.abs(diff)} ${
        updated.unit
      }) ${diff > 0 ? "chiqib ketdi" : "keldi"}`,
      createdBy: req.user.adminId || req.user.workerId,
    });
    await transaction.save();

    if (diff > 0) {
      balance.amount += amount;
    } else {
      balance.amount -= amount;
    }
    await balance.save();

    const user = req.user.adminId
      ? await Admin.findById(req.user.adminId)
      : await Worker.findById(req.user.workerId);

    postTelegramMessage(
      `🔄 Ingredient yangilandi!\n` + diff > 0
        ? `📈 Masalliq keldi skladga`
        : `📉 Masalliq chiqib ketdi skladdan` +
            `\n` +
            `📦 Mahsulot: <b>${updated.name}</b>\n` +
            `🔢 Miqdor: ${Math.abs(diff)} ${updated.unit}\n` +
            `💸 Tranzaksiya: <b>${
              transaction.type === "cash-in" ? "Kirim" : "Chiqim"
            }</b>\n` +
            `💰 Miqdor: <b>${amount.toLocaleString()} so‘m</b>\n` +
            `💳 To‘lov: <b>${
              paymentType === "cash"
                ? "Naqd"
                : paymentType === "card"
                ? "Karta"
                : "Nasiya"
            }</b>\n` +
            `👤 Kim tomonidan: <b>${user?.fullName}</b>`
    ).catch((err) =>
      console.log("Telegram xatosi:", err?.response?.data || err.message)
    );

    res
      .status(200)
      .json({ message: "Ingredient yangilandi", ingredient: updated });
  } catch (error) {
    res.status(500).json({ message: `Xatolik: ${error.message}` });
  }
});

// DELETE - Ingredientni o‘chirish
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Ingredient.findByIdAndDelete(req.params.id);
    if (!deleted)
      return res.status(404).json({ message: "Ingredient topilmadi" });
    res.json({ message: "Ingredient o‘chirildi" });
  } catch (error) {
    res.status(500).json({ message: `Xatolik: ${error.message}` });
  }
});

module.exports = router;
