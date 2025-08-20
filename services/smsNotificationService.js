const cron = require("node-cron");
const Debtor = require("../models/debtors/debtor.model");
const Client = require("../models/clients/client.model");
const SMS = require("../models/sms/sms.model");
const { sendSMS } = require("../config/eskizuz");

class SMSNotificationService {
  constructor() {
    this.isRunning = false;
    this.scheduledTasks = new Map();
  }
  
  // Yangi xizmat yaratilganda SMS yuborish
  async sendServiceCreatedSMS(serviceId) {
    try {
      console.log(`Yangi xizmat yaratilganda SMS yuborilmoqda. ServiceID: ${serviceId}`);
      
      const Service = require("../models/services/service.model");
      const Car = require("../models/car/car.model");
      
      // Service ma'lumotlarini olish
      const service = await Service.findById(serviceId)
        .populate("client")
        .populate("car.model");
        
      if (!service) {
        console.error(`❌ ERROR: Service topilmadi. ServiceID: ${serviceId}`);
        return { success: false, message: "Service topilmadi" };
      }
      
      // Mijoz ma'lumotlarini tekshirish
      if (!service.client || !service.client.phone) {
        console.error(`❌ ERROR: Service uchun mijoz yoki telefon raqami topilmadi. ServiceID: ${serviceId}`);
        return { success: false, message: "Mijoz yoki telefon raqami topilmadi" };
      }
      
      // Avtomobil ma'lumotlarini olish
      let carModel = "Noma'lum";
      if (service.car.model) {
        const carModelDoc = await Car.findById(service.car.model);
        if (carModelDoc) {
          carModel = carModelDoc.name;
        }
      }
      
      // Xizmat yaratilgan vaqt
      const serviceDate = service.createdAt.toLocaleDateString("uz-UZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
      
      const serviceTime = service.createdAt.toLocaleTimeString("uz-UZ", {
        hour: "2-digit",
        minute: "2-digit"
      });
      
      // Keyingi xizmat ko'rsatish vaqti (3 oy keyingi sana)
      const nextServiceDate = new Date(service.createdAt);
      nextServiceDate.setMonth(nextServiceDate.getMonth() + 3);
      
      const nextServiceDateFormatted = nextServiceDate.toLocaleDateString("uz-UZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
      
      // Mijoz va xizmat ma'lumotlari
      const clientName = service.client.fullName || service.client.name;
      const carNumber = service.car.plateNumber || "Noma'lum";
      const serviceAmount = service.totalPrice.uzs.toLocaleString();
      
      // SMS matni
      const message = `Hurmatli ${clientName}! Sizning ${carNumber} raqamli avtomobilingizga ${serviceDate} kuni soat ${serviceTime} da moy almashtirish xizmati ko'rsatildi. To'lov summasi: ${serviceAmount} so'm. Keyingi moy almashtirish sanasi: ${nextServiceDateFormatted}. Xizmat ko'rsatuvchi: UMA OIL 907411232`;
      
      try {
        // SMS yuborish
        console.log(`Yangi xizmat haqida SMS yuborilmoqda: ${service.client.phone}`);
        const result = await sendSMS(service.client.phone, message);
        
        // Ma'lumotlarni bazaga saqlash
        const smsRecord = new SMS({
          clientId: service.client._id,
          serviceId: service._id,
          phone: result.phone || service.client.phone,
          message: result.message || message,
          messageId: result.message_id,
          status: result.status,
          cost: result.cost || 0,
          parts: result.parts || 1,
          type: "service_created",
          sentAt: new Date(),
          response: result
        });
        
        await smsRecord.save();
        console.log(`✅ SUCCESS: Yangi xizmat haqida SMS ${clientName} ga muvaffaqiyatli yuborildi`, {
          messageId: result.message_id,
          status: result.status,
          cost: result.cost,
          parts: result.parts
        });
        
        return { success: true, message: "SMS muvaffaqiyatli yuborildi", data: result };
        
      } catch (smsError) {
        // Xato bo'lgan SMS ma'lumotlarini saqlash
        const errorSmsRecord = new SMS({
          clientId: service.client._id,
          serviceId: service._id,
          phone: service.client.phone,
          message: message,
          status: "failed",
          type: "service_created",
          failureReason: smsError.message,
          response: { error: smsError.message },
          createdAt: new Date()
        });
        
        await errorSmsRecord.save();
        console.error(`❌ FAILED: Mijoz ${clientName} (${service.client.phone}) ga yangi xizmat haqida SMS yuborishda xatolik:`, {
          error: smsError.message,
          clientName: clientName,
          phone: service.client.phone,
          serviceId: serviceId
        });
        
        return { success: false, message: smsError.message };
      }
      
    } catch (error) {
      console.error("❌ GLOBAL ERROR: Yangi xizmat haqida SMS yuborishda umumiy xatolik:", {
        error: error.message,
        serviceId: serviceId,
        stack: error.stack
      });
      return { success: false, message: error.message };
    }
  }

  // Xizmat ko'rsatilgandan so'ng SMS yuborish
  async sendServiceCompletionSMS(serviceId) {
    try {
      console.log(`Xizmat ko'rsatilgandan so'ng SMS yuborilmoqda. ServiceID: ${serviceId}`);
      
      const Service = require("../models/services/service.model");
      const Car = require("../models/car/car.model");
      
      // Service ma'lumotlarini olish
      const service = await Service.findById(serviceId)
        .populate("client")
        .populate("car.model");
        
      if (!service) {
        console.error(`❌ ERROR: Service topilmadi. ServiceID: ${serviceId}`);
        return { success: false, message: "Service topilmadi" };
      }
      
      // Mijoz ma'lumotlarini tekshirish
      if (!service.client || !service.client.phone) {
        console.error(`❌ ERROR: Service uchun mijoz yoki telefon raqami topilmadi. ServiceID: ${serviceId}`);
        return { success: false, message: "Mijoz yoki telefon raqami topilmadi" };
      }
      
      // Avtomobil ma'lumotlarini olish
      let carModel = "Noma'lum";
      if (service.car.model) {
        const carModelDoc = await Car.findById(service.car.model);
        if (carModelDoc) {
          carModel = carModelDoc.name;
        }
      }
      
      // Xizmat ko'rsatilgan vaqt
      const serviceDate = service.createdAt.toLocaleDateString("uz-UZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
      
      const serviceTime = service.createdAt.toLocaleTimeString("uz-UZ", {
        hour: "2-digit",
        minute: "2-digit"
      });
      
      // Keyingi xizmat ko'rsatish vaqti (3 oy keyingi sana)
      const nextServiceDate = new Date(service.createdAt);
      nextServiceDate.setMonth(nextServiceDate.getMonth() + 3);
      
      const nextServiceDateFormatted = nextServiceDate.toLocaleDateString("uz-UZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
      
      // Mijoz va xizmat ma'lumotlari
      const clientName = service.client.fullName || service.client.name;
      const carNumber = service.car.plateNumber || "Noma'lum";
      const serviceAmount = service.totalPrice.uzs.toLocaleString();
      
      // SMS matni
      const message = `Hurmatli ${clientName}! Sizning ${carNumber} raqamli avtomobilingizga ${serviceDate} kuni soat ${serviceTime} da moy almashtirish xizmati ko'rsatildi. To'lov summasi: ${serviceAmount} so'm. Keyingi moy almashtirish sanasi: ${nextServiceDateFormatted}. Xizmat ko'rsatuvchi: UMA OIL 907411232`;
      
      try {
        // SMS yuborish
        console.log(`Xizmat SMS yuborilmoqda: ${service.client.phone}`);
        const result = await sendSMS(service.client.phone, message);
        
        // Ma'lumotlarni bazaga saqlash
        const smsRecord = new SMS({
          clientId: service.client._id,
          serviceId: service._id,
          phone: result.phone || service.client.phone,
          message: result.message || message,
          messageId: result.message_id,
          status: result.status,
          cost: result.cost || 0,
          parts: result.parts || 1,
          type: "service_completion",
          sentAt: new Date(),
          response: result
        });
        
        await smsRecord.save();
        console.log(`✅ SUCCESS: Xizmat yakunlanganligi haqida SMS ${clientName} ga muvaffaqiyatli yuborildi`, {
          messageId: result.message_id,
          status: result.status,
          cost: result.cost,
          parts: result.parts
        });
        
        return { success: true, message: "SMS muvaffaqiyatli yuborildi", data: result };
        
      } catch (smsError) {
        // Xato bo'lgan SMS ma'lumotlarini saqlash
        const errorSmsRecord = new SMS({
          clientId: service.client._id,
          serviceId: service._id,
          phone: service.client.phone,
          message: message,
          status: "failed",
          type: "service_completion",
          failureReason: smsError.message,
          response: { error: smsError.message },
          createdAt: new Date()
        });
        
        await errorSmsRecord.save();
        console.error(`❌ FAILED: Mijoz ${clientName} (${service.client.phone}) ga xizmat SMS yuborishda xatolik:`, {
          error: smsError.message,
          clientName: clientName,
          phone: service.client.phone,
          serviceId: serviceId
        });
        
        return { success: false, message: smsError.message };
      }
      
    } catch (error) {
      console.error("❌ GLOBAL ERROR: Xizmat SMS yuborishda umumiy xatolik:", {
        error: error.message,
        serviceId: serviceId,
        stack: error.stack
      });
      return { success: false, message: error.message };
    }
  }

  // SMS shablonlari (eskiz.uz dan tasdiqdan o'tganda o'zgartiriladi)
  getSMSTemplate(type, clientName, amount, currency, dueDate) {
    const templates = {
      // 3 kun oldin yuborilgan SMS shablon
      "3_kun_oldin": `Hurmatli ${clientName}!
Sizning ${amount} ${currency} qarzingizni qaytarish muddati 3 kundan keyin (${dueDate}) tugaydi.
Vaqtida to'lov qiling. Ma'lumot: +998996572600`,

      // Qarz qaytarish kuni yuborilgan SMS shablon
      "bugun": `Hurmatli ${clientName}!
Bugun sizning ${amount} ${currency} qarzingizni qaytarish muddati tugaydi.
Zudlik bilan to'lov qiling. Ma'lumot: +998996572600`
    };

    return templates[type] || templates["bugun"];
  }

  // Hozirgi vaqtdan 3 kun keyingi sanani olish
  getDateAfterDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  // Sanani formatlash (DD.MM.YYYY)
  formatDate(date) {
    return date.toLocaleDateString("uz-UZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  // 3 kun oldin SMS yuborish
  async sendReminder3DaysBefore() {
    try {
      console.log("3 kun oldin eslatma SMS'lari yuborilmoqda...");

      const threeDaysLater = this.getDateAfterDays(3);
      
      // 3 kun keyingi to'lov muddati bo'lgan qarzdorlarni topish
      const debtors = await Debtor.find({
        status: { $ne: "paid" },
        "nextPayment.dueDate": {
          $gte: threeDaysLater,
          $lt: new Date(threeDaysLater.getTime() + 24 * 60 * 60 * 1000)
        }
      }).populate("client");

      console.log(`3 kun oldin eslatma uchun ${debtors.length} qarzdor topildi`);

      for (const debtor of debtors) {
        try {
          // Avval ushbu mijoz uchun 3 kun oldin SMS yuborilganligini tekshirish
          const existingSMS = await SMS.findOne({
            clientId: debtor.client._id,
            type: "debt_reminder_3_days",
            createdAt: {
              $gte: new Date(new Date().setHours(0, 0, 0, 0)),
              $lt: new Date(new Date().setHours(23, 59, 59, 999))
            }
          });

          if (existingSMS) {
            console.log(`Mijoz ${debtor.client.name} uchun bugun allaqachon 3 kun oldin SMS yuborilgan`);
            continue;
          }

          // Qarz miqdorini hisoblash
          const totalDebt = debtor.currentDebt.usd + debtor.currentDebt.uzs;
          let amount, currency;
          
          if (debtor.currentDebt.usd > 0 && debtor.currentDebt.uzs > 0) {
            amount = `${debtor.currentDebt.usd} USD + ${debtor.currentDebt.uzs.toLocaleString()} UZS`;
            currency = "";
          } else if (debtor.currentDebt.usd > 0) {
            amount = debtor.currentDebt.usd;
            currency = "USD";
          } else {
            amount = debtor.currentDebt.uzs.toLocaleString();
            currency = "UZS";
          }

          const dueDate = this.formatDate(debtor.nextPayment.dueDate);
          const message = this.getSMSTemplate("3_kun_oldin", debtor.client.name, amount, currency, dueDate);

          // SMS yuborish
          const result = await sendSMS(debtor.client.phone, message);

          // SMS bazaga saqlash
          const smsRecord = new SMS({
            clientId: debtor.client._id,
            phone: debtor.client.phone,
            message: message,
            messageId: result.message_id,
            status: result.status,
            cost: result.cost || 0,
            parts: result.parts || 1,
            type: "debt_reminder_3_days",
            sentAt: new Date()
          });

          await smsRecord.save();
          console.log(`3 kun oldin eslatma SMS ${debtor.client.name} ga yuborildi`);

        } catch (error) {
          console.error(`Mijoz ${debtor.client.name} ga SMS yuborishda xatolik:`, error.message);
        }
      }

    } catch (error) {
      console.error("3 kun oldin eslatma SMS'larini yuborishda xatolik:", error.message);
    }
  }

  // Qarz qaytarish kuni SMS yuborish
  async sendReminderOnDueDate() {
    try {
      console.log("Qarz qaytarish kuni SMS'lar yuborilmoqda...");

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Bugungi kunda to'lov muddati bo'lgan qarzdorlarni topish
      const debtors = await Debtor.find({
        status: { $ne: "paid" },
        "nextPayment.dueDate": {
          $gte: today,
          $lt: tomorrow
        }
      }).populate("client");

      console.log(`Bugun to'lov kuni uchun ${debtors.length} qarzdor topildi`);

      for (const debtor of debtors) {
        try {
          // Avval ushbu mijoz uchun bugun SMS yuborilganligini tekshirish
          const existingSMS = await SMS.findOne({
            clientId: debtor.client._id,
            type: "debt_reminder_due_date",
            createdAt: {
              $gte: today,
              $lt: tomorrow
            }
          });

          if (existingSMS) {
            console.log(`Mijoz ${debtor.client.name} uchun bugun allaqachon eslatma SMS yuborilgan`);
            continue;
          }

          // Qarz miqdorini hisoblash
          let amount, currency;
          
          if (debtor.currentDebt.usd > 0 && debtor.currentDebt.uzs > 0) {
            amount = `${debtor.currentDebt.usd} USD + ${debtor.currentDebt.uzs.toLocaleString()} UZS`;
            currency = "";
          } else if (debtor.currentDebt.usd > 0) {
            amount = debtor.currentDebt.usd;
            currency = "USD";
          } else {
            amount = debtor.currentDebt.uzs.toLocaleString();
            currency = "UZS";
          }

          const message = this.getSMSTemplate("bugun", debtor.client.name, amount, currency, "bugun");

          // SMS yuborish
          const result = await sendSMS(debtor.client.phone, message);

          // SMS bazaga saqlash
          const smsRecord = new SMS({
            clientId: debtor.client._id,
            phone: debtor.client.phone,
            message: message,
            messageId: result.message_id,
            status: result.status,
            cost: result.cost || 0,
            parts: result.parts || 1,
            type: "debt_reminder_due_date",
            sentAt: new Date()
          });

          await smsRecord.save();
          console.log(`Eslatma SMS ${debtor.client.name} ga yuborildi (to'lov kuni)`);

          // Qarzdor statusini overdue ga o'zgartirish
          debtor.status = "overdue";
          await debtor.save();

        } catch (error) {
          console.error(`Mijoz ${debtor.client.name} ga SMS yuborishda xatolik:`, error.message);
        }
      }

    } catch (error) {
      console.error("Eslatma SMS'larini yuborishda xatolik:", error.message);
    }
  }

  // Cron job'larni ishga tushirish
  startScheduledTasks() {
    if (this.isRunning) {
      console.log("SMS notification service allaqachon ishlamoqda");
      return;
    }

    // Har kuni soat 09:00 da 3 kun oldin eslatma SMS'larini yuborish
    const task1 = cron.schedule('0 9 * * *', async () => {
      await this.sendReminder3DaysBefore();
    }, {
      scheduled: false,
      timezone: "Asia/Tashkent"
    });

    // Har kuni soat 10:00 da qarz qaytarish kuni SMS'larini yuborish
    const task2 = cron.schedule('0 10 * * *', async () => {
      await this.sendReminderOnDueDate();
    }, {
      scheduled: false,
      timezone: "Asia/Tashkent"
    });

    // Task'larni ishga tushirish
    task1.start();
    task2.start();

    this.scheduledTasks.set("reminder_3_days", task1);
    this.scheduledTasks.set("reminder_due_date", task2);

    this.isRunning = true;
    console.log("SMS notification service ishga tushirildi");
    console.log("- 3 kun oldin eslatma: har kuni soat 09:00");
    console.log("- To'lov kuni eslatma: har kuni soat 10:00");
  }

  // Cron job'larni to'xtatish
  stopScheduledTasks() {
    if (!this.isRunning) {
      console.log("SMS notification service ishlamayapti");
      return;
    }

    this.scheduledTasks.forEach((task, name) => {
      task.destroy();
      console.log(`${name} task to'xtatildi`);
    });

    this.scheduledTasks.clear();
    this.isRunning = false;
    console.log("SMS notification service to'xtatildi");
  }

  // Joriy holatni ko'rish
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeTasks: Array.from(this.scheduledTasks.keys()),
      nextExecutions: {
        reminder_3_days: "Har kuni soat 09:00",
        reminder_due_date: "Har kuni soat 10:00"
      }
    };
  }

  // Manual test uchun
  async testReminders() {
    console.log("SMS eslatmalar test qilinmoqda...");
    await Promise.all([
      this.sendReminder3DaysBefore(),
      this.sendReminderOnDueDate()
    ]);
    console.log("Test yakunlandi");
  }
}

module.exports = new SMSNotificationService();
