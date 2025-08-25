const express = require("express");
const router = express.Router();
const Transaction = require("../models/transactions/transaction.model");
const Client = require("../models/clients/client.model");
const TransactionHelper = require('../utils/transactionHelper');

// 📊 Oylik kirim/chiqim statistikasi
router.get("/", async (req, res) => {
  try {
    const result = await Transaction.find({ isDeleted: false })
      .populate("branch")
      .populate("client");
    res.json({
      transactions: result,
    });
  } catch (error) {
    res.status(500).json({ message: "Statistika olishda xatolik", error });
  }
});

// ➕ Kirim
router.post("/cash-in", async (req, res) => {
  try {
    let { amount, paymentType, description, branch, createdBy, client } =
      req.body;
    // amount: { usd, uzs }
    amount = {
      usd: Number(amount?.usd) || 0,
      uzs: Number(amount?.uzs) || 0,
    };
    if (amount.usd < 0 || amount.uzs < 0) {
      return res
        .status(400)
        .json({ message: "amount.usd va amount.uzs musbat bo'lishi kerak" });
    }
    const isClient = client ? await Client.findById(client) : null;
    if (isClient?.isVip) {
      isClient.debt -= amount.usd;
      await isClient.save();
    }
    const transaction = await Transaction.create({
      type: "cash-in",
      amount,
      paymentType,
      description,
      branch,
      createdBy,
      client,
    });
    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ message: "Kirimni qo‘shishda xatolik", error });
  }
});

// ➖ Chiqim
router.post("/cash-out", async (req, res) => {
  try {
    let { amount, paymentType, description, branch, createdBy, client } =
      req.body;
    amount = {
      usd: Number(amount?.usd) || 0,
      uzs: Number(amount?.uzs) || 0,
    };
    if (amount.usd < 0 || amount.uzs < 0) {
      return res
        .status(400)
        .json({ message: "amount.usd va amount.uzs musbat bo'lishi kerak" });
    }
    const isClient = client ? await Client.findById(client) : null;
    if (isClient?.isVip) {
      isClient.debt += amount.usd;
      await isClient.save();
    }
    const transaction = await Transaction.create({
      type: "cash-out",
      amount,
      paymentType,
      description,
      branch,
      createdBy,
      client,
    });
    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ message: "Chiqimni qo‘shishda xatolik", error });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const transactionId = req.params.id;
    let { amount, paymentType, description, branch, createdBy, client } =
      req.body;
    amount = {
      usd: Number(amount?.usd) || 0,
      uzs: Number(amount?.uzs) || 0,
    };
    if (amount.usd < 0 || amount.uzs < 0) {
      return res
        .status(400)
        .json({ message: "amount.usd va amount.uzs musbat bo'lishi kerak" });
    }
    const transaction = await Transaction.findById(transactionId);
    if (!transaction || transaction.isDeleted) {
      return res.status(404).json({ message: "Transaction topilmadi" });
    }
    // Обновление долга клиента, если client меняется
    if (client && client !== String(transaction.client)) {
      const oldClient = await Client.findById(transaction.client);
      if (oldClient?.isVip) {
        if (transaction.type === "cash-in") {
          oldClient.debt += transaction.amount.usd;
        } else if (transaction.type === "cash-out") {
          oldClient.debt -= transaction.amount.usd;
        }
        await oldClient.save();
      }
      const newClient = await Client.findById(client);
      if (transaction.type === "cash-in") {
        newClient.debt -= amount.usd;
      } else if (transaction.type === "cash-out") {
        newClient.debt += amount.usd;
      }
      await newClient.save();
      transaction.client = client;
    } else if (client) {
      // Если client не меняется, обновить долг по новой сумме
      const curClient = await Client.findById(client);
      if (curClient?.isVip) {
        if (transaction.type === "cash-in") {
          curClient.debt += transaction.amount.usd - amount.usd;
        } else if (transaction.type === "cash-out") {
          curClient.debt -= transaction.amount.usd - amount.usd;
        }
        await curClient.save();
      }
    }
    transaction.amount = amount;
    transaction.paymentType = paymentType;
    transaction.description = description;
    transaction.branch = branch;
    transaction.createdBy = createdBy;
    await transaction.save();
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ message: "Transaction yangilashda xatolik", error });
  }
});
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await Transaction.findByIdAndDelete(id);
    console.log(id);
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }
    return res.status(200).json({ message: "Transaction o`chirildi" });
  } catch (error) {
    res.status(500).json({ message: "Transaction yangilashda xatolik", error });
  }
});
// 📊 Oylik kirim/chiqim statistikasi (usd/uzs)
router.get("/statistics/monthly-transactions", async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const branch = req.query.branch;
    const match = {
      createdAt: {
        $gte: new Date(`${year}-01-01T00:00:00.000Z`),
        $lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
      },
    };
    if (branch) match.branch = branch;
    const pipeline = [
      { $match: match },
      {
        $project: {
          month: { $month: "$createdAt" },
          type: 1,
          "amount.usd": 1,
          "amount.uzs": 1,
        },
      },
      {
        $group: {
          _id: { month: "$month", type: "$type" },
          totalUsd: { $sum: "$amount.usd" },
          totalUzs: { $sum: "$amount.uzs" },
        },
      },
    ];
    const result = await Transaction.aggregate(pipeline);
    const cashIn = Array(12).fill({ usd: 0, uzs: 0 });
    const cashOut = Array(12).fill({ usd: 0, uzs: 0 });
    result.forEach((item) => {
      const index = item._id.month - 1;
      if (item._id.type === "cash-in") {
        cashIn[index] = { usd: item.totalUsd, uzs: item.totalUzs };
      } else if (item._id.type === "cash-out") {
        cashOut[index] = { usd: item.totalUsd, uzs: item.totalUzs };
      }
    });
    res.json({ cashIn, cashOut });
  } catch (error) {
    res.status(500).json({ message: "Statistika olishda xatolik", error });
  }
});

