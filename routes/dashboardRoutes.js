/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Dashboard статистикаси
 */

/**
 * @swagger
 * /api/dashboard/summary:
 *   get:
 *     summary: Dashboard учун барча метрикаларни олиш (top cards, графиклар, сўнгги хизматлар, топ махсулотлар)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startofMonth
 *         schema:
 *           type: string
 *           format: date
 *         description: Ой бошланиш санаси
 *       - in: query
 *         name: endofManth
 *         schema:
 *           type: string
 *           format: date
 *         description: Ой тугаш санаси
 *     responses:
 *       200:
 *         description: Dashboard маълумотлари
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
 *                       description: Буонги хизматлар сони
 *                     todayIncome:
 *                       type: object
 *                       properties:
 *                         usd:
 *                           type: number
 *                         uzs:
 *                           type: number
 *                       description: Буонги даромад
 *                     monthlyIncome:
 *                       type: object
 *                       properties:
 *                         usd:
 *                           type: number
 *                         uzs:
 *                           type: number
 *                       description: Ойлик даромад
 *                     stockCount:
 *                       type: integer
 *                       description: Омборда мавжуд махсулотлар сони
 *                     lowStockProducts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           quantity:
 *                             type: number
 *                       description: Кам қолган махсулотлар
 *                     productCapital:
 *                       type: object
 *                       properties:
 *                         usd:
 *                           type: number
 *                         uzs:
 *                           type: number
 *                       description: Махсулотлар капитали
 *                     totalDebts:
 *                       type: object
 *                       properties:
 *                         usd:
 *                           type: number
 *                         uzs:
 *                           type: number
 *                       description: Умумий қарзлар
 *                     newClientsCount:
 *                       type: integer
 *                       description: Буонги янги мижозлар
 *                     totalClientsCount:
 *                       type: integer
 *                       description: Жами мижозлар
 *                     totalDebtorsCount:
 *                       type: integer
 *                       description: Жами қарздорлар
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
 *                           usd:
 *                             type: number
 *                           uzs:
 *                             type: number
 *                       description: Ҳафталик даромад графиги
 *                     servicesByType:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           count:
 *                             type: integer
 *                       description: Хизматлар тури бўйича статистика
 *                 latestServices:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       client:
 *                         type: string
 *                         description: Мижоз исми
 *                       car:
 *                         type: string
 *                         description: Машина маълумоти
 *                       service:
 *                         type: string
 *                         description: Хизмат тури
 *                       totalPrice:
 *                         type: object
 *                         description: Жами нарх
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         description: Яратилган сана
 *                   description: Сўнгги хизматлар
 *                 topProducts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       count:
 *                         type: number
 *                       totalAmount:
 *                         type: number
 *                   description: Топ махсулотлар
 *       500:
 *         description: Сервер хатоси
 */

const express = require("express");
const router = express.Router();
const Transaction = require("../models/transactions/transaction.model");
const Product = require("../models/products/product.model");
const Service = require("../models/services/service.model");
const Client = require("../models/clients/client.model");
const Debtor = require("../models/debtors/debtor.model");

// Ҳафталик даромадни Transaction'лардан олиш
async function getWeeklyIncomeFromTransactions() {
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

    const dayIncome = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lt: end },
          type: { $in: ["cash-in", "order", "service", "debt-payment"] },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: null,
          usd: { $sum: "$amount.usd" },
          uzs: { $sum: "$amount.uzs" },
        },
      },
    ]);

    result.push({
      date: start,
      usd: dayIncome[0]?.usd || 0,
      uzs: dayIncome[0]?.uzs || 0,
    });
  }
  return result;
}

