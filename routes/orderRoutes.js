const express = require("express");
const router = express.Router();
const Order = require("../models/orders/order.model");
const Transaction = require("../models/transactions/transaction.model");
const Debtor = require("../models/debtors/debtor.model");
const Client = require("../models/clients/client.model");
const Branch = require("../models/branches/branch.model");
const Product = require("../models/products/product.model");
const { body, validationResult } = require("express-validator");
const clientModel = require("../models/clients/client.model");
const TelegramBot = require("node-telegram-bot-api");
const TELEGRAM_TOKEN = "8178295781:AAHsA6ZRWFrYhXItqb1iPHskoJGweMoqk_I";
const TELEGRAM_CHAT_ID = "-1002798343078"; // o'zingizning chat_id yoki group_id
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const { emitNewOrder, emitOrderUpdate } = require("../utils/socketEvents");
const smsNotificationService = require("../services/smsNotificationService");

// Order validation
const orderValidation = [
  body("client")
    .optional({
      nullable: true,
    })
    .isMongoId()
    .withMessage("Неверный ID клиента"),
  body("branch").isMongoId().withMessage("Неверный ID филиала"),
  body("products").isArray().withMessage("Продукты должны быть массивом"),
  body("products.*.product").isMongoId().withMessage("Неверный ID продукта"),
  body("products.*.quantity")
    .isNumeric()
    .withMessage("Количество должно быть числом"),
  body("products.*.price").isNumeric().withMessage("Цена должна быть числом"),
  body("totalAmount").custom((value) => {
    if (!value || typeof value !== "object")
      throw new Error("totalAmount должен быть объектом {usd, uzs}");
    if (typeof value.usd !== "number" || typeof value.uzs !== "number")
      throw new Error("totalAmount.usd и totalAmount.uzs должны быть числами");
    return true;
  }),
  body("paidAmount").custom((value) => {
    if (!value || typeof value !== "object")
      throw new Error("paidAmount должен быть объектом {usd, uzs}");
    if (typeof value.usd !== "number" || typeof value.uzs !== "number")
      throw new Error("paidAmount.usd и paidAmount.uzs должны быть числами");
    return true;
  }),
  body("debtAmount").custom((value) => {
    if (!value || typeof value !== "object")
      throw new Error("debtAmount должен быть объектом {usd, uzs}");
    if (typeof value.usd !== "number" || typeof value.uzs !== "number")
      throw new Error("debtAmount.usd и debtAmount.uzs должны быть числами");
    return true;
  }),
  body("profitAmount")
    .optional()
    .custom((value) => {
      if (value && typeof value !== "object")
        throw new Error("profitAmount должен быть объектом {usd, uzs}");
      if (
        value &&
        (typeof value.usd !== "number" || typeof value.uzs !== "number")
      )
        throw new Error(
          "profitAmount.usd и profitAmount.uzs должны быть числами"
        );
      return true;
    }),
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
router.post("/", orderValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });
    const {
      totalAmount,
      paidAmount = { usd: 0, uzs: 0 },
      debtAmount = { usd: 0, uzs: 0 },
      paymentType,
      date_returned,
      client: clientId,
      branch,
      products,
      status = "pending",
      km = 0,
    } = req.body;
    const client = await clientModel.findById(clientId);

    // Har bir mahsulot uchun foyda hisobini qo'shamiz
    let profitAmount = { usd: 0, uzs: 0 };
    for (let orderProduct of products) {
      const product = await Product.findById(orderProduct.product);
      if (!product) {
        return res.status(404).json({
          message: `Продукт с ID ${orderProduct.product} не найден`,
        });
      }

      // costPrice va profit hisobini qo'shamiz
      orderProduct.costPrice = product.costPrice;
      orderProduct.profit =
        (orderProduct.price - product.costPrice) * orderProduct.quantity;

      // Umumiy foyda hisobini qo'shamiz (mahsulot valyutasiga qarab)
      if (product.currency === "USD") {
        profitAmount.usd += orderProduct.profit;
      } else {
        profitAmount.uzs += orderProduct.profit;
      }
    }

    // Находим машину в массиве cars клиента
    let carObject = null;
    if (client && client.cars && req.body.car) {
      const foundCar = client.cars.find(
        (car) => car._id.toString() === req.body.car.toString()
      );
      if (foundCar) {
        carObject = foundCar.toObject ? foundCar.toObject() : foundCar;
      }
    }

    // Вычисляем индекс заказа для сегодняшнего дня (до создания order)
    const currentDate = new Date();
    const startOfDay = new Date(currentDate);
    startOfDay.setHours(0, 0, 0, 0);

    const dailyQuery = {
      isDeleted: false,
      createdAt: { $gte: startOfDay, $lte: currentDate },
    };
    if (clientId) dailyQuery.client = clientId;
    if (branch) dailyQuery.branch = branch;

    const index = await Order.countDocuments(dailyQuery);

    // Product quantityni faqat "completed" statusda kamaytirish
    if (status === "completed") {
      for (const orderProduct of products) {
        const product = await Product.findById(orderProduct.product);
        if (product.quantity < orderProduct.quantity) {
          return res.status(400).json({
            message: `Недостаточно товара ${product.name}. Доступно: ${product.quantity}, запрошено: ${orderProduct.quantity}`,
          });
        }
        product.quantity -= orderProduct.quantity;
        await product.save();
      }
    }

    // Создаем заказ с правильным carObject
    const order = new Order({
      client: clientId,
      branch,
      products,
      totalAmount,
      paidAmount,
      debtAmount,
      profitAmount,
      paymentType,
      date_returned,
      notes: req.body.notes,
      status,
      car: carObject, // Сохраняем объект машины, а не ID
      km,
    });

    await order.save();

    // Populate branch and products.product after saving
    await order.populate([
      { path: "branch" },
      { path: "products.product" },
      { path: "client" },
    ]);

    // Transaction yaratish
    try {
      await Transaction.create({
        type: "order",
        amount: paidAmount,
        paymentType: paymentType === "debt" ? "debt" : paymentType,
        description: `Order #${order._id} - ${products.length} mahsulot`,
        relatedModel: "Order",
        relatedId: order._id,
        client: clientId || null,
        branch: branch,
        createdBy: req.user?.id || null,
      });
    } catch (transactionError) {
      console.error(
        "Transaction yaratishda xatolik:",
        transactionError.message
      );
    }

    // Telegramga xabar yuborish
    const isBranch = await Branch.findById(branch);
    const statusName = {
      pending: "Kutilmoqda",
      completed: "Yakunlandi",
      cancelled: "Bekor qilindi",
    };
    try {
      let msg = `🆕 Yangi buyurtma!\n`;
      msg += `Mijoz: ${client?.fullName || "Noma'lum"}\n`;
      msg += `Filial: ${isBranch.name}\n`;
      msg += `Status: ${statusName[status]}\n`;
      msg += `Umumiy summa: ${totalAmount.usd} USD, ${totalAmount.uzs} UZS\n`;
      msg += `Foyda: ${profitAmount.usd?.toLocaleString(2) || 0} USD, ${
        profitAmount.uzs?.toLocaleString(2) || 0
      } UZS\n`;
      msg += `Mahsulotlar:\n`;
      for (const p of products) {
        const prod = await Product.findById(p.product);
        msg += `- ${prod?.name || p.product} x ${p.quantity} ${prod.unit} (${
          p.price
        } ${prod.currency}) - Foyda: ${p.profit?.toLocaleString(2) || 0} ${
          prod.currency
        }\n`;
      }
      await bot.sendMessage(TELEGRAM_CHAT_ID, msg);
    } catch (err) {
      console.error("Telegramga xabar yuborilmadi:", err.message);
    }

    // Qarzdorlikni faqat "completed" statusda mijozga qo'shish
    const debtTotal = (debtAmount.usd || 0) + (debtAmount.uzs || 0);
    if (paymentType === "debt" && debtTotal > 0) {
      if (!date_returned) {
        return res.status(400).json({
          message: "Qarz buyurtmalar uchun 'date_returned' majburiy.",
        });
      }

      // Debtor record (har doim yoziladi, lekin mijozga debt faqat completed bo'lsa)

      if (clientId) {
        let existingDebtor = await Debtor.findOne({
          client: clientId,
          branch,
          status: { $ne: "paid" },
        });

        if (existingDebtor) {
          existingDebtor.totalDebt = {
            usd: (existingDebtor.totalDebt?.usd || 0) + (debtAmount.usd || 0),
            uzs: (existingDebtor.totalDebt?.uzs || 0) + (debtAmount.uzs || 0),
          };
          existingDebtor.remainingDebt = {
            usd:
              (existingDebtor.remainingDebt?.usd || 0) + (debtAmount.usd || 0),
            uzs:
              (existingDebtor.remainingDebt?.uzs || 0) + (debtAmount.uzs || 0),
          };
          existingDebtor.description += `\n[+${debtAmount.usd || 0} USD, +${
            debtAmount.uzs || 0
          } UZS] Yangi buyurtma`;
          if (
            new Date(date_returned) > new Date(existingDebtor.date_returned)
          ) {
            existingDebtor.date_returned = date_returned;
          }
          await existingDebtor.save();
        } else {
          const newDebtor = new Debtor({
            client: clientId,
            branch,
            order: order._id,
            totalDebt: debtAmount,
            paidAmount: { usd: 0, uzs: 0 },
            remainingDebt: debtAmount,
            description: req.body.notes || "",
            date_returned,
            status: "pending",
          });
          await newDebtor.save();
        }

        // Client.debt faqat completed bo'lsa
        if (status === "completed") {
          await Client.findByIdAndUpdate(clientId, {
            $inc: {
              "debt.usd": debtAmount.usd || 0,
              "debt.uzs": debtAmount.uzs || 0,
            },
          });
        }
      }
    }

    // Отправить Socket.IO событие о новом заказе
    const io = req.app.get("io");
    if (io) {
      // Создаем объект заказа с индексом для отправки
      const orderWithIndex = {
        ...order.toObject(),
        index,
        car: carObject, // Используем уже сформированный carObject
      };

      emitNewOrder(io, orderWithIndex);
    }

    // Отправляем SMS о создании заказа
    try {
      smsNotificationService
        .sendOrderCreatedSMS(order._id)
        .then((result) => {
          console.log(
            `Yangi buyurtma ${order._id} yaratildi. SMS yuborish natijasi:`,
            result
          );
        })
        .catch((error) => {
          console.error(
            `Buyurtma ${order._id} uchun SMS yuborishda xatolik:`,
            error
          );
        });
    } catch (smsError) {
      console.error(
        `Buyurtma ${order._id} uchun SMS xizmatini chaqirishda xatolik:`,
        smsError
      );
    }

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /orders
router.get("/", async (req, res) => {
  try {
    const {
      client,
      branch,
      startDate,
      endDate,
      date_returned,
      page = 1,
      limit = 10,
      km,
    } = req.query;
    let query = { isDeleted: false };
    if (client) query.client = client;
    if (branch) query.branch = branch;
    if (date_returned) query.date_returned = date_returned;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    if (km) query.km = km;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("branch")
        .populate("products.product")
        .populate({
          path: "car",
          populate: {
            path: "model",
          },
        })
        .populate({
          path: "client",
          populate: {
            path: "cars.model",
          },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Order.countDocuments(query),
    ]);

    // Har bir order uchun index hisoblash (kunlik nechanchi order)
    const ordersWithIndex = await Promise.all(
      orders.map(async (order) => {
        const startOfDay = new Date(order.createdAt);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(order.createdAt);
        endOfDay.setHours(23, 59, 59, 999);

        const dailyQuery = {
          isDeleted: false,
          createdAt: { $gte: startOfDay, $lte: order.createdAt },
        };
        if (client) dailyQuery.client = client;
        if (branch) dailyQuery.branch = branch;
        if (date_returned) dailyQuery.date_returned = date_returned;

        const index = await Order.countDocuments(dailyQuery);

        return {
          ...order.toObject(),
          index,
        };
      })
    );

    res.json({
      orders: ordersWithIndex,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/bestselling", async (req, res) => {
  try {
    const topProducts = await Order.aggregate([
      { $match: { isDeleted: false, status: "completed" } }, // faqat yakunlangan buyurtmalar
      { $unwind: "$products" },
      {
        $group: {
          _id: "$products.product",
          totalSold: { $sum: "$products.quantity" },
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $addFields: {
          product: {
            $mergeObjects: ["$product", { totalSold: "$totalSold" }],
          },
        },
      },
      {
        $replaceRoot: {
          newRoot: "$product",
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: 20 }, // eng ko‘p 20 ta mahsulot
    ]);

    res.status(200).json(topProducts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /orders/:id
router.get("/:id", async (req, res) => {
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
router.patch("/:id", orderValidation, async (req, res) => {
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
      km,
    } = req.body;

    // Agar products o'zgartirilayotgan bo'lsa, foyda hisobini qayta hisoblaymiz
    let profitAmount = { usd: 0, uzs: 0 };
    if (products) {
      for (let orderProduct of products) {
        const product = await Product.findById(orderProduct.product);
        if (!product) {
          return res.status(404).json({
            message: `Продукт с ID ${orderProduct.product} не найден`,
          });
        }

        // costPrice va profit hisobini qo'shamiz
        orderProduct.costPrice = product.costPrice;
        orderProduct.profit =
          (orderProduct.price - product.costPrice) * orderProduct.quantity;

        // Umumiy foyda hisobini qo'shamiz (mahsulot valyutasiga qarab)
        if (product.currency === "USD") {
          profitAmount.usd += orderProduct.profit;
        } else {
          profitAmount.uzs += orderProduct.profit;
        }
      }
    } else {
      // Agar products o'zgartirilmayotgan bo'lsa, mavjud profitAmount ni saqlaymiz
      profitAmount = order.profitAmount || { usd: 0, uzs: 0 };
    }
    // if (paidAmount + debtAmount !== totalAmount) {
    //   return res
    //     .status(400)
    //     .json({ message: "To'lov balansi noto'g'ri: paid + debt !== total" });
    // }

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
    if (products) {
      order.products = products;
    }
    order.profitAmount = profitAmount;
    await order.save();

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /orders/:id/status
router.patch(
  "/:id/status",
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

      const order = await Order.findById(req.params.id).populate("client");
      if (!order) return res.status(404).json({ message: "Заказ не найден" });

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

      // Отправить Socket.IO событие об обновлении заказа
      const io = req.app.get("io");
      if (io) {
        // Вычисляем индекс заказа для сегодняшнего дня
        const startOfDay = new Date(order.createdAt);
        startOfDay.setHours(0, 0, 0, 0);

        const dailyQuery = {
          isDeleted: false,
          createdAt: { $gte: startOfDay, $lte: order.createdAt },
        };
        if (order.client) dailyQuery.client = order.client;
        if (order.branch) dailyQuery.branch = order.branch;

        const index = await Order.countDocuments(dailyQuery);

        // Находим машину в массиве cars клиента или используем уже сохраненный объект
        let carObject = null;

        // Если car уже объект (новая логика), используем его
        if (order.car && typeof order.car === "object") {
          carObject = order.car;
        }
        // Если car это ID (старая логика), ищем в массиве cars клиента
        else if (order.client && order.client.cars && order.car) {
          const foundCar = order.client.cars.find(
            (car) => car._id.toString() === order.car.toString()
          );
          if (foundCar) {
            carObject = foundCar.toObject ? foundCar.toObject() : foundCar;
          }
        }

        // Добавляем индекс и объект машины к объекту заказа
        const orderWithIndex = {
          ...order.toObject(),
          index,
          car: carObject,
        };

        emitOrderUpdate(io, orderWithIndex);
      }

      res.json(order);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// GET /orders/stats/summary
router.get("/stats/summary", async (req, res) => {
  try {
    const { branch, startDate, endDate } = req.query;
    let match = { status: "completed", isDeleted: false }; // Faqat completed va o'chirilmagan
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

    // Faqat completed orderlar
    const orders = await Order.find(match).populate("products.product");

    let totalAmount = { usd: 0, uzs: 0 };
    let totalPaid = { usd: 0, uzs: 0 };
    let totalDebt = { usd: 0, uzs: 0 };
    let totalProfit = { usd: 0, uzs: 0 };
    let totalSales = { usd: 0, uzs: 0 };

    for (const order of orders) {
      totalAmount.usd += order.totalAmount?.usd || 0;
      totalAmount.uzs += order.totalAmount?.uzs || 0;
      totalPaid.usd += order.paidAmount?.usd || 0;
      totalPaid.uzs += order.paidAmount?.uzs || 0;
      totalDebt.usd += order.debtAmount?.usd || 0;
      totalDebt.uzs += order.debtAmount?.uzs || 0;
      totalProfit.usd += order.profitAmount?.usd || 0;
      totalProfit.uzs += order.profitAmount?.uzs || 0;
      totalSales.usd += order.paidAmount?.usd || 0;
      totalSales.uzs += order.paidAmount?.uzs || 0;
    }

    // Bugungi savdo (completed orderlar)
    const todayOrders = await Order.find({
      ...match,
      createdAt: { $gte: today, $lt: tomorrow },
    });

    let todaySales = { usd: 0, uzs: 0 };
    let todayProfit = { usd: 0, uzs: 0 };
    for (const order of todayOrders) {
      todaySales.usd += order.paidAmount?.usd || 0;
      todaySales.uzs += order.paidAmount?.uzs || 0;
      todayProfit.usd += order.profitAmount?.usd || 0;
      todayProfit.uzs += order.profitAmount?.uzs || 0;
    }

    // Unikal mahsulotlar soni (faqat completed)
    const productsCount = await Order.distinct("products.product", match).then(
      (products) => products.length
    );

    const stats = {
      todaySales,
      todayProfit,
      totalAmount,
      totalPaid,
      totalDebt,
      totalProfit,
      productsCount,
      totalSales,
      totalOrders: await Order.countDocuments(match),
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /orders/:id (soft delete)
router.delete("/:id", async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, isDeleted: false });
    if (!order) return res.status(404).json({ message: "Заказ не найден" });

    // Agar order completed bo'lsa, product quantityni qaytarish
    if (order.status === "completed") {
      for (const orderProduct of order.products) {
        const product = await Product.findById(orderProduct.product);
        if (product) {
          product.quantity += orderProduct.quantity;
          await product.save();
        }
      }

      // Agar debt bo'lsa, mijozdan debtni kamaytirish
      if (order.paymentType === "debt" && order.debtAmount) {
        const clientDoc = await Client.findById(order.client);
        if (clientDoc) {
          clientDoc.debt = {
            usd: (clientDoc.debt?.usd || 0) - (order.debtAmount?.usd || 0),
            uzs: (clientDoc.debt?.uzs || 0) - (order.debtAmount?.uzs || 0),
          };
          await clientDoc.save();
        }
      }
    }

    // Soft delete
    order.isDeleted = true;
    await order.save();

    res.json({ message: "Заказ удален" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
