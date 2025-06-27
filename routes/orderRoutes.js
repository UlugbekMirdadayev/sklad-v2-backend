const express = require("express");
const router = express.Router();
const Order = require("../models/orders/order.model");
const Debtor = require("../models/debtors/debtor.model");
const Client = require("../models/clients/client.model");
const Product = require("../models/products/product.model");
const authMiddleware = require("../middleware/authMiddleware");
const { body, validationResult } = require("express-validator");

// Order validation
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
  body("date_returned")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("Noto'g'ri sana formati"),
];

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Управление заказами
 */

/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Создать заказ
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               client:
 *                 type: string
 *               branch:
 *                 type: string
 *               orderType:
 *                 type: string
 *                 enum: [vip, regular]
 *               products:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     product:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     price:
 *                       type: number
 *               totalAmount:
 *                 type: number
 *               paidAmount:
 *                 type: number
 *               debtAmount:
 *                 type: number
 *               paymentType:
 *                 type: string
 *                 enum: [cash, card, debt]
 *               notes:
 *                 type: string
 *               date_returned:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Заказ создан
 *       400:
 *         description: Ошибка валидации
 */

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: Получить список заказов
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: client
 *         schema:
 *           type: string
 *         description: ID клиента
 *       - in: query
 *         name: branch
 *         schema:
 *           type: string
 *         description: ID филиала
 *       - in: query
 *         name: orderType
 *         schema:
 *           type: string
 *         description: Тип заказа
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Начальная дата
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Конечная дата
 *     responses:
 *       200:
 *         description: Список заказов
 */

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     summary: Получить заказ по ID
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID заказа
 *     responses:
 *       200:
 *         description: Заказ найден
 *       404:
 *         description: Заказ не найден
 *   patch:
 *     summary: Обновить заказ по ID
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID заказа
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               products:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     product:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     price:
 *                       type: number
 *               totalAmount:
 *                 type: number
 *               paidAmount:
 *                 type: number
 *               debtAmount:
 *                 type: number
 *               paymentType:
 *                 type: string
 *                 enum: [cash, card, debt]
 *               notes:
 *                 type: string
 *               date_returned:
 *                 type: string
 *                 format: date
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Заказ обновлен
 *       404:
 *         description: Заказ не найден
 *   delete:
 *     summary: Удалить заказ (soft delete)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID заказа
 *     responses:
 *       200:
 *         description: Заказ удален
 *       404:
 *         description: Заказ не найден
 */

/**
 * @swagger
 * /api/orders/{id}/status:
 *   patch:
 *     summary: Изменить статус заказа
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID заказа
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, completed, cancelled]
 *     responses:
 *       200:
 *         description: Статус обновлен
 *       404:
 *         description: Заказ не найден
 */

/**
 * @swagger
 * /api/orders/stats/summary:
 *   get:
 *     summary: Получить статистику по заказам
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branch
 *         schema:
 *           type: string
 *         description: ID филиала
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Начальная дата
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Конечная дата
 *     responses:
 *       200:
 *         description: Статистика по заказам
 */

