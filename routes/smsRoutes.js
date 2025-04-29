const express = require("express");
const router = express.Router();
const SmsLog = require("../models/sms/smsLog.model");
const authMiddleware = require("../middleware/authMiddleware");
const { body, validationResult } = require("express-validator");

// Валидация для создания SMS
const smsValidation = [
  body("phoneNumber")
    .trim()
    .matches(/^\+?[0-9]{10,15}$/)
    .withMessage("Неверный формат номера телефона"),
  body("message")
    .trim()
    .notEmpty()
    .withMessage("Сообщение не может быть пустым")
    .isLength({ max: 160 })
    .withMessage("Сообщение не должно превышать 160 символов"),
];

// Отправка SMS
router.post("/send", authMiddleware, smsValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const smsLog = new SmsLog({
      phoneNumber: req.body.phoneNumber,
      message: req.body.message,
      status: "pending",
    });

    await smsLog.save();

    // Здесь должна быть логика отправки SMS через внешний сервис
    // Например:
    // const result = await smsService.send(smsLog.phoneNumber, smsLog.message);
    // smsLog.status = result.success ? 'sent' : 'failed';
    // smsLog.errorMessage = result.error || null;
    // await smsLog.save();

    res.status(201).json(smsLog);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение истории SMS
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { phoneNumber, status, startDate, endDate } = req.query;
    let query = { isDeleted: false };

    if (phoneNumber) {
      query.phoneNumber = phoneNumber;
    }
    if (status) {
      query.status = status;
    }
    if (startDate || endDate) {
      query.sendDate = {};
      if (startDate) {
        query.sendDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.sendDate.$lte = new Date(endDate);
      }
    }

    const smsLogs = await SmsLog.find(query).sort({ sendDate: -1 });
    res.json(smsLogs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение SMS по ID
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const smsLog = await SmsLog.findById(req.params.id);
    if (!smsLog) {
      return res.status(404).json({ message: "SMS не найдено" });
    }
    res.json(smsLog);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Обновление статуса SMS
router.patch(
  "/:id/status",
  authMiddleware,
  [
    body("status")
      .isIn(["pending", "sent", "failed"])
      .withMessage("Неверный статус"),
    body("errorMessage").optional().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const smsLog = await SmsLog.findById(req.params.id);
      if (!smsLog) {
        return res.status(404).json({ message: "SMS не найдено" });
      }

      smsLog.status = req.body.status;
      if (req.body.errorMessage) {
        smsLog.errorMessage = req.body.errorMessage;
      }

      await smsLog.save();
      res.json(smsLog);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Удаление SMS (мягкое удаление)
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const smsLog = await SmsLog.findById(req.params.id);
    if (!smsLog) {
      return res.status(404).json({ message: "SMS не найдено" });
    }

    smsLog.isDeleted = true;
    await smsLog.save();
    res.json({ message: "SMS успешно удалено" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение статистики по SMS
router.get("/stats/summary", authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let match = { isDeleted: false };

    if (startDate || endDate) {
      match.sendDate = {};
      if (startDate) {
        match.sendDate.$gte = new Date(startDate);
      }
      if (endDate) {
        match.sendDate.$lte = new Date(endDate);
      }
    }

    const stats = await SmsLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalMessages: { $sum: 1 },
        },
      },
    ]);

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Повторная отправка SMS
router.post("/:id/retry", authMiddleware, async (req, res) => {
  try {
    const smsLog = await SmsLog.findById(req.params.id);
    if (!smsLog) {
      return res.status(404).json({ message: "SMS не найдено" });
    }

    if (smsLog.status === "sent") {
      return res.status(400).json({ message: "SMS уже отправлено" });
    }

    smsLog.status = "pending";
    smsLog.errorMessage = null;
    await smsLog.save();

    // Здесь должна быть логика повторной отправки SMS
    // Например:
    // const result = await smsService.send(smsLog.phoneNumber, smsLog.message);
    // smsLog.status = result.success ? 'sent' : 'failed';
    // smsLog.errorMessage = result.error || null;
    // await smsLog.save();

    res.json(smsLog);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