// Dashboard учун асосий route
router.get("/summary", async (req, res) => {
  try {
    let { startofMonth, endofManth } = req.query;

    // Агар саналар берилмаган бўлса, жорий ойни олиш
    if (!startofMonth || !endofManth) {
      const now = new Date();
      startofMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      endofManth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else {
      startofMonth = new Date(startofMonth);
      endofManth = new Date(endofManth);
    }

    // Вақт оралигини белгилаш
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Ҳафталик даромад (Transaction'лардан)
    const weeklyIncome = await getWeeklyIncomeFromTransactions();

    // Буонги даромад (Transaction'лардан)
    const todayIncomeAgg = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: today, $lt: tomorrow },
          type: { $in: ["cash-in", "order", "service", "debt-payment"] },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: null,
          totalUsd: { $sum: "$amount.usd" },
          totalUzs: { $sum: "$amount.uzs" },
        },
      },
    ]);

    const todayIncome = {
      usd: todayIncomeAgg[0]?.totalUsd || 0,
      uzs: todayIncomeAgg[0]?.totalUzs || 0,
    };

    // Ойлик даромад (Transaction'лардан)
    const monthlyIncomeAgg = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startofMonth, $lt: endofManth },
          type: { $in: ["cash-in", "order", "service", "debt-payment"] },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: null,
          totalUsd: { $sum: "$amount.usd" },
          totalUzs: { $sum: "$amount.uzs" },
        },
      },
    ]);

    const monthlyIncome = {
      usd: monthlyIncomeAgg[0]?.totalUsd || 0,
      uzs: monthlyIncomeAgg[0]?.totalUzs || 0,
    };

    // Получаем список VIP клиентов
    const vipClients = await Client.find({ isVip: true }).select("_id");
    const vipClientIds = vipClients.map((c) => c._id);

    // Параллел равишда бошқа маълумотларни олиш
    const [
      stockCount,
      lowStockProducts,
      servicesByType,
      latestServices,

      // Мижозлар ҳақида маълумот
      totalVipClientsCount,
      totalRegularClientsCount,
      newVipClientsCount,
      newRegularClientsCount,

      // Қарздорлар сони
      vipDebtorsCount,
      regularDebtorsCount,

      // Қарз миқдори
      vipDebtsAgg,
      regularDebtsAgg,

      // Маҳсулот капитали (филиаллар бўйича)
      productCapitalByBranchAgg,

      // Буонги хизматлар сони
      todayServicesCount,
    ] = await Promise.all([
      // Махсулотлар сони
      Product.countDocuments({
        quantity: { $gt: 0 },
        isDeleted: { $ne: true },
      }),

      // Кам қолган махсулотлар 10 та
      Product.find({ quantity: { $lt: 5 }, isDeleted: { $ne: true } })
        .select("name quantity")
        .sort({ quantity: 1 })
        .limit(20),

      // Хизматлар тури бўйича
      Service.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        { $group: { _id: "$serviceType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Охирги хизматлар
      Service.find({ isDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("client", "fullName")
        .populate("car.model", "name"),

      // VIP мижозлар сони
      Client.countDocuments({ isVip: true }),

      // Оддий мижозлар сони
      Client.countDocuments({ isVip: { $ne: true } }),

      // Бугунги VIP мижозлар сони
      Client.countDocuments({
        isVip: true,
        createdAt: { $gte: today, $lt: tomorrow },
      }),

      // Бугунги оддий мижозлар сони
      Client.countDocuments({
        isVip: { $ne: true },
        createdAt: { $gte: today, $lt: tomorrow },
      }),

      // VIP қарздорлар сони
      Debtor.countDocuments({
        isDeleted: { $ne: true },
        client: { $in: vipClientIds },
        remainingDebt: { $gt: 0 },
      }),

      // Оддий қарздорлар сони
      Debtor.countDocuments({
        isDeleted: { $ne: true },
        client: { $nin: vipClientIds },
        remainingDebt: { $gt: 0 },
      }),

      // VIP долги
      Debtor.aggregate([
        { $match: { isDeleted: { $ne: true }, client: { $in: vipClientIds } } },
        {
          $group: {
            _id: null,
            totalUsd: { $sum: "$currentDebt.usd" },
            totalUzs: { $sum: "$currentDebt.uzs" },
          },
        },
      ]),

      // Долги обычных клиентов
      Debtor.aggregate([
        {
          $match: { isDeleted: { $ne: true }, client: { $nin: vipClientIds } },
        },
        {
          $group: {
            _id: null,
            totalUsd: { $sum: "$currentDebt.usd" },
            totalUzs: { $sum: "$currentDebt.uzs" },
          },
        },
      ]),

      // Маҳсулот капитали (филиаллар бўйича)
      Product.aggregate([
        { $match: { isDeleted: { $ne: true } } },
        {
          $group: {
            _id: { branch: "$branch", currency: "$currency" },
            capital: { $sum: { $multiply: ["$costPrice", "$quantity"] } },
          },
        },
        {
          $project: {
            _id: 0,
            branch: "$_id.branch",
            currency: "$_id.currency",
            capital: 1,
          },
        },
      ]),

      // Буонги хизматлар сони
      Transaction.countDocuments({
        createdAt: { $gte: today, $lt: tomorrow },
        type: "service",
        isDeleted: { $ne: true },
      }),
    ]);

    // Маҳсулот капиталини филиаллар бўйича гуруҳлаш
    const branchesMap = {
      "6877dd28939ecd40fa5fc930": "Lola",
      "6888ece4c7df5aa9cb6924a0": "Asosiy",
    };

    // Инициализируем объект для обоих филиалов с нулевыми значениями
    const productCapitalByBranch = {
      Lola: { usd: 0, uzs: 0 },
      Asosiy: { usd: 0, uzs: 0 },
    };

    for (const item of productCapitalByBranchAgg) {
      const branchId = item.branch ? item.branch.toString() : "unknown";
      const branchName = branchesMap[branchId] || "unknown";

      if (item.currency === "USD") {
        productCapitalByBranch[branchName].usd += item.capital;
      } else if (item.currency === "UZS") {
        productCapitalByBranch[branchName].uzs += item.capital;
      }
    }

    // Умумий маҳсулот капитали
    const productCapital = {
      usd: Object.values(productCapitalByBranch).reduce(
        (sum, item) => sum + item.usd,
        0
      ),
      uzs: Object.values(productCapitalByBranch).reduce(
        (sum, item) => sum + item.uzs,
        0
      ),
      byBranch: productCapitalByBranch,
    };

    // Долги VIP и обычных клиентов
    const vipDebts = {
      usd: vipDebtsAgg[0]?.totalUsd || 0,
      uzs: vipDebtsAgg[0]?.totalUzs || 0,
    };

    const regularDebts = {
      usd: regularDebtsAgg[0]?.totalUsd || 0,
      uzs: regularDebtsAgg[0]?.totalUzs || 0,
    };

    // Умумий қарзлар
    const totalDebts = {
      usd: vipDebts.usd + regularDebts.usd,
      uzs: vipDebts.uzs + regularDebts.uzs,
    };

    // Топ махсулотлар (Transaction'лар орқали)
    const topProductsFromTransactions = await Transaction.aggregate([
      {
        $match: {
          type: { $in: ["order", "service"] },
          isDeleted: { $ne: true },
          createdAt: { $gte: startofMonth, $lt: endofManth },
        },
      },
      {
        $group: {
          _id: "$relatedId",
          count: { $sum: 1 },
          totalAmount: {
            $sum: { $add: ["$amount.usd", "$amount.uzs"] },
          },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Response форматини яратиш
    const topCards = {
      todayServicesCount,
      todayIncome,
      monthlyIncome,
      stockCount,
      lowStockProducts,
      productCapital,

      // Мижозлар сони
      clients: {
        vip: {
          total: totalVipClientsCount,
          new: newVipClientsCount,
        },
        regular: {
          total: totalRegularClientsCount,
          new: newRegularClientsCount,
        },
        total: totalVipClientsCount + totalRegularClientsCount,
        new: newVipClientsCount + newRegularClientsCount,
      },

      // Қарздорлар
      debtors: {
        vip: {
          count: vipDebtorsCount,
          amount: vipDebts,
        },
        regular: {
          count: regularDebtorsCount,
          amount: regularDebts,
        },
        total: {
          count: vipDebtorsCount + regularDebtorsCount,
          amount: totalDebts,
        },
      },
    };

    const charts = {
      weeklyIncome,
      servicesByType,
    };

    const latestServicesFormatted = latestServices.map((s) => ({
      client: s.client?.fullName || "Noma'lum",
      car: s.car?.model?.name || s.car?.plateNumber || "Noma'lum",
      service: s.serviceType || "Xizmat",
      totalPrice: s.totalPrice || { usd: 0, uzs: 0 },
      createdAt: s.createdAt,
    }));

    res.json({
      success: true,
      data: {
        topCards,
        charts,
        latestServices: latestServicesFormatted,
        topProducts: topProductsFromTransactions,
      },
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: "Dashboard summary olishda xatolik",
      error: e.message,
    });
  }
});

module.exports = router;
