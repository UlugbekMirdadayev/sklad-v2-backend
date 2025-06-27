const express = require("express");
const router = express.Router();
const Branch = require("../models/branches/branch.model");
const auth = require("../middleware/authMiddleware");

router.use(auth);

/**
 * @swagger
 * tags:
 *   name: Branch
 *   description: Филиалы компании
 */

/**
 * @swagger
 * /api/branches:
 *   get:
 *     summary: Получить список всех филиалов
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список филиалов
 */

/**
 * @swagger
 * /api/branches/{id}:
 *   get:
 *     summary: Получить филиал по ID
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID филиала
 *     responses:
 *       200:
 *         description: Филиал найден
 *       404:
 *         description: Филиал не найден
 */

/**
 * @swagger
 * /api/branches:
 *   post:
 *     summary: Создать новый филиал
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               address:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Филиал создан
 *       400:
 *         description: Ошибка валидации
 */

/**
 * @swagger
 * /api/branches/{id}:
 *   patch:
 *     summary: Обновить филиал по ID
 *     tags: [Branch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID филиала
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               address:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Филиал обновлен
 *       404:
 *         description: Филиал не найден
 */

// Получение списка всех филиалов
router.get("/", async (req, res) => {
  try {
    const branches = await Branch.find();
    res.json(branches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение одного филиала по ID
router.get("/:id", async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(404).json({ message: "Филиал не найден" });
    }
    res.json(branch);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Создание нового филиала
router.post("/", async (req, res) => {
  const branch = new Branch({
    name: req.body.name,
    address: req.body.address,
    isActive: req.body.isActive,
  });

  try {
    const newBranch = await branch.save();
    res.status(201).json(newBranch);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Обновление филиала
router.patch("/:id", async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(404).json({ message: "Филиал не найден" });
    }

    if (req.body.name != null) {
      branch.name = req.body.name;
    }
    if (req.body.address != null) {
      branch.address = req.body.address;
    }
    if (req.body.isActive != null) {
      branch.isActive = req.body.isActive;
    }

    const updatedBranch = await branch.save();
    res.json(updatedBranch);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Удаление филиала
router.delete("/:id", async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(404).json({ message: "Филиал не найден" });
    }

    await branch.deleteOne();
    res.json({ message: "Филиал успешно удален" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
