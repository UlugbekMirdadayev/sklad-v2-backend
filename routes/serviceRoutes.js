const express = require("express");
const router = express.Router();
const Service = require("../models/services/service.model");
const Transaction = require("../models/transactions/transaction.model");
const Client = require("../models/clients/client.model");
/**
 * @swagger
 * tags:
 *   name: Service
 *   description: Сервисные услуги
 */

/**
 * @swagger
 * /api/services:
 *   post:
 *     summary: Создать сервисную услугу
 *     tags: [Service]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Услуга создана
 *       400:
 *         description: Ошибка валидации
 *   get:
 *     summary: Получить список сервисных услуг
 *     tags: [Service]
 *     parameters:
 *       - in: query
 *         name: branch
 *         schema:
 *           type: string
 *         description: ID филиала
 *       - in: query
 *         name: serviceType
 *         schema:
 *           type: string
 *         description: Тип услуги
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *         description: Приоритет
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Страница
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Лимит
 *     responses:
 *       200:
 *         description: Список услуг
 */

/**
 * @swagger
 * /api/services/{id}:
 *   get:
 *     summary: Получить услугу по ID
 *     tags: [Service]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID услуги
 *     responses:
 *       200:
 *         description: Услуга найдена
 *       404:
 *         description: Услуга не найдена
 *   put:
 *     summary: Обновить услугу по ID
 *     tags: [Service]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID услуги
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Услуга обновлена
 *       404:
 *         description: Услуга не найдена
 *   delete:
 *     summary: Удалить услугу (soft delete)
 *     tags: [Service]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID услуги
 *     responses:
 *       200:
 *         description: Услуга удалена
 *       404:
 *         description: Услуга не найдена
 */

// CREATE a new service
router.post("/", async (req, res) => {
  try {
    const products = (req.body.products || []).map((i) => ({
      product: i.product,
      price: i.price,
      quantity: i.quantity,
    }));

    let serviceIndex = 1;
    let visitIndex = 1;
    if (req.body.client) {
      const count = await Service.countDocuments({
        client: req.body.client,
        isDeleted: false,
      });
      serviceIndex = count + 1;

      const client = await Client.findById(req.body.client);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      // Обновляем serviceIndex клиента
      client.serviceIndex = serviceIndex;

      // Увеличиваем и сохраняем visitIndex клиента
      client.visitIndex = (client.visitIndex || 0) + 1;
      visitIndex = client.visitIndex;

      await client.save();
    }

    const service = new Service({
      ...req.body,
      car: {
        model: req.body.newCarModel || req.body.car?.model,
        plateNumber: req.body.newCarPlate || req.body.car?.plateNumber,
      },
      products,
      serviceIndex,
      visitIndex, // сохраняем номер визита клиента в услуге
    });
    await service.save();

    // Transaction yaratish
    try {
      await Transaction.create({
        type: "service",
        amount: service.totalPrice || { usd: 0, uzs: 0 },
        paymentType: "cash", // Default, kerak bo'lsa req.body'dan olish mumkin
        description: `Service #${service._id} - ${
          service.serviceType || "Xizmat"
        }`,
        relatedModel: "Service",
        relatedId: service._id,
        client: service.client || null,
        branch: service.branch || null,
        createdBy: service.createdBy || null,
      });
    } catch (transactionError) {
      console.error(
        "Transaction yaratishda xatolik:",
        transactionError.message
      );
    }

    await service.populate({ path: "products.product" });
    res.status(201).json(service);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// READ all services with filtering and pagination
router.get("/", async (req, res) => {
  try {
    const {
      branch,
      serviceType,
      priority,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = { isDeleted: false }; // Only show non-deleted services
    if (branch) query.branch = branch;
    if (serviceType) query.serviceType = serviceType;
    if (priority) query.priority = priority;

    // Фильтрация по totalPrice.usd/uzs
    if (req.query.totalPriceUsdMin)
      query["totalPrice.usd"] = { $gte: Number(req.query.totalPriceUsdMin) };
    if (req.query.totalPriceUsdMax)
      query["totalPrice.usd"] = {
        ...(query["totalPrice.usd"] || {}),
        $lte: Number(req.query.totalPriceUsdMax),
      };
    if (req.query.totalPriceUzsMin)
      query["totalPrice.uzs"] = { $gte: Number(req.query.totalPriceUzsMin) };
    if (req.query.totalPriceUzsMax)
      query["totalPrice.uzs"] = {
        ...(query["totalPrice.uzs"] || {}),
        $lte: Number(req.query.totalPriceUzsMax),
      };

    // Сортировка по totalPrice.usd/uzs поддерживается
    const sortField = ["totalPrice.usd", "totalPrice.uzs"].includes(sortBy)
      ? sortBy
      : sortBy;
    const services = await Service.find(query)
      .populate("branch createdBy client car.model products.product")
      .sort({ [sortField]: sortOrder === "desc" ? -1 : 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Service.countDocuments(query);

    res.json({
      services,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      total,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// READ one service by ID
router.get("/:id", async (req, res) => {
  try {
    const service = await Service.findOne({
      _id: req.params.id,
      isDeleted: false,
    }).populate("branch createdBy client");
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE a service
router.put("/:id", async (req, res) => {
  try {
    // Пересчет totalPrice при обновлении
    const products = (req.body.products || []).map((i) => ({
      product: i.product,
      price: i.price,
      quantity: i.quantity,
    }));

    const updateData = {
      ...req.body,
      products,
    };
    const service = await Service.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      updateData,
      {
        new: true,
        runValidators: true,
      }
    );
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json(service);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE a service (soft delete)
router.delete("/:id", async (req, res) => {
  try {
    const service = await Service.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      {
        isDeleted: true,
        isActive: false,
      },
      { new: true }
    );
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json({ message: "Service deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports = router;
