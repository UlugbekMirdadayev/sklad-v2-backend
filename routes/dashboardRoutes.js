/**
 * @swagger
 * /api/dashboard/summary:
 *   get:
 *     summary: Получить все метрики для Dashboard (top cards, графики, последние услуги, топ продукты)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Данные для Dashboard
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 topCards:
 *                   type: object
 *                   properties:
 *                     todayServicesCount:
 *                       type: integer
 *                     todayIncome:
 *                       type: number
 *                     stockCount:
 *                       type: integer
 *                     lowStockProducts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           quantity:
 *                             type: number
 *                     productCapital:
 *                       type: number
 *                 charts:
 *                   type: object
 *                   properties:
 *                     weeklyIncome:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                             format: date-time
 *                           total:
 *                             type: number
 *                     servicesByType:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           count:
 *                             type: integer
 *                 latestServices:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       client:
 *                         type: string
 *                       car:
 *                         type: string
 *                       service:
 *                         type: string
 *                       paidAmount:
 *                         type: number
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 topProducts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       used:
 *                         type: number
 */

const express = require("express");
const router = express.Router();
const Order = require("../models/orders/order.model");
const Product = require("../models/products/product.model");
const Service = require("../models/services/service.model");

// Универсальный роут для dashboard
router.get("/summary", async (req, res) => {
  try {
    // 1. Top Cards
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const [
      todayServicesCount,
      todayIncomeAgg,
      stockCount,
      lowStockProducts,
      // 2. Charts
      weeklyIncome,
      servicesByType,
      // 3. Latest services
      latestServicesDocs,
      // 4. Top used products
      topProductsAgg,
    ] = await Promise.all([
      Service.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } }),
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: today, $lt: tomorrow },
            isDeleted: false,
          },
        },
        { $group: { _id: null, total: { $sum: "$paidAmount" } } },
      ]),
      Product.countDocuments({ quantity: { $gt: 0 } }),
      Product.find({ quantity: { $lt: 5 } }).select("name quantity"),
      // Weekly income
      (async () => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const days = [];
        for (let i = 6; i >= 0; i--) {
          const day = new Date(now);
          day.setDate(now.getDate() - i);
          days.push(day);
        }
        const result = [];
        for (let i = 0; i < days.length; i++) {
          const start = days[i];
          const end = new Date(start);
          end.setDate(start.getDate() + 1);
          const orders = await Order.aggregate([
            {
              $match: {
                createdAt: { $gte: start, $lt: end },
                isDeleted: false,
              },
            },
            { $group: { _id: null, total: { $sum: "$paidAmount" } } },
          ]);
          result.push({ date: start, total: orders[0]?.total || 0 });
        }
        return result;
      })(),
      // Services by type
      Service.aggregate([
        { $group: { _id: "$name", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      // Latest services
      Service.find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("client")
        .populate("car"),
      // Top used products
      Order.aggregate([
        { $unwind: "$products" },
        {
          $group: {
            _id: "$products.product",
            used: { $sum: "$products.quantity" },
          },
        },
        { $sort: { used: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        { $project: { _id: 0, name: "$product.name", used: 1 } },
      ]),
    ]);

    // productCapital: сумма всех (costPrice * quantity) по складу
    const productCapitalAgg = await Product.aggregate([
      {
        $group: {
          _id: null,
          capital: { $sum: { $multiply: ["$costPrice", "$quantity"] } },
        },
      },
    ]);
    const productCapital = productCapitalAgg[0]?.capital || 0;

    const topCards = {
      todayServicesCount,
      todayIncome: todayIncomeAgg[0]?.total || 0,
      stockCount,
      lowStockProducts,
      productCapital,
    };

    const charts = {
      weeklyIncome,
      servicesByType,
    };

    const latestServices = latestServicesDocs.map((s) => ({
      client: s.client?.name,
      car: s.car,
      service: s.name,
      paidAmount: s.paidAmount,
      createdAt: s.createdAt,
    }));

    res.json({
      topCards,
      charts,
      latestServices,
      topProducts: topProductsAgg,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
