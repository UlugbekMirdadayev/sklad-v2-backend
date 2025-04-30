const express = require("express");
const router = express.Router();
const Debtor = require("../models/debtors/debtor.model");
const Client = require("../models/clients/client.model");
const authMiddleware = require("../middleware/authMiddleware");
const { body, validationResult } = require("express-validator");

// Валидация для создания/обновления долга
const debtValidation = [
  body("client").isMongoId().withMessage("Неверный ID клиента"),
  body("branch").isMongoId().withMessage("Неверный ID филиала"),
  body("totalDebt").isNumeric().withMessage("Сумма долга должна быть числом"),
  body("description").optional().trim(),
];

// Создание новой записи о долге
router.post("/", authMiddleware, debtValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const debtor = new Debtor({
      client: req.body.client,
      branch: req.body.branch,
      totalDebt: req.body.totalDebt,
      paidAmount: 0,
      remainingDebt: req.body.totalDebt,
      description: req.body.description || "",
      status: "pending",
    });

    await debtor.save();

    // Обновляем долг клиента
    const client = await Client.findById(req.body.client);
    if (client) {
      client.debt = (client.debt || 0) + req.body.totalDebt;
      await client.save();
    }

    res.status(201).json(debtor);
  } catch (error) {
    console.error("Error creating debtor:", error);
    res.status(500).json({
      message: "Внутренняя ошибка сервера",
      error: error.message,
    });
  }
});

// Получение списка должников
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { branch, status, search } = req.query;
    let query = {};

    if (branch) {
      query.branch = branch;
    }
    if (status) {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { "client.name": { $regex: search, $options: "i" } },
        { "client.phone": { $regex: search, $options: "i" } },
      ];
    }

    const debtors = await Debtor.find(query)
      .populate("client")
      .populate("branch")
      .sort({ createdAt: -1 });
    res.json(debtors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение должника по ID
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const debtor = await Debtor.findById(req.params.id)
      .populate("client")
      .populate("branch");
    if (!debtor) {
      return res.status(404).json({ message: "Должник не найден" });
    }
    res.json(debtor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Добавление платежа
router.post(
  "/:id/payments",
  authMiddleware,
  [
    body("amount").isNumeric().withMessage("Сумма должна быть числом"),
    body("date").optional().isISO8601().withMessage("Неверный формат даты"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const debtor = await Debtor.findById(req.params.id);
      if (!debtor) {
        return res.status(404).json({ message: "Должник не найден" });
      }

      const paymentAmount = req.body.amount;
      const newPaidAmount = debtor.paidAmount + paymentAmount;
      const newRemainingDebt = Math.max(0, debtor.totalDebt - newPaidAmount);

      // Обновляем статус
      let newStatus = "pending";
      if (newRemainingDebt === 0) {
        newStatus = "paid";
      } else if (newPaidAmount > 0) {
        newStatus = "partial";
      }

      debtor.paidAmount = newPaidAmount;
      debtor.remainingDebt = newRemainingDebt;
      debtor.status = newStatus;

      await debtor.save();

      // Обновляем долг клиента
      const client = await Client.findById(debtor.client);
      if (client) {
        client.debt = Math.max(0, client.debt - paymentAmount);
        await client.save();
      }

      res.json(debtor);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Обновление информации о долге
router.patch("/:id", authMiddleware, debtValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const debtor = await Debtor.findById(req.params.id);
    if (!debtor) {
      return res.status(404).json({ message: "Должник не найден" });
    }

    // Обновляем только разрешенные поля
    const allowedFields = ["client", "branch", "totalDebt", "description"];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        debtor[field] = req.body[field];
      }
    }

    // Если меняется общая сумма долга, пересчитываем оставшуюся сумму
    if (req.body.totalDebt !== undefined) {
      const diff = req.body.totalDebt - debtor.totalDebt;
      debtor.remainingDebt = Math.max(0, debtor.remainingDebt + diff);
    }

    await debtor.save();

    // Обновляем долг клиента
    const client = await Client.findById(debtor.client);
    if (client && req.body.totalDebt !== undefined) {
      const diff = req.body.totalDebt - debtor.totalDebt;
      client.debt = Math.max(0, client.debt + diff);
      await client.save();
    }

    res.json(debtor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение статистики по долгам
router.get("/stats/summary", authMiddleware, async (req, res) => {
  try {
    const { branch } = req.query;
    let match = {};

    if (branch) {
      match.branch = branch;
    }

    const stats = await Debtor.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalDebt: { $sum: "$totalDebt" },
          totalPaid: { $sum: "$paidAmount" },
          totalRemaining: { $sum: "$remainingDebt" },
        },
      },
    ]);

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