// POST /orders
router.post("/", authMiddleware, orderValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });
    const {
      totalAmount,
      paidAmount = 0,
      debtAmount = 0,
      paymentType,
      date_returned,
      client: clientId,
      branch,
      products,
      status = "pending",
    } = req.body;

    if (paidAmount + debtAmount !== totalAmount) {
      return res
        .status(400)
        .json({ message: "To'lov balansi noto'g'ri: paid + debt !== total" });
    }

    // Product quantityni faqat "completed" statusda kamaytirish
    if (status === "completed") {
      for (const orderProduct of products) {
        const product = await Product.findById(orderProduct.product);
        if (!product) {
          return res.status(404).json({
            message: `Продукт с ID ${orderProduct.product} не найден`,
          });
        }
        if (product.quantity < orderProduct.quantity) {
          return res.status(400).json({
            message: `Недостаточно товара ${product.name}. Доступно: ${product.quantity}, запрошено: ${orderProduct.quantity}`,
          });
        }
        product.quantity -= orderProduct.quantity;
        await product.save();
      }
    }

    const order = new Order({
      ...req.body,
      status,
      paidAmount,
      debtAmount,
    });
    await order.save();

    // Qarzdorlikni faqat "completed" statusda mijozga qo'shish
    if (paymentType === "debt" && debtAmount > 0) {
      if (!date_returned) {
        return res.status(400).json({
          message: "Qarz buyurtmalar uchun 'date_returned' majburiy.",
        });
      }

      // Debtor record (har doim yoziladi, lekin mijozga debt faqat completed bo'lsa)
      let existingDebtor = await Debtor.findOne({
        client: clientId,
        branch,
        status: { $ne: "paid" },
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
          client: clientId,
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

      // Client.debt faqat completed bo'lsa
      if (status === "completed") {
        await Client.findByIdAndUpdate(client, { $inc: { debt: debtAmount } });
      }
    }

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /orders
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { client, branch, orderType, startDate, endDate, date_returned } =
      req.query;
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
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Заказ не найден" });
    const {
      paidAmount = 0,
      debtAmount = 0,
      totalAmount,
      paymentType,
      date_returned,
      products,
      status,
      client: clientId,
    } = req.body;
    if (paidAmount + debtAmount !== totalAmount) {
      return res
        .status(400)
        .json({ message: "To'lov balansi noto'g'ri: paid + debt !== total" });
    }

    // Eski productlarni qaytarish agar eski status completed bo'lsa
    if (products && order.status === "completed") {
      for (const oldProduct of order.products) {
        const product = await Product.findById(oldProduct.product);
        if (product) {
          product.quantity += oldProduct.quantity;
          await product.save();
        }
      }
    }
    // Yangi productlarni kamaytirish agar yangi status completed bo'lsa
    let statusToApply = status !== undefined ? status : order.status;
    if (statusToApply === "completed") {
      const newProducts = products || order.products;
      for (const newProduct of newProducts) {
        const product = await Product.findById(newProduct.product);
        if (!product) {
          return res
            .status(404)
            .json({ message: `Продукт с ID ${newProduct.product} не найден` });
        }
        if (product.quantity < newProduct.quantity) {
          return res.status(400).json({
            message: `Недостаточно товара ${product.name}. Доступно: ${product.quantity}, запрошено: ${newProduct.quantity}`,
          });
        }
        product.quantity -= newProduct.quantity;
        await product.save();
      }
    }

    const oldDebt = order.debtAmount || 0;
    const newDebt = debtAmount;
    const oldStatus = order.status;
    const newStatus = statusToApply;

    // Qarzdorlik o‘zgarishini hisoblash: faqat completed -> completed, completed->pending/cancelled, pending->completed
    let debtDiff = 0;
    if (paymentType === "debt") {
      if (oldStatus !== "completed" && newStatus === "completed") {
        // pending->completed: debt qo'shish
        debtDiff = newDebt;
      } else if (oldStatus === "completed" && newStatus !== "completed") {
        // completed->pending/cancelled: debt kamaytirish
        debtDiff = -oldDebt;
      } else if (oldStatus === "completed" && newStatus === "completed") {
        // completed edi, completed bo'lib qoldi: farqini hisobla
        debtDiff = newDebt - oldDebt;
      }
    }

    // Mijozning qarzini yangilash faqat completed bo'lsa yoki completed'dan chiqsa
    if (debtDiff !== 0) {
      const clientDoc = await Client.findById(order.client);
      if (clientDoc) {
        clientDoc.debt += debtDiff;
        await clientDoc.save();
      }
    }

    // Debtor hujjatini yangilash yoki yaratish (har doim)
    if (paymentType === "debt" && newDebt > 0) {
      let debtor = await Debtor.findOne({ order: order._id });

      if (debtor) {
        debtor.totalDebt = newDebt;
        debtor.remainingDebt = newDebt - debtor.paidAmount;
        debtor.description = req.body.notes || "";
        if (date_returned) debtor.date_returned = date_returned;
        debtor.status =
          debtor.remainingDebt <= 0
            ? "paid"
            : debtor.paidAmount > 0
            ? "partial"
            : "pending";
        await debtor.save();
      } else {
        if (!date_returned) {
          return res.status(400).json({
            message: "Qarz buyurtmalar uchun 'date_returned' majburiy.",
          });
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

// PATCH /orders/:id/status
router.patch(
  "/:id/status",
  authMiddleware,
  [
    body("status")
      .isIn(["pending", "completed", "cancelled"])
      .withMessage("Неверный статус заказа"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const order = await Order.findById(req.params.id);
      if (!order) return res.status(404).json({ message: "Заказ не найден" });
      if (order.isDeleted)
        return res.status(400).json({ message: "Заказ удалён" });

      const oldStatus = order.status;
      const { status } = req.body;

      // cancelga o'tsa va avval completed bo'lsa product quantityni qaytarish
      if (status === "cancelled" && oldStatus !== "cancelled") {
        if (oldStatus === "completed") {
          for (const orderProduct of order.products) {
            const product = await Product.findById(orderProduct.product);
            if (product) {
              product.quantity += orderProduct.quantity;
              await product.save();
            }
          }
        }
      }
      // completed ga o'tsa product quantityni kamaytirish
      else if (status === "completed" && oldStatus !== "completed") {
        for (const orderProduct of order.products) {
          const product = await Product.findById(orderProduct.product);
          if (product) {
            if (product.quantity < orderProduct.quantity) {
              return res.status(400).json({
                message: `Недостаточно товара ${product.name}. Доступно: ${product.quantity}, запрошено: ${orderProduct.quantity}`,
              });
            }
            product.quantity -= orderProduct.quantity;
            await product.save();
          }
        }

        // Debt faqat completedga o'tganda qo'shiladi
        if (order.paymentType === "debt" && order.debtAmount > 0) {
          const clientDoc = await Client.findById(order.client);
          if (clientDoc) {
            clientDoc.debt += order.debtAmount;
            await clientDoc.save();
          }
        }
      }
      // canceldan completedga qaytsa ham kamaytirish va debt qo'shish (ya'ni completedga o'tsa har doim)
      else if (oldStatus === "cancelled" && status === "completed") {
        for (const orderProduct of order.products) {
          const product = await Product.findById(orderProduct.product);
          if (product) {
            if (product.quantity < orderProduct.quantity) {
              return res.status(400).json({
                message: `Недостаточно товара ${product.name}. Доступно: ${product.quantity}, запрошено: ${orderProduct.quantity}`,
              });
            }
            product.quantity -= orderProduct.quantity;
            await product.save();
          }
        }
        if (order.paymentType === "debt" && order.debtAmount > 0) {
          const clientDoc = await Client.findById(order.client);
          if (clientDoc) {
            clientDoc.debt += order.debtAmount;
            await clientDoc.save();
          }
        }
      }
      // completed dan boshqa statusga o'tsa (pending yoki cancelled) va debt bo'lsa, debtni kamaytirish
      else if (oldStatus === "completed" && status !== "completed") {
        if (order.paymentType === "debt" && order.debtAmount > 0) {
          const clientDoc = await Client.findById(order.client);
          if (clientDoc) {
            clientDoc.debt -= order.debtAmount;
            await clientDoc.save();
          }
        }
      }

      order.status = status;
      await order.save();

      res.json(order);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

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
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$totalAmount" },
            totalPaid: { $sum: "$paidAmount" },
            totalDebt: { $sum: "$debtAmount" },
          },
        },
      ]),

      Order.aggregate([
        { $match: { ...match, createdAt: { $gte: today, $lt: tomorrow } } },
        { $group: { _id: null, todaySales: { $sum: "$paidAmount" } } },
      ]),

      Order.distinct("products.product", match).then(
        (products) => products.length
      ),
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
    if (order.isDeleted)
      return res.status(400).json({ message: "Заказ уже удалён" });

    // Faqat completed bo'lsa quantityni qaytarish
    if (order.status === "completed") {
      for (const orderProduct of order.products) {
        const product = await Product.findById(orderProduct.product);
        if (product) {
          product.quantity += orderProduct.quantity;
          await product.save();
        }
      }
    }

    // Faqat completed bo'lsa debtni kamaytirish
    if (
      order.status === "completed" &&
      order.paymentType === "debt" &&
      order.debtAmount > 0
    ) {
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
