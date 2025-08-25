const express = require("express");
const router = express.Router();
const productImageUpdateService = require("../services/productImageUpdateService");

/**
 * @swagger
 * tags:
 *   name: ProductImageUpdate
 *   description: Управление обновлением изображений продуктов
 */

/**
 * @swagger
 * /api/product-image-update/status:
 *   get:
 *     summary: Получить статус сервиса обновления изображений
 *     tags: [ProductImageUpdate]
 *     responses:
 *       200:
 *         description: Статус сервиса
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isRunning:
 *                   type: boolean
 *                   description: Работает ли сервис
 *                 schedule:
 *                   type: string
 *                   description: Cron выражение расписания
 *                 timezone:
 *                   type: string
 *                   description: Часовой пояс
 *                 description:
 *                   type: string
 *                   description: Описание сервиса
 *                 nextExecutions:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Время запуска в течение дня
 */
router.get("/status", (req, res) => {
  try {
    const status = productImageUpdateService.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ 
      message: "Ошибка получения статуса", 
      error: error.message 
    });
  }
});

/**
 * @swagger
 * /api/product-image-update/start:
 *   post:
 *     summary: Запустить сервис обновления изображений
 *     tags: [ProductImageUpdate]
 *     responses:
 *       200:
 *         description: Сервис запущен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Сервис обновления изображений запущен"
 *       400:
 *         description: Сервис уже запущен
 */
router.post("/start", (req, res) => {
  try {
    productImageUpdateService.startScheduledUpdates();
    res.json({ message: "Сервис обновления изображений запущен" });
  } catch (error) {
    res.status(400).json({ 
      message: "Ошибка запуска сервиса", 
      error: error.message 
    });
  }
});

/**
 * @swagger
 * /api/product-image-update/stop:
 *   post:
 *     summary: Остановить сервис обновления изображений
 *     tags: [ProductImageUpdate]
 *     responses:
 *       200:
 *         description: Сервис остановлен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Сервис обновления изображений остановлен"
 *       400:
 *         description: Сервис не запущен
 */
router.post("/stop", (req, res) => {
  try {
    productImageUpdateService.stopScheduledUpdates();
    res.json({ message: "Сервис обновления изображений остановлен" });
  } catch (error) {
    res.status(400).json({ 
      message: "Ошибка остановки сервиса", 
      error: error.message 
    });
  }
});

/**
 * @swagger
 * /api/product-image-update/manual-update:
 *   post:
 *     summary: Запустить ручное обновление изображений
 *     tags: [ProductImageUpdate]
 *     responses:
 *       200:
 *         description: Обновление завершено успешно
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Ручное обновление завершено"
 *                 result:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                     totalProcessed:
 *                       type: number
 *                       description: Общее количество обработанных продуктов
 *                     totalUpdated:
 *                       type: number
 *                       description: Количество обновленных продуктов
 *                     totalErrors:
 *                       type: number
 *                       description: Количество ошибок
 *       500:
 *         description: Ошибка при обновлении
 */
router.post("/manual-update", async (req, res) => {
  try {
    const result = await productImageUpdateService.manualUpdate();
    
    if (result.success) {
      res.json({ 
        message: "Ручное обновление завершено", 
        result 
      });
    } else {
      res.status(500).json({ 
        message: "Ошибка при обновлении", 
        error: result.error 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      message: "Ошибка выполнения ручного обновления", 
      error: error.message 
    });
  }
});

module.exports = router;
