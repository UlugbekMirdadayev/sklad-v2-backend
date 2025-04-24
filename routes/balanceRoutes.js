const express = require("express");
const Balance = require("../models/Balance");
const Transaction = require("../models/Transaction");
const Product = require("../models/Product");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// Dashboard olish

router.get("/", auth, async (req, res) => {
  // Bugungi sotuvlar, Ombordagi mahsulotlar, Bugungi chiqimlar

  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const endOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1
  );

  try {
    const balance = await Balance.findOne();
    const todayTransactions = await Transaction.find({
      createdAt: { $gte: startOfToday, $lt: endOfToday },
      type: "cash-in",
    });
    const todayTransactionsState = todayTransactions.reduce(
      (acc, transaction) => acc + transaction.amount,
      0
    );

    const todayExpenses = await Transaction.find({ type: "cash-out" });
    const allCredits = (
      await Transaction.find({ paymentType: "credit" })
    ).reduce((acc, transaction) => acc + transaction.amount, 0);

    const todayExpensesState = todayExpenses.reduce(
      (acc, transaction) => acc + transaction.amount,
      0
    );

    const productsCount = await Product.countDocuments({});

    const response = {
      todayTransactionsState,
      productsCount,
      todayExpensesState,
      allCredits,
      balance: balance ? balance.amount : 0,
    };

    res.status(200).json({
      message: "Dashboard muvaffaqiyatli olindi",
      dashboard: response,
    });
  } catch (error) {
    res.status(500).json({
      message: "Dashboardni olishda xatolik yuz berdi",
      error: error.message,
    });
  }
});

// Balansni olish
router.get("/balance", auth, async (req, res) => {
  try {
    const balance = await Balance.findOne();
    res.status(200).json(balance ?? { amount: 0 });
  } catch (error) {
    res.status(500).json({
      message: "Balansni olishda xatolik yuz berdi",
      error: error.message,
    });
  }
});

module.exports = router;
