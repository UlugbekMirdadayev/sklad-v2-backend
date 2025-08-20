const express = require("express");
const router = express.Router();
const Service = require("../models/services/service.model");
const Transaction = require("../models/transactions/transaction.model");
const Client = require("../models/clients/client.model");
const { emitNewService, emitServiceUpdate } = require("../utils/socketEvents");
const smsNotificationService = require('../services/smsNotificationService');
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
      client.serviceIndex = serviceIndex;
      client.visitIndex = (client.visitIndex || 0) + 1;
      visitIndex = client.visitIndex;

      await client.save();
    }

    // car всегда объект, даже если пустой
    const car = {
      model:
        req.body.newCarModel !== undefined && req.body.newCarModel !== ""
          ? req.body.newCarModel
          : req.body.car?.model !== undefined && req.body.car?.model !== ""
          ? req.body.car.model
          : null,
      plateNumber:
        req.body.newCarPlate !== undefined
          ? req.body.newCarPlate
          : req.body.car?.plateNumber !== undefined
          ? req.body.car.plateNumber
          : "",
    };

    const service = new Service({
      client: req.body.client,
      branch: req.body.branch,
      createdBy: req.body.createdBy,
      description: req.body.description || "",
      serviceType: req.body.serviceType || "Xizmat",
      priority: req.body.priority || "medium",
      status: req.body.status || "new",
      returnKm: req.body.returnKm || 0,
      currentKm: req.body.currentKm || 0,
      reCheckDate: req.body.reCheckDate,
      totalPrice: req.body.totalPrice || { usd: 0, uzs: 0 },
      discount: req.body.discount || { usd: 0, uzs: 0 },
      car,
      products,
      serviceIndex,
      visitIndex,
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
    
    // Отправить Socket.IO событие о новой услуге
    const io = req.app.get('io');
    if (io) {
      emitNewService(io, service);
    }
    
    // Всегда отправляем SMS о создании услуги
    try {
      smsNotificationService.sendServiceCreatedSMS(service._id)
        .then(result => {
          console.log(`New service ${service._id} yaratildi. SMS yuborish natijasi:`, result);
        })
        .catch(error => {
          console.error(`New service ${service._id} uchun SMS yuborishda xatolik:`, error);
        });
    } catch (smsError) {
      console.error(`New service ${service._id} uchun SMS xizmatini chaqirishda xatolik:`, smsError);
    }
    
    // Если услуга создана сразу со статусом "completed", отправляем дополнительное SMS
    if (service.status === 'completed') {
      try {
        smsNotificationService.sendServiceCompletionSMS(service._id)
          .then(result => {
            console.log(`New service ${service._id} yakunlandi. SMS yuborish natijasi:`, result);
          })
          .catch(error => {
            console.error(`New service ${service._id} uchun yakunlash SMS yuborishda xatolik:`, error);
          });
      } catch (smsError) {
        console.error(`New service ${service._id} uchun yakunlash SMS xizmatini chaqirishda xatolik:`, smsError);
      }
    }
    
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
      returnKm,
      currentKm
    } = req.query;

    const query = { isDeleted: false }; // Only show non-deleted services
    if (branch) query.branch = branch;
    if (serviceType) query.serviceType = serviceType;
    if (priority) query.priority = priority;
    if (returnKm) query.returnKm = returnKm;
    if (currentKm) query.currentKm = currentKm;

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

    // Har bir service uchun index hisoblash (kunlik nechanchi service)
    // index = shu kundagi (createdAt bo'yicha) nechanchi service
    const servicesWithIndex = await Promise.all(
      services.map(async (service) => {
        const startOfDay = new Date(service.createdAt);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(service.createdAt);
        endOfDay.setHours(23, 59, 59, 999);

        const dailyQuery = {
          isDeleted: false,
          createdAt: { $gte: startOfDay, $lte: service.createdAt },
        };
        if (branch) dailyQuery.branch = branch;
        if (serviceType) dailyQuery.serviceType = serviceType;
        if (priority) dailyQuery.priority = priority;

        // Shu kunga oid va shu servicegacha bo'lganlar soni
        const index = await Service.countDocuments(dailyQuery);

        return {
          ...service.toObject(),
          index, // kunlik index
        };
      })
    );

    res.json({
      services: servicesWithIndex,
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

    // Обрабатываем car объект правильно
    const updateData = {
      ...req.body,
      products,
    };

    // Если передается car объект, проверяем model на пустую строку
    if (updateData.car && updateData.car.model === "") {
      updateData.car.model = null;
    }

    const oldService = await Service.findById(req.params.id);
    if (!oldService) return res.status(404).json({ error: "Service not found" });
    
    const service = await Service.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      updateData,
      {
        new: true,
        runValidators: true,
      }
    );
    if (!service) return res.status(404).json({ error: "Service not found" });
    
    // Отправить Socket.IO событие об обновлении услуги
    const io = req.app.get('io');
    if (io) {
      emitServiceUpdate(io, service);
    }
    
    // Если статус услуги изменился на "completed", отправляем SMS
    if (oldService.status !== 'completed' && service.status === 'completed') {
      try {
        const smsNotificationService = require('../services/smsNotificationService');
        smsNotificationService.sendServiceCompletionSMS(service._id)
          .then(result => {
            console.log(`Service ${service._id} xizmati yakunlandi. SMS yuborish natijasi:`, result);
          })
          .catch(error => {
            console.error(`Service ${service._id} uchun SMS yuborishda xatolik:`, error);
          });
      } catch (smsError) {
        console.error(`Service ${service._id} uchun SMS xizmatini chaqirishda xatolik:`, smsError);
      }
    }
    
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
