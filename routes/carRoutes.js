const express = require("express");
const router = express.Router();
const Car = require("../models/car/car.model");
const authMiddleware = require("../middleware/authMiddleware");
const { body, validationResult } = require("express-validator");

/**
 * @swagger
 * tags:
 *   name: Car
 *   description: CRUD for car
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Car:
 *       type: object
 *       required:
 *         - name
 *         - number
 *       properties:
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
    .matches(/^[0-9]{2}[A-Z]{1}[0-9]{3}[A-Z]{2}$/i)
    .withMessage("Invalid Uzbek car number format"),
];

/**
 * @swagger
 * /api/cars:
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
router.post("/", authMiddleware, async (req, res) => {
  try {
    if (!req.body.name) {
      return res.status(400).json({ message: "Car name is required" });
    }
    const car = new Car({
      name: req.body.name,
    });
    await car.save();
    const obj = car.toObject();
    delete obj.__v;
    res.status(201).json(obj);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/**
 * @swagger
 * /api/cars:
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

router.get("/", async (req, res) => {
  try {
    const cars = await Car.find();
    res.json(cars);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/**
 * @swagger
 * /api/cars/{id}:
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
    const car = await Car.findById(req.params.id).populate("createdBy", "name");
    if (!car) return res.status(404).json({ message: "Not found" });
    res.json(car);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/**
 * @swagger
 * /api/cars/{id}:
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
router.patch(":id", authMiddleware, avtomobilValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });
  try {
    const car = await Car.findById(req.params.id);
    if (!car) return res.status(404).json({ message: "Not found" });
    // createdBy, createdAt, updatedAt должны игнорироваться при обновлении
    const { name } = req.body;
    if (name !== undefined) car.name = name;
    await car.save();
    res.json(car);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/**
 * @swagger
 * /api/cars/{id}:
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
    const car = await Car.findById(req.params.id);
    if (!car) return res.status(404).json({ message: "Not found" });
    await car.deleteOne();
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
