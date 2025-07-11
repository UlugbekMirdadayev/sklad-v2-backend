const express = require("express");
const router = express.Router();
const Service = require("../models/services/service.model");
const ServiceList = require("../models/services/servicelist.model");

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
 *         name: status
 *         schema:
 *           type: string
 *         description: Статус услуги
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
    let servicesInput = req.body.services || [];
    // Получаем все ServiceList по id
    const serviceIds = servicesInput.map((s) => s.service);
    const foundServices = await ServiceList.find({ _id: { $in: serviceIds } });
    if (foundServices.length !== serviceIds.length) {
      return res.status(400).json({ error: "Некоторые услуги не найдены в ServiceList" });
    }
    // Подставляем price из ServiceList, если не указан
    servicesInput = servicesInput.map((s) => {
      const found = foundServices.find((f) => f._id.toString() === s.service);
      return {
        ...s,
        price: typeof s.price === "number" ? s.price : found.price,
        quantity: typeof s.quantity === "number" ? s.quantity : 1,
      };
    });
    const service = new Service({
      ...req.body,
      services: servicesInput,
    });
    await service.save();
    await service.populate({ path: "services.service" });
    res.status(201).json(service);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// READ all services with filtering and pagination
router.get("/", async (req, res) => {
  try {
    const {
      status,
      branch,
      serviceType,
      priority,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = { isDeleted: false }; // Only show non-deleted services
    if (status) query.status = status;
    if (branch) query.branch = branch;
    if (serviceType) query.serviceType = serviceType;
    if (priority) query.priority = priority;

    const services = await Service.find(query)
      .populate("branch createdBy client")
      .populate("services.service")
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
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
    })
      .populate("branch createdBy client")
      .populate("services.service");
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE a service
router.put("/:id", async (req, res) => {
  try {
    const service = await Service.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      {
        ...req.body,
      },
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