/**
 * @swagger
 * tags:
 *   name: Transaction
 *   description: Финансовые транзакции
 */

/**
 * @swagger
 * /api/transactions:
 *   get:
 *     summary: Получить список транзакций
 *     tags: [Transaction]
 *     responses:
 *       200:
 *         description: Список транзакций
 */

/**
 * @swagger
 * /api/transactions/cash-in:
 *   post:
 *     summary: Добавить приход (cash-in)
 *     tags: [Transaction]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: object
 *                 properties:
 *                   usd:
 *                     type: number
 *                     example: 100
 *                   uzs:
 *                     type: number
 *                     example: 1200000
 *               paymentType:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Приход добавлен
 *       400:
 *         description: Ошибка валидации
 */

/**
 * @swagger
 * /api/transactions/cash-out:
 *   post:
 *     summary: Добавить расход (cash-out)
 *     tags: [Transaction]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: object
 *                 properties:
 *                   usd:
 *                     type: number
 *                     example: 100
 *                   uzs:
 *                     type: number
 *                     example: 1200000
 *               paymentType:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Расход добавлен
 *       400:
 *         description: Ошибка валидации
 */

/**
 * @swagger
 * /api/transactions/{id}:
 *   put:
 *     summary: Обновить транзакцию по ID
 *     tags: [Transaction]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID транзакции
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Транзакция обновлена
 *       404:
 *         description: Транзакция не найдена
 */

/**
 * @swagger
 * /api/transactions/statistics/monthly-transactions:
 *   get:
 *     summary: Получить месячную статистику по транзакциям
 *     tags: [Transaction]
 *     parameters:
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Год
 *       - in: query
 *         name: branch
 *         schema:
 *           type: string
 *         description: ID филиала
 *     responses:
 *       200:
 *         description: Месячная статистика
 */

// 📊 Mijoz uchun transaction balance
router.get("/balance/:clientId", async (req, res) => {
  try {
    const { clientId } = req.params;
    const balance = await TransactionHelper.calculateClientTransactionBalance(clientId);
    res.json(balance);
  } catch (error) {
    res.status(500).json({ 
      message: "Client transaction balance hisoblashda xatolik", 
      error: error.message 
    });
  }
});

// 📊 Transaction statistics (yangi)
router.get("/statistics/advanced", async (req, res) => {
  try {
    const { startDate, endDate, branch } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        message: "startDate va endDate parametrlari majburiy"
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const statistics = await TransactionHelper.getTransactionStatistics(start, end, branch);
    res.json(statistics);
  } catch (error) {
    res.status(500).json({ 
      message: "Transaction statistics olishda xatolik", 
      error: error.message 
    });
  }
});

// 🔍 Related transactions - order/service/debtor bilan bog'langan transaction'lar
router.get("/related/:modelType/:modelId", async (req, res) => {
  try {
    const { modelType, modelId } = req.params;
    
    if (!["Order", "Service", "Debtor"].includes(modelType)) {
      return res.status(400).json({
        message: "modelType faqat Order, Service yoki Debtor bo'lishi mumkin"
      });
    }

    const transactions = await Transaction.find({
      relatedModel: modelType,
      relatedId: modelId,
      isDeleted: false
    }).populate('client branch createdBy').sort({ createdAt: -1 });

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ 
      message: "Related transactions olishda xatolik", 
      error: error.message 
    });
  }
});

module.exports = router;
