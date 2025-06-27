const express = require('express');
const router = express.Router();
const Batch = require('../models/products/batch.model');

/**
 * @swagger
 * tags:
 *   name: Batch
 *   description: Партии товаров
 */

/**
 * @swagger
 * /api/batches:
 *   post:
 *     summary: Создать новую партию
 *     tags: [Batch]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               batch_number:
 *                 type: string
 *     responses:
 *       201:
 *         description: Партия создана
 *       400:
 *         description: Ошибка валидации
 */

// Create a new batch
router.post('/', async (req, res) => {
  try {
    const { batch_number } = req.body;
    if (!batch_number) {
      return res.status(400).json({ message: 'batch_number is required' });
    }
    const batch = new Batch({ batch_number });
    await batch.save();
    res.status(201).json({ batch_number: batch.batch_number });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/batches:
 *   get:
 *     summary: Получить список партий
 *     tags: [Batch]
 *     responses:
 *       200:
 *         description: Список партий
 */

// Get all batches (only batch_number, exclude deleted)
router.get('/', async (req, res) => {
  try {
    const batches = await Batch.find({ isDeleted: false }, 'batch_number');
    res.json(batches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/batches/{batch_number}:
 *   get:
 *     summary: Получить партию по номеру
 *     tags: [Batch]
 *     parameters:
 *       - in: path
 *         name: batch_number
 *         required: true
 *         schema:
 *           type: string
 *         description: Номер партии
 *     responses:
 *       200:
 *         description: Партия найдена
 *       404:
 *         description: Партия не найдена
 *   patch:
 *     summary: Обновить номер партии
 *     tags: [Batch]
 *     parameters:
 *       - in: path
 *         name: batch_number
 *         required: true
 *         schema:
 *           type: string
 *         description: Старый номер партии
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               batch_number:
 *                 type: string
 *     responses:
 *       200:
 *         description: Партия обновлена
 *       404:
 *         description: Партия не найдена
 *   delete:
 *     summary: Удалить партию (soft delete)
 *     tags: [Batch]
 *     parameters:
 *       - in: path
 *         name: batch_number
 *         required: true
 *         schema:
 *           type: string
 *         description: Номер партии
 *     responses:
 *       200:
 *         description: Партия удалена
 *       404:
 *         description: Партия не найдена
 */

// Get a batch by batch_number (exclude deleted)
router.get('/:batch_number', async (req, res) => {
  try {
    const batch = await Batch.findOne({ batch_number: req.params.batch_number, isDeleted: false }, 'batch_number');
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }
    res.json({ batch_number: batch.batch_number });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update a batch (only batch_number can be updated, exclude deleted)
router.patch('/:batch_number', async (req, res) => {
  try {
    const { batch_number: newBatchNumber } = req.body;
    if (!newBatchNumber) {
      return res.status(400).json({ message: 'batch_number is required' });
    }
    const batch = await Batch.findOneAndUpdate(
      { batch_number: req.params.batch_number, isDeleted: false },
      { batch_number: newBatchNumber },
      { new: true, runValidators: true, fields: 'batch_number' }
    );
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }
    res.json({ batch_number: batch.batch_number });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Soft delete a batch by batch_number
router.delete('/:batch_number', async (req, res) => {
  try {
    const batch = await Batch.findOne({ batch_number: req.params.batch_number, isDeleted: false });
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }
    batch.isDeleted = true;
    batch.deletedAt = new Date();
    await batch.save();
    res.json({ message: 'Batch soft deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
