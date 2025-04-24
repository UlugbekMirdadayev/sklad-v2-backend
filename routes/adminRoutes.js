const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Worker = require("../models/Worker");
const Admin = require("../models/Admin");
const validatePhoneNumber = require("../middleware/numberFormat");
const adminAuth = require("../middleware/authMiddleware");

const router = express.Router();

// Admin ro'yxatdan o'tish (Faqat super admin)
router.post("/register", adminAuth, async (req, res) => {
  try {
    // Super adminni tekshirish
    const { adminId } = req.user;
    const superAdmin = await Admin.findOne({
      _id: adminId,
      role: "superadmin",
    });

    if (!superAdmin) {
      return res.status(403).json({
        message:
          "Aksess rad etildi. Yangi adminlarni faqat super adminlar ro'yxatga olishlari mumkin.",
      });
    }

    const { phone, password, role, fullName } = req.body;

    // Kiritilgan ma'lumotlarni tekshirish
    if (!phone || !password || !fullName || !role) {
      return res.status(400).json({
        message:
          "Iltimos, barcha zarur maydonlarni to'ldiring: telefon raqami, parol, to'liq ism, va rol.",
      });
    }

    // Telefon raqamini tekshirish
    if (!validatePhoneNumber(phone)) {
      return res.status(400).json({
        message:
          "Noto'g'ri telefon raqami formati. +998XXXXXXXXX formatida bo'lishi kerak.",
      });
    }
    // Rolni tekshirish
    if (!["manager", "admin"].includes(role)) {
      return res.status(400).json({
        message: `Noto'g'ri rol => ${role}. Yoqilgan rollar: "manager", "admin"`,
      });
    }

    // Adminning mavjudligini tekshirish
    const existingAdmin = await Admin.findOne({ phone });
    if (existingAdmin) {
      return res.status(400).json({
        message: "Bu telefon raqami bilan admin allaqachon mavjud.",
      });
    }

    // Parolni hashlash
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Yangi adminni yaratish
    const newAdmin = new Admin({
      phone,
      fullName,
      password: hashedPassword,
      role,
    });

    await newAdmin.save();

    // JWT token yaratish
    const token = jwt.sign(
      {
        adminId: newAdmin._id,
        role: newAdmin.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    // Parolsiz admin ma'lumotlarini yuborish
    const responseAdmin = newAdmin.toObject();
    delete responseAdmin.password;

    res.status(201).json({
      message: "Admin muvaffaqiyatli yaratildi",
      token,
      admin: responseAdmin,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server xatosi",
      error: error.message,
    });
  }
});

// Admin login (Kirish)
router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    const admin = await Admin.findOne({ phone });
    if (!admin) {
      return res
        .status(404)
        .json({ message: "Bu telefon raqami ro'yxatdan o'tmagan!" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Noto'g'ri parol!" });
    }

    const token = jwt.sign(
      {
        adminId: admin._id,
        role: admin.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    const userData = admin.toObject();
    delete userData.password;

    res.json({ message: "Muvaffaqiyatli kirish!", admin: userData, token });
  } catch (error) {
    res.status(500).json({ message: `Xatolik yuz berdi! ${error.message}` });
  }
});

// Worker yaratish (Admin tomonidan)
router.post("/worker/create", adminAuth, async (req, res) => {
  try {
    const { phone, fullName, password, role } = req.body;

    if (!fullName) {
      return res.status(400).json({
        message: "fullName: 'fullName' maydoni majburiy.",
      });
    }

    if (!phone) {
      return res.status(400).json({
        message: "phone: 'phone' maydoni majburiy.",
      });
    }
    if (!password) {
      return res.status(400).json({
        message: "password: 'password' maydoni majburiy.",
      });
    }

    const existingWorker = await Worker.findOne({
      phone,
    });
    if (existingWorker) {
      return res
        .status(400)
        .json({ message: "Bu telefon raqami allaqachon ro'yxatdan o'tgan!" });
    }

    // Telefon raqamini tekshirish
    if (!validatePhoneNumber(phone)) {
      return res.status(400).json({
        message:
          "Noto'g'ri telefon raqami formati. +998XXXXXXXXX formatida bo'lishi kerak.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newWorker = new Worker({
      phone,
      fullName,
      password: hashedPassword,
      role: role ?? null,
    });

    await newWorker.save();

    const responseWorker = newWorker.toObject();
    delete responseWorker.password;

    res.status(201).json({
      message: "Muvaffaqiyatli ro'yxatdan o'tdi!",
      worker: responseWorker,
    });
  } catch (error) {
    res.status(500).json({ message: `Xatolik yuz berdi! ${error.message}` });
  }
});

// Workerlarni ko'rish (Admin tomonidan)
router.get("/workers", adminAuth, async (req, res) => {
  try {
    const workers = await Worker.find({
      isDeleted: false,
    }).select("-password");

    res.status(200).json({
      message: "Workerlar ro'yxati",
      workers,
    });
  } catch (error) {
    res.status(500).json({ message: `Xatolik yuz berdi! ${error.message}` });
  }
});

// Workerlarni yangilash (Admin tomonidan)
router.put("/worker/update/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, phone, password, role } = req.body;

    // Workerni tekshirish
    const worker = await Worker.findById(id);
    if (!worker) {
      return res.status(404).json({ message: "Worker topilmadi!" });
    }

    // Telefon raqamini tekshirish
    if (phone && !validatePhoneNumber(phone)) {
      return res.status(400).json({
        message:
          "Noto'g'ri telefon raqami formati. +998XXXXXXXXX formatida bo'lishi kerak.",
      });
    }

    // Parolni yangilash
    let hashedPassword;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    // Workerni yangilash
    const updatedWorker = await Worker.findByIdAndUpdate(
      id,
      {
        fullName,
        phone,
        password: hashedPassword,
        role,
      },
      { new: true }
    );

    res.status(200).json({
      message: "Worker muvaffaqiyatli yangilandi!",
      worker: updatedWorker,
    });
  } catch (error) {
    res.status(500).json({ message: `Xatolik yuz berdi! ${error.message}` });
  }
});

// Workerni o'chirish (Admin tomonidan)
router.delete("/worker/delete/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { adminId } = req.user;

    if (!adminId) {
      return res
        .status(403)
        .json({ message: "Aksess rad etildi. Admin ID topilmadi." });
    }

    // Adminni tekshirish
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: "Admin topilmadi!" });
    }

    if (!id) {
      return res.status(400).json({ message: "Worker ID topilmadi!" });
    }

    // Workerni tekshirish
    const worker = await Worker.findById(id);
    if (!worker) {
      return res.status(404).json({ message: "Worker topilmadi!" });
    }

    // Workerni o'chirish
    await Worker.findByIdAndUpdate(
      id,
      {
        isDeleted: true,
        deletedAt: new Date(),
      },
      { new: true }
    );

    res.status(200).json({
      message: "Worker muvaffaqiyatli o'chirildi!",
    });
  } catch (error) {
    res.status(500).json({ message: `Xatolik yuz berdi! ${error.message}` });
  }
});

