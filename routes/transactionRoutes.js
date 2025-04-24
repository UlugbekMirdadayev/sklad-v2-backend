const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const Balance = require("../models/Balance");
const auth = require("../middleware/authMiddleware");
const postTelegramMessage = require("../config/tg");
const Admin = require("../models/Admin");
const Worker = require("../models/Worker");

// 💸 Pul kirimi
router.post("/cash-in", auth, async (req, res) => {
  try {
    const { amount, paymentType, description } = req.body;

    if (!amount || !paymentType) {
      return res.status(400).json({
        message:
          "Miqdor (amount) va to‘lov turi (paymentType) kiritilishi kerak.",
      });
    }

    if (!["cash", "card", "credit"].includes(paymentType)) {
      return res.status(400).json({
        message:
          "To‘lov turi noto‘g‘ri: 'cash' yoki 'card', 'credit' bo‘lishi kerak.",
      });
    }

    let balance = await Balance.findOne();
    if (!balance) {
      balance = new Balance({ amount: 0 });
    }

    balance.amount += amount;
    await balance.save();

    const transaction = new Transaction({
      type: "cash-in",
      amount,
      paymentType,
      description,
      createdBy: req.user.adminId || req.user.workerId,
    });

    const isUser = req.user.adminId
      ? await Admin.findById(req.user.adminId)
      : req.user.workerId
      ? await Worker.findById(req.user.workerId)
      : null;

    await transaction.save();

    postTelegramMessage(
      `Balans: <b>${balance?.amount?.toLocaleString()} so'm</b>` +
        `\nTranzaksiya turi: <b>${transaction.type === "cash-in" ? "Kirim" : "Chiqim"}</b>` +
        `\nMiqdor: <b>${transaction.amount?.toLocaleString()} so'm</b>` +
        `\nTo'lov turi: <b>${
          transaction.paymentType === "cash"
            ? "Naqd"
            : transaction.paymentType === "card"
            ? "Karta"
            : "Nasiya"
        }</b>` +
        `\nIzoh: <b>${transaction.description}</b>` +
        `\nTranzaksiya ID: <b>${transaction._id}</b>` +
        `\nTranzaksiya qilingan vaqt: <b>${transaction.createdAt.toLocaleString()}</b>` +
        `\nTranzaksiya qilingan admin: <b>${isUser.fullName}</b>`
    )
      .then(() => {
        console.log("success post message telegram");
      })
      .catch((err) => {
        console.log("Telegramga xabar yuborishda xatolik:", err.response.data);
      });

    res.status(201).json({
      message: "Kirim muvaffaqiyatli qo‘shildi",
      transaction,
      balance: balance.amount,
    });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik", error: error.message });
  }
});

// 💸 Pul chiqimi
router.post("/cash-out", auth, async (req, res) => {
  try {
    const { amount, paymentType, description } = req.body;

    if (!amount || !paymentType) {
      return res.status(400).json({
        message:
          "Miqdor (amount) va to‘lov turi (paymentType) kiritilishi kerak.",
      });
    }

    if (!["cash", "card", "credit"].includes(paymentType)) {
      return res.status(400).json({
        message:
          "To‘lov turi noto‘g‘ri: 'cash' yoki 'card', 'credit' bo‘lishi kerak.",
      });
    }

    let balance = await Balance.findOne();
    if (!balance) {
      balance = new Balance({ amount: 0 });
    }

    if (balance.amount < amount) {
      return res.status(400).json({
        message: `Hisobda yetarli mablag‘ yo‘q. Hisobda: ${
          balance.amount
        } uzs bor ammo chiqim: ${amount} uzs bo'ldi. Yetishmovchilik miqdori: ${
          amount - balance.amount
        } uzs`,
      });
    }

    balance.amount -= amount;
    await balance.save();

    const transaction = new Transaction({
      type: "cash-out",
      amount,
      paymentType,
      description,
      createdBy: req.user.adminId || req.user.workerId,
    });

    await transaction.save();

    const isUser = req.user.adminId
      ? await Admin.findById(req.user.adminId)
      : req.user.workerId
      ? await Worker.findById(req.user.workerId)
      : null;

    postTelegramMessage(
      `Balans: <b>${balance?.amount?.toLocaleString()} so'm</b>` +
        `\nTranzaksiya turi: <>${
          transaction.type === "cash-in" ? "Kirim" : "Chiqim"
        }</b>` +
        `\nMiqdor: <b>${transaction.amount?.toLocaleString()} so'm</b>` +
        `\nTo'lov turi: <b>${
          transaction.paymentType === "cash"
            ? "Naqd"
            : transaction.paymentType === "card"
            ? "Karta"
            : "Nasiya"
        }</b>` +
        `\nIzoh: <b>${transaction.description}</b>` +
        `\nTranzaksiya ID: <b>${transaction._id}</b>` +
        `\nTranzaksiya qilingan vaqt: <b>${transaction.createdAt.toLocaleString()}</b>` +
        `\nTranzaksiya qilingan admin: <b>${isUser.fullName}</b>`
    )
      .then(() => {
        console.log("success post message telegram");
      })
      .catch((err) => {
        console.log("Telegramga xabar yuborishda xatolik:", err.response.data);
      });

    res.status(201).json({
      message: "Chiqim muvaffaqiyatli qo‘shildi",
      transaction,
      balance: balance.amount,
    });
  } catch (error) {
    res.status(500).json({ message: "Serverda xatolik", error: error.message });
  }
});

// 📄 Barcha tranzaksiyalar (sahifalash bilan)
router.get("/", auth, async (req, res) => {
  try {
    let { type, paymentType, page = 1, limit = 20 } = req.query;
    if (page < 1) {
      page = 1;
    }
    if (limit < 1) {
      limit = 1;
    }
    page = Math.round(page);
    limit = Math.round(limit);
    const filter = {};
    if (type) filter.type = type;
    if (paymentType) filter.paymentType = paymentType;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [transactions, totalCount] = await Promise.all([
      Transaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Transaction.countDocuments(filter),
    ]);

    res.status(200).json({
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / limit),
      totalItems: totalCount,
      transactions,
    });
  } catch (error) {
    res.status(500).json({
      message: "Tranzaksiyalarni olishda xatolik",
      error: error.message,
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Transaction.findOneAndDelete({ id: req.params._id });
    if (!deleted) {
      return res.status(404).json({ message: "Transaction topilmadi" });
    }
    let balance = await Balance.findOne();
    if (!balance) {
      balance = new Balance({ amount: 0 });
    }
    if (deleted.type === "cash-in") {
      balance.amount -= deleted.amount;
    } else if (deleted.type === "cash-out") {
      balance.amount += deleted.amount;
    }
    await balance.save();
    res.status(200).json({ message: "Transaction o‘chirildi" });
  } catch (err) {
    res.status(400).json({ message: "O‘chirishda xato", error: err.message });
  }
});

module.exports = router;
