const Transaction = require("../models/transactions/transaction.model");
const mongoose = require("mongoose");

class TransactionHelper {
  
  /**
   * Order yaratilganda transaction yaratish
   * Транзакция создается только если заказ уже completed
   */
  static async createOrderTransaction(order) {
    try {
      // Транзакция создается только для completed заказов
      if (order.status !== "completed") {
        console.log(`⚠️ Order ${order._id} statusu "${order.status}", transaction yaratilmaydi`);
        return null;
      }

      const transaction = new Transaction({
        type: "order",
        amount: order.paidAmount,
        paymentType: order.paymentType,
        description: `Order #${order._id} uchun to'lov`,
        relatedModel: "Order",
        relatedId: order._id,
        client: order.client,
        branch: order.branch,
        createdBy: order.createdBy || null,
      });

      await transaction.save();
      console.log(`✅ Order transaction yaratildi: ${transaction._id}`);
      return transaction;
    } catch (error) {
      console.error("❌ Order transaction yaratishda xatolik:", error.message);
      throw error;
    }
  }

  /**
   * Service yaratilganda transaction yaratish
   */
  static async createServiceTransaction(service) {
    try {
      // Service'da paidAmount yo'q bo'lsa, totalPrice ni to'langan deb hisoblaymiz
      const paidAmount = service.paidAmount || service.totalPrice || { usd: 0, uzs: 0 };
      
      const transaction = new Transaction({
        type: "service",
        amount: paidAmount,
        paymentType: service.paymentType || "cash",
        description: `Service #${service._id} uchun to'lov`,
        relatedModel: "Service",
        relatedId: service._id,
        client: service.client,
        branch: service.branch,
        createdBy: service.createdBy || null,
      });

      await transaction.save();
      console.log(`✅ Service transaction yaratildi: ${transaction._id}`);
      return transaction;
    } catch (error) {
      console.error("❌ Service transaction yaratishda xatolik:", error.message);
      throw error;
    }
  }

  /**
   * Qarzdor pul to'laganda debt-payment transaction yaratish
   */
  static async createDebtPaymentTransaction(debtor, paymentAmount, paymentType = "cash", description = "") {
    try {
      const transaction = new Transaction({
        type: "debt-payment",
        amount: paymentAmount,
        paymentType: paymentType,
        description: description || `Qarzdor ${debtor.client} uchun qarz to'lovi`,
        relatedModel: "Debtor",
        relatedId: debtor._id,
        client: debtor.client,
        branch: debtor.branch || null,
        createdBy: debtor.createdBy || null,
      });

      await transaction.save();
      console.log(`✅ Debt payment transaction yaratildi: ${transaction._id}`);
      return transaction;
    } catch (error) {
      console.error("❌ Debt payment transaction yaratishda xatolik:", error.message);
      throw error;
    }
  }

  /**
   * Order yangilanganda bog'langan transaction'ni yangilash
   * Транзакция обрабатывается только для completed заказов
   */
  static async updateOrderTransaction(orderId, updatedOrder, oldOrder) {
    try {
      // Bog'langan transaction'ni topish
      const transaction = await Transaction.findOne({
        relatedModel: "Order",
        relatedId: orderId,
        isDeleted: false
      });

      // Если заказ стал completed, а раньше не был - создаем транзакцию
      if (updatedOrder.status === "completed" && oldOrder.status !== "completed") {
        if (!transaction) {
          // Создаем новую транзакцию
          return await this.createOrderTransaction(updatedOrder);
        } else {
          // Активируем существующую транзакцию
          transaction.amount = updatedOrder.paidAmount || { usd: 0, uzs: 0 };
          transaction.paymentType = updatedOrder.paymentType || transaction.paymentType;
          transaction.description = `Order #${orderId} uchun to'lov (faollashtirildi)`;
          transaction.updatedAt = new Date();
          await transaction.save();
          console.log(`✅ Order transaction faollashtirildi: ${transaction._id}`);
          return transaction;
        }
      }

      // Если заказ стал не completed, а раньше был - деактивируем транзакцию
      if (updatedOrder.status !== "completed" && oldOrder.status === "completed") {
        if (transaction) {
          transaction.amount = { usd: 0, uzs: 0 };
          transaction.description = `Order #${orderId} uchun to'lov (deaktivatsiya qilindi)`;
          transaction.updatedAt = new Date();
          await transaction.save();
          console.log(`✅ Order transaction deaktivatsiya qilindi: ${transaction._id}`);
          return transaction;
        }
      }

      // Если заказ остается completed и транзакция существует - обновляем данные
      if (updatedOrder.status === "completed" && oldOrder.status === "completed" && transaction) {
        const oldPaidAmount = oldOrder.paidAmount || { usd: 0, uzs: 0 };
        const newPaidAmount = updatedOrder.paidAmount || { usd: 0, uzs: 0 };

        if (oldPaidAmount.usd !== newPaidAmount.usd || oldPaidAmount.uzs !== newPaidAmount.uzs) {
          transaction.amount = newPaidAmount;
          transaction.paymentType = updatedOrder.paymentType || transaction.paymentType;
          transaction.description = `Order #${orderId} uchun to'lov (yangilandi)`;
          transaction.updatedAt = new Date();

          await transaction.save();
          console.log(`✅ Order transaction yangilandi: ${transaction._id}`);
        }
      }

      return transaction;
    } catch (error) {
      console.error("❌ Order transaction yangilashda xatolik:", error.message);
      throw error;
    }
  }

