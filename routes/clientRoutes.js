const express = require("express");
const router = express.Router();
const Client = require("../models/clients/client.model");
const authMiddleware = require("../middleware/authMiddleware");
const { body, validationResult } = require("express-validator");

// Валидация для создания/обновления клиента
const clientValidation = [
  body("firstName").trim().notEmpty().withMessage("Имя обязательно"),
  body("lastName").trim().notEmpty().withMessage("Фамилия обязательна"),
  body("phone").trim().notEmpty().withMessage("Телефон обязателен"),
  body("birthday").optional().isISO8601().withMessage("Неверный формат даты"),
  body("telegram").optional().trim(),
  body("branch").isMongoId().withMessage("Неверный ID филиала"),
  body("isVip")
    .optional()
    .isBoolean()
    .withMessage("isVip должен быть булевым значением"),
  body("notes").optional().trim(),
];

// Валидация для автомобиля
const carValidation = [
  body("model").trim().notEmpty().withMessage("Модель автомобиля обязательна"),
  body("plateNumber")
    .trim()
    .notEmpty()
    .withMessage("Номер автомобиля обязателен"),
];

// Создание нового клиента
router.post("/", authMiddleware, clientValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const client = new Client({
      ...req.body,
      cars: req.body.cars || [],
      debt: req.body.debt || 0,
      partialPayments: req.body.partialPayments || [],
    });

    await client.save();
    res.status(201).json(client);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение списка клиентов
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { branch, isVip, search } = req.query;
    let query = {};

    if (branch) {
      query.branch = branch;
    }
    if (isVip !== undefined) {
      query.isVip = isVip === "true";
    }
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const clients = await Client.find(query)
      .populate("branch")
      .sort({ createdAt: -1 });
    res.json(clients);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение клиента по ID
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).populate("branch");
    if (!client) {
      return res.status(404).json({ message: "Клиент не найден" });
    }
    res.json(client);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Обновление клиента
router.patch("/:id", authMiddleware, clientValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ message: "Клиент не найден" });
    }

    Object.assign(client, req.body);
    await client.save();
    res.json(client);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Добавление автомобиля клиенту
router.post("/:id/cars", authMiddleware, carValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ message: "Клиент не найден" });
    }

    client.cars.push(req.body);
    await client.save();
    res.json(client);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Удаление автомобиля клиента
router.delete("/:id/cars/:carId", authMiddleware, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ message: "Клиент не найден" });
    }

    client.cars = client.cars.filter(
      (car) => car._id.toString() !== req.params.carId
    );
    await client.save();
    res.json(client);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Добавление частичного платежа
router.post(
  "/:id/payments",
  authMiddleware,
  [
    body("amount").isNumeric().withMessage("Сумма должна быть числом"),
    body("date").optional().isISO8601().withMessage("Неверный формат даты"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const client = await Client.findById(req.params.id);
      if (!client) {
        return res.status(404).json({ message: "Клиент не найден" });
      }

      const payment = {
        amount: req.body.amount,
        date: req.body.date || new Date(),
      };

      client.partialPayments.push(payment);
      client.debt = Math.max(0, client.debt - payment.amount);
      await client.save();
      res.json(client);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Удаление клиента
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ message: "Клиент не найден" });
    }

    await client.deleteOne();
    res.json({ message: "Клиент успешно удален" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
