const express = require("express");
const router = express.Router();
const Order = require("../models/orders/order.model");
const Client = require("../models/clients/client.model");
const authMiddleware = require("../middleware/authMiddleware");
const { body, validationResult } = require("express-validator");

// Валидация для создания/обновления заказа
const orderValidation = [
  body("client").isMongoId().withMessage("Неверный ID клиента"),
  body("branch").isMongoId().withMessage("Неверный ID филиала"),
  body("orderType").isIn(["vip", "regular"]).withMessage("Неверный тип заказа"),
  body("products").isArray().withMessage("Продукты должны быть массивом"),
  body("products.*.product").isMongoId().withMessage("Неверный ID продукта"),
  body("products.*.quantity")
    .isNumeric()
    .withMessage("Количество должно быть числом"),
  body("products.*.price").isNumeric().withMessage("Цена должна быть числом"),
  body("totalAmount").isNumeric().withMessage("Общая сумма должна быть числом"),
  body("paidAmount")
    .optional()
    .isNumeric()
    .withMessage("Оплаченная сумма должна быть числом"),
  body("debtAmount")
    .optional()
    .isNumeric()
    .withMessage("Сумма долга должна быть числом"),
  body("paymentType")
    .isIn(["cash", "card", "debt"])
    .withMessage("Неверный метод оплаты"),
  body("notes").optional().trim(),
];

// Создание нового заказа
router.post("/", authMiddleware, orderValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const order = new Order({
      ...req.body,
      paidAmount: req.body.paidAmount || 0,
      debtAmount: req.body.debtAmount || 0,
    });

    await order.save();

    // Если это VIP заказ с долгом, обновляем долг клиента
    if (order.orderType === "vip" && order.debtAmount > 0) {
      const client = await Client.findById(order.client);
      if (client) {
        client.debt += order.debtAmount;
        await client.save();
      }
    }

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение списка заказов
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { client, branch, orderType, startDate, endDate } = req.query;
    let query = {};

    if (client) {
      query.client = client;
    }
    if (branch) {
      query.branch = branch;
    }
    if (orderType) {
      query.orderType = orderType;
    }
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const orders = await Order.find(query)
      .populate("client")
      .populate("branch")
      .populate("products.product")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение заказа по ID
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("client")
      .populate("branch")
      .populate("products.product");
    if (!order) {
      return res.status(404).json({ message: "Заказ не найден" });
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Обновление заказа
router.patch("/:id", authMiddleware, orderValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Заказ не найден" });
    }

    // Если меняется сумма долга, обновляем долг клиента
    if (req.body.debtAmount !== undefined && order.orderType === "vip") {
      const client = await Client.findById(order.client);
      if (client) {
        const oldDebt = order.debtAmount;
        const newDebt = req.body.debtAmount;
        client.debt = client.debt - oldDebt + newDebt;
        await client.save();
      }
    }

    Object.assign(order, req.body);
    await order.save();
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Добавление платежа к заказу
router.post(
  "/:id/payments",
  authMiddleware,
  [
    body("amount").isNumeric().withMessage("Сумма должна быть числом"),
    body("paymentType")
      .isIn(["cash", "card", "debt"])
      .withMessage("Неверный метод оплаты"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const order = await Order.findById(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Заказ не найден" });
      }

      const paymentAmount = req.body.amount;
      const newPaidAmount = order.paidAmount + paymentAmount;
      const newDebtAmount = Math.max(0, order.totalAmount - newPaidAmount);

      order.paidAmount = newPaidAmount;
      order.debtAmount = newDebtAmount;
      await order.save();

      // Если это VIP заказ, обновляем долг клиента
      if (order.orderType === "vip") {
        const client = await Client.findById(order.client);
        if (client) {
          client.debt = Math.max(0, client.debt - paymentAmount);
          await client.save();
        }
      }

      res.json(order);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Получение статистики по заказам
router.get("/stats/summary", authMiddleware, async (req, res) => {
  try {
    const { branch, startDate, endDate } = req.query;
    let match = {};

    if (branch) {
      match.branch = branch;
    }
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) {
        match.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        match.createdAt.$lte = new Date(endDate);
      }
    }

    const stats = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$orderType",
          totalOrders: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$paidAmount" },
          totalDebt: { $sum: "$debtAmount" },
        },
      },
    ]);

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Заказ не найден" });
    }
    if (order.isDeleted) {
      return res.status(400).json({ message: "Заказ уже удалён" });
    }
    order.isDeleted = true;
    order.deletedAt = new Date();
    await order.save();
    res.json({ message: "Заказ успешно удалён (soft delete)", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;