const express = require("express");
const router = express.Router();
const Debtor = require("../models/debtors/debtor.model");
const Client = require("../models/clients/client.model");
const authMiddleware = require("../middleware/authMiddleware");
const { body, validationResult } = require("express-validator");

/**
 * @swagger
 * tags:
 *   name: Debtors
 *   description: Qarzdorlar boshqaruvi
 */

// Debtor validation
const debtorValidation = [
  body("client").isMongoId().withMessage("Noto'g'ri mijoz ID"),
  body("currentDebt").custom((value) => {
    if (!value || typeof value !== "object")
      throw new Error("currentDebt {usd, uzs} obyekt bo'lishi kerak");
    if (typeof value.usd !== "number" || typeof value.uzs !== "number")
      throw new Error("currentDebt.usd va currentDebt.uzs raqam bo'lishi kerak");
    return true;
  }),
  body("initialDebt").optional().custom((value) => {
    if (value && typeof value !== "object")
      throw new Error("initialDebt {usd, uzs} obyekt bo'lishi kerak");
    if (value && (typeof value.usd !== "number" || typeof value.uzs !== "number"))
      throw new Error("initialDebt.usd va initialDebt.uzs raqam bo'lishi kerak");
    return true;
  }),
  body("nextPayment.amount").optional().custom((value) => {
    if (value && typeof value !== "object")
      throw new Error("nextPayment.amount {usd, uzs} obyekt bo'lishi kerak");
    if (value && (typeof value.usd !== "number" || typeof value.uzs !== "number"))
      throw new Error("nextPayment.amount.usd va uzs raqam bo'lishi kerak");
    return true;
  }),
  body("nextPayment.dueDate")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("Noto'g'ri sana formati"),
  body("description").optional().trim(),
];

/**
 * @swagger
 * /api/debtors:
 *   post:
 *     summary: Yangi qarzdor yaratish
 *     tags: [Debtors]
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
 *               currentDebt:
 *                 type: object
 *                 properties:
 *                   usd:
 *                     type: number
 *                   uzs:
 *                     type: number
 *               nextPayment:
 *                 type: object
 *                 properties:
 *                   amount:
 *                     type: object
 *                     properties:
 *                       usd:
 *                         type: number
 *                       uzs:
 *                         type: number
 *                   dueDate:
 *                     type: string
 *                     format: date
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Qarzdor yaratildi
 *       400:
 *         description: Validation xatosi
 */

