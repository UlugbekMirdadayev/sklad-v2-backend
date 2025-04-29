const express = require("express");
const router = express.Router();
const Admin = require("../models/admin/admin.model");
const authMiddleware = require("../middleware/authMiddleware");
const { body, validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");

// Валидация для создания/обновления администратора
const adminValidation = [
  body("username")
    .trim()
    .notEmpty()
    .withMessage("Имя пользователя обязательно"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Пароль должен быть не менее 6 символов"),
  body("email").isEmail().withMessage("Введите корректный email"),
  body("fullName").trim().notEmpty().withMessage("Полное имя обязательно"),
  body("branch").isMongoId().withMessage("Неверный ID филиала"),
];

// Регистрация нового администратора (только для суперадмина)
router.post("/register", authMiddleware, adminValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Проверка роли
    if (req.user.role !== "superadmin") {
      return res.status(403).json({
        message: "Только суперадмин может создавать новых администраторов",
      });
    }

    const { username, password, email, fullName, branch, role } = req.body;

    // Проверка существования пользователя
    const existingAdmin = await Admin.findOne({
      $or: [{ username }, { email }],
    });
    if (existingAdmin) {
      return res.status(400).json({
        message: "Пользователь с таким email или username уже существует",
      });
    }

    const admin = new Admin({
      username,
      password,
      email,
      fullName,
      branch,
      role: role || "admin",
    });

    await admin.save();
    res.status(201).json({ message: "Администратор успешно создан" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Вход в систему
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res
        .status(401)
        .json({ message: "Неверное имя пользователя или пароль" });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "Неверное имя пользователя или пароль" });
    }

    if (!admin.isActive) {
      return res.status(403).json({ message: "Аккаунт деактивирован" });
    }

    // Обновляем время последнего входа
    admin.lastLogin = new Date();
    await admin.save();

    const token = jwt.sign(
      { adminId: admin._id, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role,
        branch: admin.branch,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение профиля администратора
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.adminId).select("-password");
    if (!admin) {
      return res.status(404).json({ message: "Администратор не найден" });
    }
    res.json(admin);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Обновление профиля администратора
router.patch(
  "/profile",
  authMiddleware,
  [
    body("email").optional().isEmail().withMessage("Введите корректный email"),
    body("fullName")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Полное имя не может быть пустым"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const admin = await Admin.findById(req.user.adminId);
      if (!admin) {
        return res.status(404).json({ message: "Администратор не найден" });
      }

      const { email, fullName } = req.body;

      if (email && email !== admin.email) {
        const existingAdmin = await Admin.findOne({ email });
        if (existingAdmin) {
          return res.status(400).json({ message: "Email уже используется" });
        }
        admin.email = email;
      }

      if (fullName) {
        admin.fullName = fullName;
      }

      await admin.save();
      res.json({ message: "Профиль успешно обновлен" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Смена пароля
router.post(
  "/change-password",
  authMiddleware,
  [
    body("currentPassword").notEmpty().withMessage("Текущий пароль обязателен"),
    body("newPassword")
      .isLength({ min: 6 })
      .withMessage("Новый пароль должен быть не менее 6 символов"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const admin = await Admin.findById(req.user.adminId);
      if (!admin) {
        return res.status(404).json({ message: "Администратор не найден" });
      }

      const { currentPassword, newPassword } = req.body;

      const isMatch = await admin.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ message: "Неверный текущий пароль" });
      }

      admin.password = newPassword;
      await admin.save();

      res.json({ message: "Пароль успешно изменен" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Получение списка администраторов (только для суперадмина)
router.get("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "superadmin") {
      return res.status(403).json({ message: "Доступ запрещен" });
    }

    const admins = await Admin.find().select("-password");
    res.json(admins);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Деактивация администратора (только для суперадмина)
router.patch("/:id/deactivate", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "superadmin") {
      return res.status(403).json({ message: "Доступ запрещен" });
    }

    const admin = await Admin.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({ message: "Администратор не найден" });
    }

    admin.isActive = false;
    await admin.save();

    res.json({ message: "Администратор успешно деактивирован" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
