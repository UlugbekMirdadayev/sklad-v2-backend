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
  body("date_returned")
    .isISO8601()
    .withMessage("Noto'g'ri sana formati")
];

// Создание новой записи о долге или обновление существующей
router.post("/", authMiddleware, debtValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { client: clientId, branch, totalDebt, description, date_returned } = req.body;

    // Mijozni topamiz
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ message: "Mijoz topilmadi" });
    }

    // Debtor mavjudmi?
    let debtor = await Debtor.findOne({ client: clientId });

    if (debtor) {
      // Eski qarzlarni yangisiga qo‘shamiz
      debtor.totalDebt += totalDebt;
      debtor.remainingDebt += totalDebt;
      debtor.description = description || debtor.description;
      debtor.date_returned = date_returned;
      debtor.status = "pending";

      await debtor.save();

      // Mijozning qarzini ham oshiramiz
      client.debt += totalDebt;
      await client.save();

      return res.json(debtor);
    } else {
      // Yangi debtor yaratiladi
      const newDebtor = new Debtor({
        client: clientId,
        branch,
        totalDebt,
        paidAmount: 0,
        remainingDebt: totalDebt,
        date_returned,
        description: description || "",
        status: "pending",
      });

      await newDebtor.save();

      // Mijozning qarzi qo‘shiladi
      client.debt += totalDebt;
      await client.save();

      return res.status(201).json(newDebtor);
    }
  } catch (error) {
    console.error("Error creating/updating debtor:", error);
    res.status(500).json({
      message: "Server xatosi yuz berdi",
      error: error.message,
    });
  }
});


/**
 * @swagger
 * tags:
 *   name: Debtors
 *   description: Управление долгами клиентов
 */

/**
 * @swagger
 * /api/debtors:
 *   post:
 *     summary: Создать или обновить долг клиента
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
 *               branch:
 *                 type: string
 *               totalDebt:
 *                 type: number
 *               description:
 *                 type: string
 *               date_returned:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Долг создан
 *       200:
 *         description: Долг обновлен
 *       400:
 *         description: Ошибка валидации
 */

/**
 * @swagger
 * /api/debtors:
 *   get:
 *     summary: Получить список должников
 *     tags: [Debtors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branch
 *         schema:
 *           type: string
 *         description: ID филиала
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Статус долга
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Поиск по имени или телефону клиента
 *     responses:
 *       200:
 *         description: Список должников
 */

/**
 * @swagger
 * /api/debtors/{id}:
 *   get:
 *     summary: Получить должника по ID
 *     tags: [Debtors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID должника
 *     responses:
 *       200:
 *         description: Должник найден
 *       404:
 *         description: Должник не найден
 *   patch:
 *     summary: Обновить долг по ID
 *     tags: [Debtors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID должника
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               totalDebt:
 *                 type: number
 *               description:
 *                 type: string
 *               date_returned:
 *                 type: string
 *                 format: date
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Долг обновлен
 *       404:
 *         description: Должник не найден
 */

/**
 * @swagger
 * /api/debtors/{id}/payments:
 *   post:
 *     summary: Добавить платеж по долгу
 *     tags: [Debtors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID должника
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *               date:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Платеж добавлен
 *       404:
 *         description: Должник не найден
 */

/**
 * @swagger
 * /api/debtors/stats/summary:
 *   get:
 *     summary: Получить статистику по долгам
 *     tags: [Debtors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branch
 *         schema:
 *           type: string
 *         description: ID филиала
 *     responses:
 *       200:
 *         description: Статистика по долгам
 */
module.exports = router;
