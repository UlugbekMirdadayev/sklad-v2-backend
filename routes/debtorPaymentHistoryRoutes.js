const express = require("express");
const router = express.Router();
const DebtorPaymentHistory = require("../models/debtors/debtorPaymentHistory.model");
const Debtor = require("../models/debtors/debtor.model");
const authMiddleware = require("../middleware/authMiddleware");
const { body, validationResult } = require("express-validator");

// Валидация для создания платежа
const paymentValidation = [
  body("debtor").isMongoId().withMessage("Неверный ID должника"),
  body("amountPaid")
    .isNumeric()
    .withMessage("Сумма платежа должна быть числом"),
  body("paymentMethod")
    .isIn(["cash", "card", "transfer"])
    .withMessage("Неверный метод оплаты"),
  body("description").optional().trim(),
];

// Создание записи о платеже
router.post("/", authMiddleware, paymentValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const debtor = await Debtor.findById(req.body.debtor);
    if (!debtor) {
      return res.status(404).json({ message: "Должник не найден" });
    }

    const payment = new DebtorPaymentHistory({
      ...req.body,
      paidAt: req.body.paidAt || new Date(),
    });

    await payment.save();
    res.status(201).json(payment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение истории платежей
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { debtor, startDate, endDate, paymentMethod } = req.query;
    let query = {};

    if (debtor) {
      query.debtor = debtor;
    }
    if (startDate || endDate) {
      query.paidAt = {};
      if (startDate) {
        query.paidAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.paidAt.$lte = new Date(endDate);
      }
    }
    if (paymentMethod) {
      query.paymentMethod = paymentMethod;
    }

    const payments = await DebtorPaymentHistory.find(query)
      .populate("debtor")
      .sort({ paidAt: -1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение платежа по ID
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const payment = await DebtorPaymentHistory.findById(req.params.id).populate(
      "debtor"
    );
    if (!payment) {
      return res.status(404).json({ message: "Платеж не найден" });
    }
    res.json(payment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение статистики по платежам
router.get("/stats/summary", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, paymentMethod } = req.query;
    let match = {};

    if (startDate || endDate) {
      match.paidAt = {};
      if (startDate) {
        match.paidAt.$gte = new Date(startDate);
      }
      if (endDate) {
        match.paidAt.$lte = new Date(endDate);
      }
    }
    if (paymentMethod) {
      match.paymentMethod = paymentMethod;
    }

    const stats = await DebtorPaymentHistory.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$paymentMethod",
          totalAmount: { $sum: "$amountPaid" },
          count: { $sum: 1 },
        },
      },
    ]);

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение платежей по должнику
router.get("/debtor/:debtorId", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, paymentMethod } = req.query;
    let query = { debtor: req.params.debtorId };

    if (startDate || endDate) {
      query.paidAt = {};
      if (startDate) {
        query.paidAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.paidAt.$lte = new Date(endDate);
      }
    }
    if (paymentMethod) {
      query.paymentMethod = paymentMethod;
    }

    const payments = await DebtorPaymentHistory.find(query)
      .populate("debtor")
      .sort({ paidAt: -1 });

    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Обновление информации о платеже
router.patch(
  "/:id",
  authMiddleware,
  [
    body("amountPaid")
      .optional()
      .isNumeric()
      .withMessage("Сумма платежа должна быть числом"),
    body("paymentMethod")
      .optional()
      .isIn(["cash", "card", "transfer"])
      .withMessage("Неверный метод оплаты"),
    body("description").optional().trim(),
    body("paidAt").optional().isISO8601().withMessage("Неверный формат даты"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const payment = await DebtorPaymentHistory.findById(req.params.id);
      if (!payment) {
        return res.status(404).json({ message: "Платеж не найден" });
      }

      Object.assign(payment, req.body);
      await payment.save();
      res.json(payment);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;
