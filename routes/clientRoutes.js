const express = require("express");
const router = express.Router();
const Client = require("../models/clients/client.model");
const authMiddleware = require("../middleware/authMiddleware");
const { body, validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Валидация для создания/обновления клиента
const clientValidation = [
  body("fullName").trim().notEmpty().withMessage("Имя обязательно"),
  body("phone").trim().notEmpty().withMessage("Телефон обязателен"),
  body("password").optional({ nullable: true }).notEmpty().withMessage("Пароль обязателен"),
  body("birthday").optional().isISO8601().withMessage("Неверный формат даты"),
  body("branch").isMongoId().withMessage("Неверный ID филиала"),
  body("isVip")
    .optional()
    .isBoolean()
    .withMessage("isVip должен быть булевым значением"),
  body("notes").optional().trim(),
  body("cars")
    .optional()
    .isArray()
    .withMessage("Список автомобилей должен быть массивом"),
  body("cars.*.model")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Модель автомобиля обязательна"),
  body("cars.*.plateNumber")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Номер автомобиля обязателен"),
];

router.post(
  "/login",
  [
    body("phone").trim().notEmpty().withMessage("Telefon raqami majburiy"),
    body("password").notEmpty().withMessage("Parol majburiy"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { phone, password } = req.body;
    try {
      const client = await Client.findOne({ phone });
      if (!client?.isVip) {
        return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
      }
      const isMatch = await bcrypt.compare(password, client.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Noto‘g‘ri parol" });
      }
      const token = jwt.sign(
        { id: client._id, phone: client.phone },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      const { password: p, ...clientWithoutPassword } = client.toObject();
      res.json({
        message: "Tizimga muvaffaqiyatli kirildi",
        token,
        client: clientWithoutPassword,
      });
    } catch (err) {
      console.error("Login xatosi:", err);
      res.status(500).json({ message: "Serverda xatolik" });
    }
  }
);

// Добавить проверку на дублирующийся телефон
router.post("/", authMiddleware, clientValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { password, phone, ...rest } = req.body;
    const existing = await Client.findOne({ phone });
    if (existing) {
      return res
        .status(400)
        .json({ message: "Клиент с таким телефоном уже существует" });
    }
    if (!password) {
      return res.status(400).json({ message: "Пароль обязателен" });
    }
    const hashedPassword = await bcrypt.hash(password, 10); // Обработка автомобилей
    const cars = req.body.cars || [];
    const plateNumbers = new Set();
    for (const car of cars) {
      const normalizedPlateNumber = car.plateNumber.toUpperCase().trim();
      if (plateNumbers.has(normalizedPlateNumber)) {
        return res.status(400).json({
          message: `Дублирующийся номер автомобиля: ${normalizedPlateNumber}`,
        });
      }
      plateNumbers.add(normalizedPlateNumber);
      car.plateNumber = normalizedPlateNumber;
    }

    const client = new Client({
      ...rest,
      phone,
      password: hashedPassword,
      cars,
      debt: req.body.debt || 0,
      partialPayments: req.body.partialPayments || [],
    });

    await client.save();
    res.status(201).json(client);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
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
    if (typeof isVip !== "undefined") {
      if (isVip === "true") query.isVip = true;
      else if (isVip === "false") query.isVip = false;
    }
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const clients = await Client.find(query)
      .populate("branch")
      .sort({ createdAt: -1 });
    res.json(clients);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
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
    res.status(500).json({ message: "Server error" });
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

    // If password is present, hash it, otherwise do not update password
    if (req.body.password) {
      req.body.password = await bcrypt.hash(req.body.password, 10);
    } else {
      delete req.body.password;
    }

    // Обработка автомобилей
    if (req.body.cars) {
      // Валидация номеров автомобилей на уникальность
      const plateNumbers = new Set();
      for (const car of req.body.cars) {
        const normalizedPlateNumber = car.plateNumber.toUpperCase().trim();
        if (plateNumbers.has(normalizedPlateNumber)) {
          return res.status(400).json({
            message: `Дублирующийся номер автомобиля: ${normalizedPlateNumber}`,
          });
        }
        plateNumbers.add(normalizedPlateNumber);
        car.plateNumber = normalizedPlateNumber;
      }
    }

    // Only allow updates to allowed fields
    const allowedFields = [
      "fullName",
      "phone",
      "password",
      "birthday",
      "branch",
      "isVip",
      "notes",
      "cars",
    ];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        client[field] = req.body[field];
      }
    });
    await client.save();
    res.json(client);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

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
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