// Managerlarni ko'rish (Admin tomonidan)
router.get("/", adminAuth, async (req, res) => {
  try {
    const admins = await Admin.find({
      role: { $in: ["manager", "admin"] },
      isDeleted: false,
    }).select("-password");

    res.status(200).json({
      message: "Managerlar ro'yxati",
      admins,
    });
  } catch (error) {
    res.status(500).json({ message: `Xatolik yuz berdi! ${error.message}` });
  }
});

// Adminni yangilash (Admin tomonidan)
router.put("/update/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, phone, password, role } = req.body;

    // Adminni tekshirish
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ message: "Admin topilmadi!" });
    }

    // Telefon raqamini tekshirish
    if (phone && !validatePhoneNumber(phone)) {
      return res.status(400).json({
        message:
          "Noto'g'ri telefon raqami formati. +998XXXXXXXXX formatida bo'lishi kerak.",
      });
    }

    // Parolni yangilash
    let hashedPassword;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    // Adminni yangilash
    const updatedAdmin = await Admin.findByIdAndUpdate(
      id,
      {
        fullName,
        phone,
        password: hashedPassword,
        role,
      },
      { new: true }
    );

    res.status(200).json({
      message: "Admin muvaffaqiyatli yangilandi!",
      admin: updatedAdmin,
    });
  } catch (error) {
    res.status(500).json({ message: `Xatolik yuz berdi! ${error.message}` });
  }
});

// Adminni o'chirish (Admin tomonidan)

router.delete("/delete/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { adminId } = req.user;

    // Adminni tekshirish
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ message: "Admin topilmadi!" });
    }
    const { role } = await Admin.findById(adminId);

    if (role !== "superadmin") {
      return res.status(403).json({
        message:
          "Aksess rad etildi. Faqat super adminlar adminlarni o'chirishi mumkin.",
      });
    }

    // O'chirishdan oldin adminni tekshirish
    if (admin._id.toString() === adminId) {
      return res.status(400).json({
        message: "O'zingizni o'chira olmaysiz!",
      });
    }
    // Adminni o'chirish
    await Admin.findByIdAndUpdate(
      id,
      {
        isDeleted: true,
        deletedAt: new Date(),
      },
      { new: true }
    );

    res.status(200).json({
      message: "Admin muvaffaqiyatli o'chirildi!",
    });
  } catch (error) {
    res.status(500).json({ message: `Xatolik yuz berdi! ${error.message}` });
  }
});

module.exports = router;
