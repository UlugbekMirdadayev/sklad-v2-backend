const express = require('express');
const router = express.Router();
const Batch = require('../models/products/batch.model');
const Product = require('../models/products/product.model');
const authMiddleware = require('../middleware/authMiddleware');
const { body, validationResult } = require('express-validator');

// Валидация для создания/обновления партии
const batchValidation = [
  body('products').isArray().withMessage('Продукты должны быть массивом'),
  body('products.*.product').isMongoId().withMessage('Неверный ID продукта'),
  body('products.*.quantity').isNumeric().withMessage('Количество должно быть числом'),
  body('products.*.price').isNumeric().withMessage('Цена должна быть числом'),
  body('arrivedAt').isISO8601().withMessage('Неверный формат даты прибытия'),
  body('expiryDate').optional().isISO8601().withMessage('Неверный формат даты срока годности'),
  body('transportCost').optional().isNumeric().withMessage('Стоимость транспортировки должна быть числом'),
  body('notes').optional().trim(),
];

// Создание новой партии
router.post('/', 
  authMiddleware,
  batchValidation,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Проверка существования всех продуктов
      for (const item of req.body.products) {
        const product = await Product.findById(item.product);
        if (!product) {
          return res.status(404).json({ 
            message: `Продукт с ID ${item.product} не найден` 
          });
        }
      }

      const batch = new Batch({
        ...req.body,
        transportCost: req.body.transportCost || 0
      });

      await batch.save();
      res.status(201).json(batch);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Получение списка партий
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, expired } = req.query;
    let query = {};

    if (startDate || endDate) {
      query.arrivedAt = {};
      if (startDate) {
        query.arrivedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.arrivedAt.$lte = new Date(endDate);
      }
    }

    if (expired === 'true') {
      query.expiryDate = { $lt: new Date() };
    } else if (expired === 'false') {
      query.expiryDate = { $gte: new Date() };
    }

    const batches = await Batch.find(query)
      .populate('products.product')
      .sort({ arrivedAt: -1 });
    res.json(batches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение партии по ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id)
      .populate('products.product');
    if (!batch) {
      return res.status(404).json({ message: 'Партия не найдена' });
    }
    res.json(batch);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Обновление партии
router.patch('/:id', 
  authMiddleware,
  batchValidation,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const batch = await Batch.findById(req.params.id);
      if (!batch) {
        return res.status(404).json({ message: 'Партия не найдена' });
      }

      // Проверка существования всех продуктов
      if (req.body.products) {
        for (const item of req.body.products) {
          const product = await Product.findById(item.product);
          if (!product) {
            return res.status(404).json({ 
              message: `Продукт с ID ${item.product} не найден` 
            });
          }
        }
      }

      Object.assign(batch, req.body);
      await batch.save();
      res.json(batch);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Удаление партии
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id);
    if (!batch) {
      return res.status(404).json({ message: 'Партия не найдена' });
    }

    await batch.deleteOne();
    res.json({ message: 'Партия успешно удалена' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение статистики по партиям
router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let match = {};

    if (startDate || endDate) {
      match.arrivedAt = {};
      if (startDate) {
        match.arrivedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        match.arrivedAt.$lte = new Date(endDate);
      }
    }

    const stats = await Batch.aggregate([
      { $match: match },
      { $unwind: '$products' },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: '$products.quantity' },
          totalValue: { $sum: { $multiply: ['$products.quantity', '$products.price'] } },
          totalTransportCost: { $sum: '$transportCost' }
        }
      }
    ]);

    res.json(stats[0] || { totalProducts: 0, totalValue: 0, totalTransportCost: 0 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение просроченных партий
router.get('/expired', authMiddleware, async (req, res) => {
  try {
    const batches = await Batch.find({
      expiryDate: { $lt: new Date() }
    })
      .populate('products.product')
      .sort({ expiryDate: 1 });
    
    res.json(batches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