  /**
   * Service yangilanganda bog'langan transaction'ni yangilash
   */
  static async updateServiceTransaction(serviceId, updatedService, oldService) {
    try {
      // Bog'langan transaction'ni topish
      const transaction = await Transaction.findOne({
        relatedModel: "Service",
        relatedId: serviceId,
        isDeleted: false
      });

      if (!transaction) {
        console.log(`⚠️ Service ${serviceId} uchun transaction topilmadi`);
        return null;
      }

      // Service'da paidAmount yo'q bo'lsa, totalPrice ni ishlatamiz
      const oldPaidAmount = oldService.paidAmount || oldService.totalPrice || { usd: 0, uzs: 0 };
      const newPaidAmount = updatedService.paidAmount || updatedService.totalPrice || { usd: 0, uzs: 0 };

      if (oldPaidAmount.usd !== newPaidAmount.usd || oldPaidAmount.uzs !== newPaidAmount.uzs) {
        transaction.amount = newPaidAmount;
        transaction.paymentType = updatedService.paymentType || transaction.paymentType;
        transaction.description = `Service #${serviceId} uchun to'lov (yangilandi)`;
        transaction.updatedAt = new Date();

        await transaction.save();
        console.log(`✅ Service transaction yangilandi: ${transaction._id}`);
      }

      return transaction;
    } catch (error) {
      console.error("❌ Service transaction yangilashda xatolik:", error.message);
      throw error;
    }
  }

  /**
   * Order o'chirilganda yoki cancel qilinganda transaction'ni yangilash
   */
  static async handleOrderDeletionOrCancellation(orderId, action = "deleted") {
    try {
      // Bog'langan transaction'larni topish
      const transactions = await Transaction.find({
        relatedModel: "Order",
        relatedId: orderId,
        isDeleted: false
      });

      if (transactions.length === 0) {
        console.log(`⚠️ Order ${orderId} uchun transaction'lar topilmadi`);
        return [];
      }

      const updatedTransactions = [];
      for (const transaction of transactions) {
        if (action === "deleted") {
          // Transaction'ni soft delete qilish
          transaction.isDeleted = true;
          transaction.description += ` (Order o'chirildi)`;
        } else if (action === "cancelled") {
          // Transaction'ni bekor qilish (amount'ni 0 ga o'zgartirish)
          transaction.amount = { usd: 0, uzs: 0 };
          transaction.description += ` (Order bekor qilindi)`;
        }
        
        transaction.updatedAt = new Date();
        await transaction.save();
        updatedTransactions.push(transaction);
        
        console.log(`✅ Order transaction ${action}: ${transaction._id}`);
      }

      return updatedTransactions;
    } catch (error) {
      console.error(`❌ Order transaction ${action} da xatolik:`, error.message);
      throw error;
    }
  }

