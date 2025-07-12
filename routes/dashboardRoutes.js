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
const Client = require("../models/clients/client.model");

// Универсальный роут для dashboard
router.get("/summary", async (req, res) => {
  try {
    let { startofMonth, endofManth } = req.query;
    startofMonth = new Date(startofMonth);
    endofManth = new Date(endofManth);
    // 1. Top Cards
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const [
      todayServicesCount,
      stockCount,
      lowStockProducts,
      weeklyIncome,
      servicesByType,
      latestServicesDocs,
      topProductsAgg,
      todayIncomeAgg,
      todayDebts,
      totalDebts,
    ] = await Promise.all([
      Service.find({ createdAt: { $gte: today, $lt: tomorrow } })
        .populate("branch", "name")
        .populate("client", "fullName")
        .populate("car.model", "name")
        .populate("services.service"),
      Product.countDocuments({ quantity: { $gt: 0 } }),
      Product.find({ quantity: { $lt: 5 } }).select("name quantity"),
      // Weekly income by currency
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
          // Группируем по валюте
          const orders = await Order.aggregate([
            {
              $match: {
                createdAt: { $gte: start, $lt: end },
                isDeleted: false,
              },
            },
            { $unwind: "$products" },
            {
              $lookup: {
                from: "products",
                localField: "products.product",
                foreignField: "_id",
                as: "productInfo",
              },
            },
            { $unwind: "$productInfo" },
            {
              $group: {
                _id: "$productInfo.currency",
                total: {
                  $sum: {
                    $multiply: ["$products.price", "$products.quantity"],
                  },
                },
              },
            },
          ]);
          // Формируем результат по валютам
          let uzs = 0,
            usd = 0;
          for (const o of orders) {
            if (o._id === "UZS") uzs = o.total;
            if (o._id === "USD") usd = o.total;
          }
          result.push({ date: start, uzs, usd });
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
      // Today income by currency
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: today, $lt: tomorrow },
            isDeleted: false,
          },
        },
        { $unwind: "$products" },
        {
          $lookup: {
            from: "products",
            localField: "products.product",
            foreignField: "_id",
            as: "productInfo",
          },
        },
        { $unwind: { path: "$productInfo", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "clients",
            localField: "client",
            foreignField: "_id",
            as: "ClientInfo",
          },
        },
        {
          $unwind: {
            path: "$ClientInfo",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "branches",
            localField: "branch",
            foreignField: "_id",
            as: "branchInfo",
          },
        },
        {
          $unwind: {
            path: "$branchInfo",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: "$productInfo.currency",
            total: {
              $sum: { $multiply: ["$products.price", "$products.quantity"] },
            },
            client: {
              $first: {
                fullName: "$ClientInfo.fullName",
                phone: "$ClientInfo.phone",
              },
            },
            products: {
              $push: {
                product: "$productInfo",
              },
            },
            branch: {
              $first: {
                name: "$branchInfo.name",
              },
            },
            status: { $first: "$status" },
            date_returned: { $first: "$date_returned" },
            paymentType: { $first: "$paymentType" },
            notes: { $first: "$notes" },
            orderType: { $first: "$orderType" },
            totalAmount: { $first: "$totalAmount" },
            paidAmount: { $first: "$paidAmount" },
            debtAmount: { $first: "$debtAmount" },
          },
        },
      ]),
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: today, $lt: tomorrow },
            isDeleted: false,
          },
        },
        { $unwind: "$products" },
        {
          $lookup: {
            from: "products",
            localField: "products.product",
            foreignField: "_id",
            as: "productInfo",
          },
        },
        { $unwind: { path: "$productInfo", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "clients",
            localField: "client",
            foreignField: "_id",
            as: "ClientInfo",
          },
        },
        {
          $unwind: {
            path: "$ClientInfo",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "branches",
            localField: "branch",
            foreignField: "_id",
            as: "branchInfo",
          },
        },
        {
          $unwind: {
            path: "$branchInfo",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: "$productInfo.currency",
            total: {
              $sum: { $multiply: ["$products.price", "$products.quantity"] },
            },
            client: {
              $first: {
                fullName: "$ClientInfo.fullName",
                phone: "$ClientInfo.phone",
              },
            },
            products: {
              $push: {
                product: "$productInfo",
              },
            },
            branch: {
              $first: {
                name: "$branchInfo.name",
              },
            },
            status: { $first: "$status" },
            date_returned: { $first: "$date_returned" },
            paymentType: { $first: "$paymentType" },
            notes: { $first: "$notes" },
            orderType: { $first: "$orderType" },
            totalAmount: { $first: "$totalAmount" },
            paidAmount: { $first: "$paidAmount" },
            debtAmount: { $first: "$debtAmount" },
          },
        },
      ]),
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startofMonth, $lt: endofManth },
            isDeleted: false,
          },
        },
        { $unwind: "$products" },
        {
          $lookup: {
            from: "products",
            localField: "products.product",
            foreignField: "_id",
            as: "productInfo",
          },
        },
        { $unwind: { path: "$productInfo", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "clients",
            localField: "client",
            foreignField: "_id",
            as: "ClientInfo",
          },
        },
        {
          $unwind: {
            path: "$ClientInfo",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "branches",
            localField: "branch",
            foreignField: "_id",
            as: "branchInfo",
          },
        },
        {
          $unwind: {
            path: "$branchInfo",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: "$productInfo.currency",
            total: {
              $sum: { $multiply: ["$products.price", "$products.quantity"] },
            },
            client: {
              $first: {
                fullName: "$ClientInfo.fullName",
                phone: "$ClientInfo.phone",
              },
            },
            products: {
              $push: {
                product: "$productInfo",
              },
            },
            branch: {
              $first: {
                name: "$branchInfo.name",
              },
            },
            status: { $first: "$status" },
            date_returned: { $first: "$date_returned" },
            paymentType: { $first: "$paymentType" },
            notes: { $first: "$notes" },
            orderType: { $first: "$orderType" },
            totalAmount: { $first: "$totalAmount" },
            paidAmount: { $first: "$paidAmount" },
            debtAmount: { $first: "$debtAmount" },
          },
        },
      ]),
    ]);

    // productCapital: сумма всех (costPrice * quantity) по складу, отдельно по валютам
    const productCapitalAgg = await Product.aggregate([
      {
        $group: {
          _id: "$currency",
          capital: { $sum: { $multiply: ["$costPrice", "$quantity"] } },
        },
      },
    ]);
    let productCapital = { uzs: 0, usd: 0 };
    for (const row of productCapitalAgg) {
      if (row._id === "UZS") productCapital.uzs = row.capital;
      if (row._id === "USD") productCapital.usd = row.capital;
    }

    // Общий профит (foyda) и оборот по валютам
    const allOrders = await Order.find({
      isDeleted: false,
    }).populate("products.product");
    let totalProfit = { uzs: 0, usd: 0 };
    let totalSales = { uzs: 0, usd: 0 };
    let todayProfit = { uzs: 0, usd: 0 };
    let todaySales = { uzs: 0, usd: 0 };
    for (const order of allOrders) {
      for (const op of order.products) {
        const currency = op.product?.currency || "UZS";
        const cost = (op.product?.costPrice || 0) * (op.quantity || 0);
        const revenue = (op.price || 0) * (op.quantity || 0);
        if (order.createdAt >= today && order.createdAt <= tomorrow) {
          if (currency === "UZS") {
            todayProfit.uzs += revenue - cost;
            todaySales.uzs += revenue;
          } else if (currency === "USD") {
            todayProfit.usd += revenue - cost;
            todaySales.usd += revenue;
          }
        } else if (
          order.createdAt >= startofMonth &&
          order.createdAt <= endofManth
        ) {
          if (currency === "UZS") {
            totalProfit.uzs += revenue - cost;
            totalSales.uzs += revenue;
          } else if (currency === "USD") {
            totalProfit.usd += revenue - cost;
            totalSales.usd += revenue;
          }
        }
      }
    }

    // Количество новых клиентов за сегодня
    const newClientsCount = await Client.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow },
    });
    // Общее количество клиентов
    const totalClientsCount = await Client.countDocuments({});

    // Today income by currency
    let todayIncome = { uzs: 0, usd: 0 };
    for (const row of todayIncomeAgg) {
      if (row._id === "UZS") todayIncome.uzs = row.total;
      if (row._id === "USD") todayIncome.usd = row.total;
    }

    let totalDebt = { uzs: 0, usd: 0 };
    for (const row of totalDebts) {
      if (row.debtAmount.usd > 0) {
        totalDebt.usd += row.debtAmount.usd;
      }
      if (row.debtAmount.uzs > 0) {
        totalDebt.uzs += row.debtAmount.uzs;
      }
    }

    let todayDebt = { uzs: 0, usd: 0 };
    for (const row of todayDebts) {
      if (row.debtAmount.usd > 0) {
        todayDebt.usd += row.debtAmount.usd;
      }
      if (row.debtAmount.uzs > 0) {
        todayDebt.uzs += row.debtAmount.uzs;
      }
    }

    const topCards = {
      todayServicesCount: todayServicesCount.length,
      todayIncome,
      stockCount,
      lowStockProducts,
      productCapital,
      totalProfit,
      totalSales,
      todayProfit,
      todaySales,
      newClientsCount,
      totalClientsCount,
      totalDebt,
      todayDebt,
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
      todayServices: todayServicesCount,
      todayIncomes: todayIncomeAgg,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
