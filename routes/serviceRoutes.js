const express = require('express');
const router = express.Router();
const Service = require('../models/services/service.model');
const authMiddleware = require('../middleware/authMiddleware');
const { body, validationResult } = require('express-validator');

// Валидация для создания/обновления услуги
const serviceValidation = [
  body('name').trim().notEmpty().withMessage('Название услуги обязательно'),
  body('description').optional().trim(),
  body('price').isNumeric().withMessage('Цена должна быть числом'),
  body('duration').optional().isNumeric().withMessage('Длительность должна быть числом'),
  body('isActive').optional().isBoolean().withMessage('Статус должен быть булевым значением'),
  body('branch').optional().isMongoId().withMessage('Неверный ID филиала'),
  body('createdBy').optional().isMongoId().withMessage('Неверный ID создателя'),
];

// Создание новой услуги
router.post('/', 
  authMiddleware,
  serviceValidation,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Проверка уникальности названия
      const existingService = await Service.findOne({ name: req.body.name });
      if (existingService) {
        return res.status(400).json({ 
          message: 'Услуга с таким названием уже существует' 
        });
      }

      const service = new Service({
        ...req.body,
        isActive: req.body.isActive !== undefined ? req.body.isActive : true
      });

      await service.save();
      res.status(201).json(service);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Получение списка услуг
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { branch, isActive, search } = req.query;
    let query = {};

    if (branch) {
      query.branch = branch;
    }
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const services = await Service.find(query)
      .populate('branch')
      .populate('createdBy')
      .sort({ createdAt: -1 });
    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение услуги по ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('branch')
      .populate('createdBy');
    if (!service) {
      return res.status(404).json({ message: 'Услуга не найдена' });
    }
    res.json(service);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Обновление услуги
router.patch('/:id', 
  authMiddleware,
  serviceValidation,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const service = await Service.findById(req.params.id);
      if (!service) {
        return res.status(404).json({ message: 'Услуга не найдена' });
      }

      // Проверка уникальности названия при изменении
      if (req.body.name && req.body.name !== service.name) {
        const existingService = await Service.findOne({ name: req.body.name });
        if (existingService) {
          return res.status(400).json({ 
            message: 'Услуга с таким названием уже существует' 
          });
        }
      }

      Object.assign(service, req.body);
      await service.save();
      res.json(service);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Удаление услуги (мягкое удаление)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Услуга не найдена' });
    }

    service.isDeleted = true;
    await service.save();
    res.json({ message: 'Услуга успешно удалена' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение статистики по услугам
router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const { branch, startDate, endDate } = req.query;
    let match = { isDeleted: false };

    if (branch) {
      match.branch = branch;
    }
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) {
        match.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        match.createdAt.$lte = new Date(endDate);
      }
    }

    const stats = await Service.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalServices: { $sum: 1 },
          activeServices: {
            $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
          },
          averagePrice: { $avg: '$price' },
          totalDuration: { $sum: '$duration' }
        }
      }
    ]);

    res.json(stats[0] || { 
      totalServices: 0, 
      activeServices: 0, 
      averagePrice: 0, 
      totalDuration: 0 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Поиск услуг
router.get('/search/:query', authMiddleware, async (req, res) => {
  try {
    const { query } = req.params;
    const services = await Service.find({
      name: { $regex: query, $options: 'i' },
      isDeleted: false
    })
      .populate('branch')
      .limit(10);
    
    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