  /**
   * Service o'chirilganda yoki cancel qilinganda transaction'ni yangilash
   */
  static async handleServiceDeletionOrCancellation(serviceId, action = "deleted") {
    try {
      // Bog'langan transaction'larni topish
      const transactions = await Transaction.find({
        relatedModel: "Service",
        relatedId: serviceId,
        isDeleted: false
      });

      if (transactions.length === 0) {
        console.log(`⚠️ Service ${serviceId} uchun transaction'lar topilmadi`);
        return [];
      }

      const updatedTransactions = [];
      for (const transaction of transactions) {
        if (action === "deleted") {
          // Transaction'ni soft delete qilish
          transaction.isDeleted = true;
          transaction.description += ` (Service o'chirildi)`;
        } else if (action === "cancelled") {
          // Transaction'ni bekor qilish (amount'ni 0 ga o'zgartirish)
          transaction.amount = { usd: 0, uzs: 0 };
          transaction.description += ` (Service bekor qilindi)`;
        }
        
        transaction.updatedAt = new Date();
        await transaction.save();
        updatedTransactions.push(transaction);
        
        console.log(`✅ Service transaction ${action}: ${transaction._id}`);
      }

      return updatedTransactions;
    } catch (error) {
      console.error(`❌ Service transaction ${action} da xatolik:`, error.message);
      throw error;
    }
  }

  /**
   * Debtor'ga bog'langan barcha transaction'larni olish
   */
  static async getDebtorTransactions(debtorId) {
    try {
      const transactions = await Transaction.find({
        relatedModel: "Debtor",
        relatedId: debtorId,
        isDeleted: false
      }).sort({ createdAt: -1 });

      return transactions;
    } catch (error) {
      console.error("❌ Debtor transactions olishda xatolik:", error.message);
      throw error;
    }
  }

  /**
   * Mijozga bog'langan barcha transaction'larni olish
   */
  static async getClientTransactions(clientId) {
    try {
      const transactions = await Transaction.find({
        client: clientId,
        isDeleted: false
      }).sort({ createdAt: -1 });

      return transactions;
    } catch (error) {
      console.error("❌ Client transactions olishda xatolik:", error.message);
      throw error;
    }
  }

  /**
   * Transaction statistikasini olish
   */
  static async getTransactionStatistics(startDate, endDate, branch = null) {
    try {
      const matchCriteria = {
        isDeleted: false,
        createdAt: {
          $gte: startDate,
          $lte: endDate
        }
      };

      if (branch) {
        matchCriteria.branch = new mongoose.Types.ObjectId(branch);
      }

      const statistics = await Transaction.aggregate([
        { $match: matchCriteria },
        {
          $group: {
            _id: "$type",
            totalUsd: { $sum: "$amount.usd" },
            totalUzs: { $sum: "$amount.uzs" },
            count: { $sum: 1 }
          }
        }
      ]);

      return statistics;
    } catch (error) {
      console.error("❌ Transaction statistics olishda xatolik:", error.message);
      throw error;
    }
  }

  /**
   * Mijozning umumiy transaction balansini hisoblash
   */
  static async calculateClientTransactionBalance(clientId) {
    try {
      const transactions = await Transaction.find({
        client: clientId,
        isDeleted: false
      });

      let totalIncome = { usd: 0, uzs: 0 };
      let totalOutcome = { usd: 0, uzs: 0 };

      transactions.forEach(transaction => {
        if (["order", "service", "debt-payment"].includes(transaction.type)) {
          totalIncome.usd += transaction.amount.usd || 0;
          totalIncome.uzs += transaction.amount.uzs || 0;
        } else if (["cash-out", "debt-created"].includes(transaction.type)) {
          totalOutcome.usd += transaction.amount.usd || 0;
          totalOutcome.uzs += transaction.amount.uzs || 0;
        }
      });

      return {
        totalIncome,
        totalOutcome,
        balance: {
          usd: totalIncome.usd - totalOutcome.usd,
          uzs: totalIncome.uzs - totalOutcome.uzs
        }
      };
    } catch (error) {
      console.error("❌ Client transaction balance hisoblashda xatolik:", error.message);
      throw error;
    }
  }
}

module.exports = TransactionHelper;
