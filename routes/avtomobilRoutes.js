const express = require("express");
const router = express.Router();
const Avtomobil = require("../models/avtomobil.model");
const authMiddleware = require("../middleware/authMiddleware");
const { body, validationResult } = require("express-validator");

/**
 * @swagger
 * tags:
 *   name: Avtomobil
 *   description: CRUD for avtomobil (car)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Avtomobil:
 *       type: object
 *       required:
 *         - name
 *         - number
 *       properties:
 *         _id:
 *           type: string
 *         name:
 *           type: string
 *           example: Nexia 3
 *         number:
 *           type: string
 *           example: 01A123BC
 *         createdBy:
 *           type: string
 *           description: Admin ID
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

// Validation
const avtomobilValidation = [
  body("name").trim().notEmpty().withMessage("Avtomobil name is required"),
  body("number")
    .trim()
    .notEmpty()
    .withMessage("Car number is required")
    .matches(/^[0-9]{2}[A-Z]{1,3}[0-9]{2,3}$/i)
    .withMessage("Invalid Uzbek car number format"),
];

/**
 * @swagger
 * /api/avtomobils:
 *   post:
 *     summary: Create avtomobil
 *     tags: [Avtomobil]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Avtomobil'
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Avtomobil'
 *       400:
 *         description: Validation error
 */
router.post("/", authMiddleware, avtomobilValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const avtomobil = new Avtomobil({ ...req.body, createdBy: req.user.id });
    await avtomobil.save();
    res.status(201).json(avtomobil);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/**
 * @swagger
 * /api/avtomobils:
 *   get:
 *     summary: Get all avtomobils
 *     tags: [Avtomobil]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of avtomobils
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Avtomobil'
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const avtomobils = await Avtomobil.find().populate("createdBy", "name");
    res.json(avtomobils);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/**
 * @swagger
 * /api/avtomobils/{id}:
 *   get:
 *     summary: Get avtomobil by ID
 *     tags: [Avtomobil]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Avtomobil ID
 *     responses:
 *       200:
 *         description: Avtomobil found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Avtomobil'
 *       404:
 *         description: Not found
 */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const avtomobil = await Avtomobil.findById(req.params.id).populate("createdBy", "name");
    if (!avtomobil) return res.status(404).json({ message: "Not found" });
    res.json(avtomobil);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/**
 * @swagger
 * /api/avtomobils/{id}:
 *   patch:
 *     summary: Update avtomobil by ID
 *     tags: [Avtomobil]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Avtomobil ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Avtomobil'
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Avtomobil'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Not found
 */
router.patch("/:id", authMiddleware, avtomobilValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const avtomobil = await Avtomobil.findById(req.params.id);
    if (!avtomobil) return res.status(404).json({ message: "Not found" });
    Object.assign(avtomobil, req.body);
    await avtomobil.save();
    res.json(avtomobil);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/**
 * @swagger
 * /api/avtomobils/{id}:
 *   delete:
 *     summary: Delete avtomobil by ID
 *     tags: [Avtomobil]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Avtomobil ID
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Not found
 */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const avtomobil = await Avtomobil.findById(req.params.id);
    if (!avtomobil) return res.status(404).json({ message: "Not found" });
    await avtomobil.deleteOne();
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
