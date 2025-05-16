const express = require("express");
const router = express.Router();
const Order = require("../models/orders/order.model");
const Debtor = require("../models/debtors/debtor.model");
const Client = require("../models/clients/client.model");
const authMiddleware = require("../middleware/authMiddleware");
const { body, validationResult } = require("express-validator");

// Order validation
const orderValidation = [
  body("client").isMongoId().withMessage("Неверный ID клиента"),
  body("branch").isMongoId().withMessage("Неверный ID филиала"),
  body("orderType").isIn(["vip", "regular"]).withMessage("Неверный тип заказа"),
  body("products").isArray().withMessage("Продукты должны быть массивом"),
  body("products.*.product").isMongoId().withMessage("Неверный ID продукта"),
  body("products.*.quantity").isNumeric().withMessage("Количество должно быть числом"),
  body("products.*.price").isNumeric().withMessage("Цена должна быть числом"),
  body("totalAmount").isNumeric().withMessage("Общая сумма должна быть числом"),
  body("paidAmount").optional().isNumeric().withMessage("Оплаченная сумма должна быть числом"),
  body("debtAmount").optional().isNumeric().withMessage("Сумма долга должна быть числом"),
  body("paymentType").isIn(["cash", "card", "debt"]).withMessage("Неверный метод оплаты"),
  body("notes").optional().trim(),
  body("date_returned").optional({ nullable: true })
    .isISO8601()
    .withMessage("Noto'g'ri sana formati")
];

// POST /orders
router.post("/", authMiddleware, orderValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { totalAmount, paidAmount = 0, debtAmount = 0, paymentType, date_returned, client, branch } = req.body;

    if (paidAmount + debtAmount !== totalAmount) {
      return res.status(400).json({ message: "To'lov balansi noto'g'ri: paid + debt !== total" });
    }

    const order = new Order({ ...req.body, paidAmount, debtAmount });
    await order.save();

    // Agar bu qarzli buyurtma bo‘lsa – Debtor yangilash yoki yaratish
    if (paymentType === "debt" && debtAmount > 0) {
      if (!date_returned) {
        return res.status(400).json({ message: "Qarz buyurtmalar uchun 'date_returned' majburiy." });
      }

      // Mavjud qarzdorlikni tekshirish (shu client va branch uchun, hali yopilmagan)
      let existingDebtor = await Debtor.findOne({
        client,
        branch,
        status: { $ne: "paid" }
      });

      if (existingDebtor) {
        existingDebtor.totalDebt += debtAmount;
        existingDebtor.remainingDebt += debtAmount;
        existingDebtor.description += `\n[+${debtAmount?.toLocaleString()} so'm] Yangi buyurtma`;
        if (new Date(date_returned) > new Date(existingDebtor.date_returned)) {
          existingDebtor.date_returned = date_returned;
        }
        await existingDebtor.save();
      } else {
        const newDebtor = new Debtor({
          client,
          branch,
          order: order._id,
          totalDebt: debtAmount,
          paidAmount: 0,
          remainingDebt: debtAmount,
          description: req.body.notes || "",
          date_returned,
          status: "pending",
        });
        await newDebtor.save();
      }

      // Mijozning umumiy qarzini yangilash
      await Client.findByIdAndUpdate(client, { $inc: { debt: debtAmount } });
    }

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// GET /orders
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { client, branch, orderType, startDate, endDate, date_returned } = req.query;
    let query = { isDeleted: false };
    if (client) query.client = client;
    if (branch) query.branch = branch;
    if (orderType) query.orderType = orderType;
    if (date_returned) query.date_returned = date_returned;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
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

// GET /orders/:id
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, isDeleted: false })
      .populate("client")
      .populate("branch")
      .populate("products.product");
    if (!order) return res.status(404).json({ message: "Заказ не найден" });
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /orders/:id
router.patch("/:id", authMiddleware, orderValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Заказ не найден" });

    const { paidAmount = 0, debtAmount = 0, totalAmount, paymentType, date_returned } = req.body;
    if (paidAmount + debtAmount !== totalAmount) {
      return res.status(400).json({ message: "To'lov balansi noto'g'ri: paid + debt !== total" });
    }

    const oldDebt = order.debtAmount || 0;
    const newDebt = debtAmount;

    // Qarzdorlik o‘zgarishini hisoblash
    const debtDiff = newDebt - oldDebt;

    // Mijozning qarzini yangilash
    if (debtDiff !== 0) {
      const client = await Client.findById(order.client);
      if (client) {
        client.debt += debtDiff;
        await client.save();
      }
    }

    // Debtor hujjatini yangilash yoki yaratish
    if (paymentType === "debt" && newDebt > 0) {
      let debtor = await Debtor.findOne({ order: order._id });

      if (debtor) {
        debtor.totalDebt = newDebt;
        debtor.remainingDebt = newDebt - debtor.paidAmount;
        debtor.description = req.body.notes || "";
        if (date_returned) debtor.date_returned = date_returned;
        debtor.status = debtor.remainingDebt <= 0 ? "paid" : debtor.paidAmount > 0 ? "partial" : "pending";
        await debtor.save();
      } else {
        if (!date_returned) {
          return res.status(400).json({ message: "Qarz buyurtmalar uchun 'date_returned' majburiy." });
        }

        const newDebtor = new Debtor({
          client: order.client,
          branch: order.branch,
          order: order._id,
          totalDebt: newDebt,
          paidAmount: 0,
          remainingDebt: newDebt,
          description: req.body.notes || "",
          date_returned,
          status: "pending",
        });
        await newDebtor.save();
      }
    }

    Object.assign(order, req.body);
    await order.save();

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// GET /orders/stats/summary
router.get("/stats/summary", authMiddleware, async (req, res) => {
  try {
    const { branch, startDate, endDate } = req.query;
    let match = { isDeleted: false };
    if (branch) match.branch = branch;
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const [orderStats, todayOrders, productsCount] = await Promise.all([
      Order.aggregate([{ $match: match }, {
        $group: {
          _id: null,
          totalAmount: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$paidAmount" },
          totalDebt: { $sum: "$debtAmount" },
        },
      }]),

      Order.aggregate([{ $match: { ...match, createdAt: { $gte: today, $lt: tomorrow } } },
      { $group: { _id: null, todaySales: { $sum: "$paidAmount" } } }]),

      Order.distinct("products.product", match).then((products) => products.length),
    ]);

    const stats = {
      todaySales: todayOrders[0]?.todaySales || 0,
      totalPaid: orderStats[0]?.totalPaid || 0,
      totalDebt: orderStats[0]?.totalDebt || 0,
      productsCount,
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /orders/:id
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Заказ не найден" });
    if (order.isDeleted) return res.status(400).json({ message: "Заказ уже удалён" });

    if (order.paymentType === "debt" && order.debtAmount > 0) {
      const client = await Client.findById(order.client);
      if (client) {
        client.debt -= order.debtAmount;
        await client.save();
      }
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