// POST /debtors - Yangi qarzdor yaratish
router.post("/", authMiddleware, debtorValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      client,
      currentDebt,
      initialDebt = currentDebt,
      nextPayment,
      description,
    } = req.body;

    // Mijozni tekshirish
    const clientExists = await Client.findById(client);
    if (!clientExists) {
      return res.status(404).json({ message: "Mijoz topilmadi" });
    }

    const debtor = new Debtor({
      client,
      currentDebt,
      initialDebt,
      initialDebtDate: new Date(),
      totalPaid: { usd: 0, uzs: 0 },
      nextPayment: nextPayment || {},
      description: description || "",
    });

    await debtor.save();

    // Mijozning umumiy qarzini yangilash
    await Client.findByIdAndUpdate(client, {
      $inc: {
        "debt.usd": currentDebt.usd || 0,
        "debt.uzs": currentDebt.uzs || 0,
      },
    });

    const populatedDebtor = await Debtor.findById(debtor._id).populate("client");
    res.status(201).json(populatedDebtor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/debtors:
 *   get:
 *     summary: Qarzdorlar ro'yxati
 *     tags: [Debtors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: client
 *         schema:
 *           type: string
 *         description: Mijoz ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, partial, paid, overdue]
 *         description: Holat
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Boshlanish sanasi
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Tugash sanasi
 *     responses:
 *       200:
 *         description: Qarzdorlar ro'yxati
 */

// GET /debtors - Qarzdorlar ro'yxati
router.get("/", async (req, res) => {
  try {
    const { client, status, startDate, endDate } = req.query;
    
    let query = { isDeleted: false };
    if (client) query.client = client;
    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const debtors = await Debtor.find(query)
      .populate("client")
      .sort({ createdAt: -1 });

    res.json(debtors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/debtors/{id}:
 *   get:
 *     summary: Qarzdor ma'lumotlari
 *     tags: [Debtors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Qarzdor ID
 *     responses:
 *       200:
 *         description: Qarzdor ma'lumotlari
 *       404:
 *         description: Qarzdor topilmadi
 */

// GET /debtors/:id - Qarzdor ma'lumotlari
router.get("/:id", async (req, res) => {
  try {
    const debtor = await Debtor.findOne({
      _id: req.params.id,
      isDeleted: false,
    }).populate("client");

    if (!debtor) {
      return res.status(404).json({ message: "Qarzdor topilmadi" });
    }

    res.json(debtor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/debtors/{id}/payment:
 *   post:
 *     summary: Qarz to'lovi
 *     tags: [Debtors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Qarzdor ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               payment:
 *                 type: object
 *                 properties:
 *                   usd:
 *                     type: number
 *                   uzs:
 *                     type: number
 *               nextPayment:
 *                 type: object
 *                 properties:
 *                   amount:
 *                     type: object
 *                     properties:
 *                       usd:
 *                         type: number
 *                       uzs:
 *                         type: number
 *                   dueDate:
 *                     type: string
 *                     format: date
 *     responses:
 *       200:
 *         description: To'lov muvaffaqiyatli
 *       404:
 *         description: Qarzdor topilmadi
 */

// POST /debtors/:id/payment - Qarz to'lovi
router.post("/:id/payment", authMiddleware, async (req, res) => {
  try {
    const { payment, nextPayment } = req.body;

    if (!payment || typeof payment !== "object" || 
        typeof payment.usd !== "number" || typeof payment.uzs !== "number") {
      return res.status(400).json({ 
        message: "To'lov miqdori {usd, uzs} formatida bo'lishi kerak" 
      });
    }

    const debtor = await Debtor.findOne({
      _id: req.params.id,
      isDeleted: false,
    });

    if (!debtor) {
      return res.status(404).json({ message: "Qarzdor topilmadi" });
    }

    // Joriy qarzdan to'lovni ayirish
    debtor.currentDebt.usd = Math.max(0, debtor.currentDebt.usd - payment.usd);
    debtor.currentDebt.uzs = Math.max(0, debtor.currentDebt.uzs - payment.uzs);

    // Umumiy to'lovga qo'shish
    debtor.totalPaid.usd += payment.usd;
    debtor.totalPaid.uzs += payment.uzs;

    // Oxirgi to'lovni yangilash
    debtor.lastPayment = {
      amount: payment,
      date: new Date(),
    };

    // Keyingi to'lovni o'rnatish (agar berilgan bo'lsa)
    if (nextPayment) {
      debtor.nextPayment = nextPayment;
    }

    await debtor.save();

    // Mijozning umumiy qarzini yangilash
    await Client.findByIdAndUpdate(debtor.client, {
      $inc: {
        "debt.usd": -payment.usd,
        "debt.uzs": -payment.uzs,
      },
    });

    const updatedDebtor = await Debtor.findById(debtor._id).populate("client");
    res.json(updatedDebtor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/debtors/{id}:
 *   patch:
 *     summary: Qarzdor ma'lumotlarini yangilash
 *     tags: [Debtors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Qarzdor ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nextPayment:
 *                 type: object
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Yangilandi
 *       404:
 *         description: Qarzdor topilmadi
 */

// PATCH /debtors/:id - Qarzdor ma'lumotlarini yangilash
router.patch("/:id", authMiddleware, async (req, res) => {
  try {
    const debtor = await Debtor.findOne({
      _id: req.params.id,
      isDeleted: false,
    });

    if (!debtor) {
      return res.status(404).json({ message: "Qarzdor topilmadi" });
    }

    const { nextPayment, description } = req.body;

    if (nextPayment) debtor.nextPayment = nextPayment;
    if (description !== undefined) debtor.description = description;

    await debtor.save();

    const updatedDebtor = await Debtor.findById(debtor._id).populate("client");
    res.json(updatedDebtor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/debtors/{id}:
 *   delete:
 *     summary: Qarzdorni o'chirish (soft delete)
 *     tags: [Debtors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Qarzdor ID
 *     responses:
 *       200:
 *         description: O'chirildi
 *       404:
 *         description: Qarzdor topilmadi
 */

// DELETE /debtors/:id - Qarzdorni o'chirish (soft delete)
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const debtor = await Debtor.findOne({
      _id: req.params.id,
      isDeleted: false,
    });

    if (!debtor) {
      return res.status(404).json({ message: "Qarzdor topilmadi" });
    }

    // Mijozning umumiy qarzidan ayirish
    await Client.findByIdAndUpdate(debtor.client, {
      $inc: {
        "debt.usd": -debtor.currentDebt.usd,
        "debt.uzs": -debtor.currentDebt.uzs,
      },
    });

    // Soft delete
    debtor.isDeleted = true;
    debtor.deletedAt = new Date();
    await debtor.save();

    res.json({ message: "Qarzdor o'chirildi" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/debtors/stats/summary:
 *   get:
 *     summary: Qarzdorlik statistikasi
 *     tags: [Debtors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Boshlanish sanasi
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Tugash sanasi
 *     responses:
 *       200:
 *         description: Statistika
 */

// GET /debtors/stats/summary - Qarzdorlik statistikasi
router.get("/stats/summary", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let match = { isDeleted: false };
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const debtors = await Debtor.find(match);

    let totalCurrentDebt = { usd: 0, uzs: 0 };
    let totalPaid = { usd: 0, uzs: 0 };
    let statusCounts = {
      pending: 0,
      partial: 0,
      paid: 0,
      overdue: 0,
    };

    for (const debtor of debtors) {
      totalCurrentDebt.usd += debtor.currentDebt.usd || 0;
      totalCurrentDebt.uzs += debtor.currentDebt.uzs || 0;
      totalPaid.usd += debtor.totalPaid.usd || 0;
      totalPaid.uzs += debtor.totalPaid.uzs || 0;
      statusCounts[debtor.status]++;
    }

    const stats = {
      totalCurrentDebt,
      totalPaid,
      statusCounts,
      totalDebtors: debtors.length,
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
