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

  // Telefon raqamini tekshirish
  isValidPhoneNumber(phone) {
    if (!phone || typeof phone !== "string") {
      return false;
    }

    // Telefon raqamini tozalash (probel, tire, qavs va boshqa belgilarni olib tashlash)
    const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, "");

    // O'zbekiston telefon raqamlari formatlari:
    // 998901234567 (12 raqam, 998 bilan boshlanadi)
    // 901234567 (9 raqam)
    // +998901234567 (+ bilan boshlanadi)

    // Faqat raqamlardan iborat ekanligini tekshirish
    if (!/^\d+$/.test(cleanPhone)) {
      return false;
    }

    // O'zbekiston raqamlari uchun formatlar
    if (cleanPhone.length === 12 && cleanPhone.startsWith("998")) {
      return true;
    }

    if (cleanPhone.length === 9 && /^[6-9]/.test(cleanPhone)) {
      return true;
    }

    return false;
  }

  // Telefon raqamini to'g'ri formatga keltirish
  formatPhoneNumber(phone) {
    if (!phone) return null;

    const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, "");

    // Agar 9 raqamli bo'lsa, 998 qo'shish
    if (cleanPhone.length === 9 && /^[6-9]/.test(cleanPhone)) {
      return "998" + cleanPhone;
    }

    // Agar 12 raqamli va 998 bilan boshlansa
    if (cleanPhone.length === 12 && cleanPhone.startsWith("998")) {
      return cleanPhone;
    }

    return cleanPhone;
  }

  // Yangi xizmat yaratilganda SMS yuborish
  async sendServiceCreatedSMS(serviceId) {
    try {
      console.log(
        `Yangi xizmat yaratilganda SMS yuborilmoqda. ServiceID: ${serviceId}`
      );

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
        console.error(
          `❌ ERROR: Service uchun mijoz yoki telefon raqami topilmadi. ServiceID: ${serviceId}`
        );
        return {
          success: false,
          message: "Mijoz yoki telefon raqami topilmadi",
        };
      }

      // VIP mijozga SMS yuborilmasin
      if (service.client.isVIP) {
        console.log(
          `ℹ️ INFO: VIP mijoz ${
            service.client.fullName || service.client.name
          } ga SMS yuborilmaydi. ServiceID: ${serviceId}`
        );
        return { success: false, message: "VIP mijozga SMS yuborilmaydi" };
      }

      // Telefon raqamini validatsiya qilish
      if (!this.isValidPhoneNumber(service.client.phone)) {
        console.error(
          `❌ ERROR: Noto'g'ri telefon raqami formati. Phone: ${service.client.phone}, ServiceID: ${serviceId}`
        );
        return { success: false, message: "Noto'g'ri telefon raqami formati" };
      }

      // Telefon raqamini to'g'ri formatga keltirish
      const formattedPhone = this.formatPhoneNumber(service.client.phone);
      if (!formattedPhone) {
        console.error(
          `❌ ERROR: Telefon raqamini formatlashda xatolik. Phone: ${service.client.phone}, ServiceID: ${serviceId}`
        );
        return {
          success: false,
          message: "Telefon raqamini formatlashda xatolik",
        };
      }

      // Avtomobil ma'lumotlarini olish
      let carModel = "Noma'lum";
      if (service.car.model) {
        const carModelDoc = await Car.findById(service.car.model);
        if (carModelDoc) {
          carModel = carModelDoc.name;
        }
      }

      // Xizmat yaratilgan vaqt (O'zbekiston vaqti UTC+5)
      const uzbekTime = new Date(service.createdAt.getTime() + (5 * 60 * 60 * 1000));
      
      const serviceDate = uzbekTime.toLocaleDateString("uz-UZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      const serviceTime = uzbekTime.toLocaleTimeString("uz-UZ", {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Keyingi xizmat ko'rsatish vaqti (3 oy keyingi sana)
      const nextServiceDate = new Date(service.createdAt);
      nextServiceDate.setMonth(nextServiceDate.getMonth() + 3);

      const nextServiceDateFormatted = nextServiceDate.toLocaleDateString(
        "uz-UZ",
        {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }
      );

      // Mijoz va xizmat ma'lumotlari
      const clientName = service.client.fullName || service.client.name;
      const carNumber = service.car.plateNumber || "Noma'lum";
      const serviceAmount = service.totalPrice.uzs.toLocaleString();

      // SMS matni
      const message = `Hurmatli ${clientName}! Sizning ${carNumber} raqamli avtomobilingizga ${serviceDate} kuni soat ${serviceTime} da moy almashtirish xizmati ko'rsatildi. To'lov summasi: ${serviceAmount} so'm. Keyingi moy almashtirish sanasi: ${nextServiceDateFormatted}. Xizmat ko'rsatuvchi: UMA OIL 907411232`;

      try {
        // SMS yuborish
        console.log(`Yangi xizmat haqida SMS yuborilmoqda: ${formattedPhone}`);
        const result = await sendSMS(formattedPhone, message);

        // Ma'lumotlarni bazaga saqlash
        const smsRecord = new SMS({
          clientId: service.client._id,
          serviceId: service._id,
          phone: result.phone || formattedPhone,
          message: result.message || message,
          messageId: result.message_id,
          status: result.status,
          cost: result.cost || 0,
          parts: result.parts || 1,
          type: "service_created",
          sentAt: new Date(),
          response: result,
        });

        await smsRecord.save();
        console.log(
          `✅ SUCCESS: Yangi xizmat haqida SMS ${clientName} ga muvaffaqiyatli yuborildi`,
          {
            messageId: result.message_id,
            status: result.status,
            cost: result.cost,
            parts: result.parts,
          }
        );

        return {
          success: true,
          message: "SMS muvaffaqiyatli yuborildi",
          data: result,
        };
      } catch (smsError) {
        // Xato bo'lgan SMS ma'lumotlarini saqlash
        const errorSmsRecord = new SMS({
          clientId: service.client._id,
          serviceId: service._id,
          phone: formattedPhone,
          message: message,
          status: "failed",
          type: "service_created",
          failureReason: smsError.message,
          response: { error: smsError.message },
          createdAt: new Date(),
        });

        await errorSmsRecord.save();
        console.error(
          `❌ FAILED: Mijoz ${clientName} (${formattedPhone}) ga yangi xizmat haqida SMS yuborishda xatolik:`,
          {
            error: smsError.message,
            clientName: clientName,
            phone: formattedPhone,
            serviceId: serviceId,
          }
        );

        return { success: false, message: smsError.message };
      }
    } catch (error) {
      console.error(
        "❌ GLOBAL ERROR: Yangi xizmat haqida SMS yuborishda umumiy xatolik:",
        {
          error: error.message,
          serviceId: serviceId,
          stack: error.stack,
        }
      );
      return { success: false, message: error.message };
    }
  }

  // Xizmat ko'rsatilgandan so'ng SMS yuborish
  async sendServiceCompletionSMS(serviceId) {
    try {
      console.log(
        `Xizmat ko'rsatilgandan so'ng SMS yuborilmoqda. ServiceID: ${serviceId}`
      );

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
        console.error(
          `❌ ERROR: Service uchun mijoz yoki telefon raqami topilmadi. ServiceID: ${serviceId}`
        );
        return {
          success: false,
          message: "Mijoz yoki telefon raqami topilmadi",
        };
      }

      // VIP mijozga SMS yuborilmasin
      if (service.client.isVIP) {
        console.log(
          `ℹ️ INFO: VIP mijoz ${
            service.client.fullName || service.client.name
          } ga SMS yuborilmaydi. ServiceID: ${serviceId}`
        );
        return { success: false, message: "VIP mijozga SMS yuborilmaydi" };
      }

      // Telefon raqamini validatsiya qilish
      if (!this.isValidPhoneNumber(service.client.phone)) {
        console.error(
          `❌ ERROR: Noto'g'ri telefon raqami formati. Phone: ${service.client.phone}, ServiceID: ${serviceId}`
        );
        return { success: false, message: "Noto'g'ri telefon raqami formati" };
      }

      // Telefon raqamini to'g'ri formatga keltirish
      const formattedPhone = this.formatPhoneNumber(service.client.phone);
      if (!formattedPhone) {
        console.error(
          `❌ ERROR: Telefon raqamini formatlashda xatolik. Phone: ${service.client.phone}, ServiceID: ${serviceId}`
        );
        return {
          success: false,
          message: "Telefon raqamini formatlashda xatolik",
        };
      }

      // Avtomobil ma'lumotlarini olish
      let carModel = "Noma'lum";
      if (service.car.model) {
        const carModelDoc = await Car.findById(service.car.model);
        if (carModelDoc) {
          carModel = carModelDoc.name;
        }
      }

      // Xizmat ko'rsatilgan vaqt (O'zbekiston vaqti UTC+5)
      const uzbekTime = new Date(service.createdAt.getTime() + (5 * 60 * 60 * 1000));
      
      const serviceDate = uzbekTime.toLocaleDateString("uz-UZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      const serviceTime = uzbekTime.toLocaleTimeString("uz-UZ", {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Keyingi xizmat ko'rsatish vaqti (3 oy keyingi sana)
      const nextServiceDate = new Date(service.createdAt);
      nextServiceDate.setMonth(nextServiceDate.getMonth() + 3);

      const nextServiceDateFormatted = nextServiceDate.toLocaleDateString(
        "uz-UZ",
        {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }
      );

      // Mijoz va xizmat ma'lumotlari
      const clientName = service.client.fullName || service.client.name;
      const carNumber = service.car.plateNumber || "Noma'lum";
      const serviceAmount = service.totalPrice.uzs.toLocaleString();

      // SMS matni
      const message = `Hurmatli ${clientName}! Sizning ${carNumber} raqamli avtomobilingizga ${serviceDate} kuni soat ${serviceTime} da moy almashtirish xizmati ko'rsatildi. To'lov summasi: ${serviceAmount} so'm. Keyingi moy almashtirish sanasi: ${nextServiceDateFormatted}. Xizmat ko'rsatuvchi: UMA OIL 907411232`;

      try {
        // SMS yuborish
        console.log(`Xizmat SMS yuborilmoqda: ${formattedPhone}`);
        const result = await sendSMS(formattedPhone, message);

        // Ma'lumotlarni bazaga saqlash
        const smsRecord = new SMS({
          clientId: service.client._id,
          serviceId: service._id,
          phone: result.phone || formattedPhone,
          message: result.message || message,
          messageId: result.message_id,
          status: result.status,
          cost: result.cost || 0,
          parts: result.parts || 1,
          type: "service_completion",
          sentAt: new Date(),
          response: result,
        });

        await smsRecord.save();
        console.log(
          `✅ SUCCESS: Xizmat yakunlanganligi haqida SMS ${clientName} ga muvaffaqiyatli yuborildi`,
          {
            messageId: result.message_id,
            status: result.status,
            cost: result.cost,
            parts: result.parts,
          }
        );

        return {
          success: true,
          message: "SMS muvaffaqiyatli yuborildi",
          data: result,
        };
      } catch (smsError) {
        // Xato bo'lgan SMS ma'lumotlarini saqlash
        const errorSmsRecord = new SMS({
          clientId: service.client._id,
          serviceId: service._id,
          phone: formattedPhone,
          message: message,
          status: "failed",
          type: "service_completion",
          failureReason: smsError.message,
          response: { error: smsError.message },
          createdAt: new Date(),
        });

        await errorSmsRecord.save();
        console.error(
          `❌ FAILED: Mijoz ${clientName} (${formattedPhone}) ga xizmat SMS yuborishda xatolik:`,
          {
            error: smsError.message,
            clientName: clientName,
            phone: formattedPhone,
            serviceId: serviceId,
          }
        );

        return { success: false, message: smsError.message };
      }
    } catch (error) {
      console.error("❌ GLOBAL ERROR: Xizmat SMS yuborishda umumiy xatolik:", {
        error: error.message,
        serviceId: serviceId,
        stack: error.stack,
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
      bugun: `Hurmatli ${clientName}!
Bugun sizning ${amount} ${currency} qarzingizni qaytarish muddati tugaydi.
Zudlik bilan to'lov qiling. Ma'lumot: +998996572600`,
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
      year: "numeric",
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
          $lt: new Date(threeDaysLater.getTime() + 24 * 60 * 60 * 1000),
        },
      }).populate("client");

      console.log(
        `3 kun oldin eslatma uchun ${debtors.length} qarzdor topildi`
      );

      for (const debtor of debtors) {
        try {
          // Avval ushbu mijoz uchun 3 kun oldin SMS yuborilganligini tekshirish
          const existingSMS = await SMS.findOne({
            clientId: debtor.client._id,
            type: "debt_reminder_3_days",
            createdAt: {
              $gte: new Date(new Date().setHours(0, 0, 0, 0)),
              $lt: new Date(new Date().setHours(23, 59, 59, 999)),
            },
          });

          if (existingSMS) {
            console.log(
              `Mijoz ${debtor.client.name} uchun bugun allaqachon 3 kun oldin SMS yuborilgan`
            );
            continue;
          }

          // Mijoz telefon raqamini tekshirish
          if (!debtor.client.phone) {
            console.log(
              `Mijoz ${debtor.client.name} uchun telefon raqami topilmadi. SMS yuborilmaydi.`
            );
            continue;
          }

          // Telefon raqamini validatsiya qilish
          if (!this.isValidPhoneNumber(debtor.client.phone)) {
            console.log(
              `Mijoz ${debtor.client.name} uchun noto'g'ri telefon raqami: ${debtor.client.phone}. SMS yuborilmaydi.`
            );
            continue;
          }

          // Telefon raqamini to'g'ri formatga keltirish
          const formattedPhone = this.formatPhoneNumber(debtor.client.phone);
          if (!formattedPhone) {
            console.log(
              `Mijoz ${debtor.client.name} telefon raqamini formatlashda xatolik: ${debtor.client.phone}. SMS yuborilmaydi.`
            );
            continue;
          }

          // VIP mijozga SMS yuborilmasin
          if (debtor.client.isVIP) {
            console.log(
              `ℹ️ INFO: VIP mijoz ${debtor.client.name} ga qarz eslatma SMS yuborilmaydi.`
            );
            continue;
          }

          // Qarz miqdorini hisoblash
          const totalDebt = debtor.currentDebt.usd + debtor.currentDebt.uzs;
          let amount, currency;

          if (debtor.currentDebt.usd > 0 && debtor.currentDebt.uzs > 0) {
            amount = `${
              debtor.currentDebt.usd
            } USD + ${debtor.currentDebt.uzs.toLocaleString()} UZS`;
            currency = "";
          } else if (debtor.currentDebt.usd > 0) {
            amount = debtor.currentDebt.usd;
            currency = "USD";
          } else {
            amount = debtor.currentDebt.uzs.toLocaleString();
            currency = "UZS";
          }

          const dueDate = this.formatDate(debtor.nextPayment.dueDate);
          const message = this.getSMSTemplate(
            "3_kun_oldin",
            debtor.client.name,
            amount,
            currency,
            dueDate
          );

          // SMS yuborish
          const result = await sendSMS(formattedPhone, message);

          // SMS bazaga saqlash
          const smsRecord = new SMS({
            clientId: debtor.client._id,
            phone: formattedPhone,
            message: message,
            messageId: result.message_id,
            status: result.status,
            cost: result.cost || 0,
            parts: result.parts || 1,
            type: "debt_reminder_3_days",
            sentAt: new Date(),
          });

          await smsRecord.save();
          console.log(
            `3 kun oldin eslatma SMS ${debtor.client.name} ga yuborildi`
          );
        } catch (error) {
          console.error(
            `Mijoz ${debtor.client.name} ga SMS yuborishda xatolik:`,
            error.message
          );
        }
      }
    } catch (error) {
      console.error(
        "3 kun oldin eslatma SMS'larini yuborishda xatolik:",
        error.message
      );
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
          $lt: tomorrow,
        },
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
              $lt: tomorrow,
            },
          });

          if (existingSMS) {
            console.log(
              `Mijoz ${debtor.client.name} uchun bugun allaqachon eslatma SMS yuborilgan`
            );
            continue;
          }

          // Mijoz telefon raqamini tekshirish
          if (!debtor.client.phone) {
            console.log(
              `Mijoz ${debtor.client.name} uchun telefon raqami topilmadi. SMS yuborilmaydi.`
            );
            continue;
          }

          // Telefon raqamini validatsiya qilish
          if (!this.isValidPhoneNumber(debtor.client.phone)) {
            console.log(
              `Mijoz ${debtor.client.name} uchun noto'g'ri telefon raqami: ${debtor.client.phone}. SMS yuborilmaydi.`
            );
            continue;
          }

          // Telefon raqamini to'g'ri formatga keltirish
          const formattedPhone = this.formatPhoneNumber(debtor.client.phone);
          if (!formattedPhone) {
            console.log(
              `Mijoz ${debtor.client.name} telefon raqamini formatlashda xatolik: ${debtor.client.phone}. SMS yuborilmaydi.`
            );
            continue;
          }

          // VIP mijozga SMS yuborilmasin
          if (debtor.client.isVIP) {
            console.log(
              `ℹ️ INFO: VIP mijoz ${debtor.client.name} ga qarz eslatma SMS yuborilmaydi.`
            );
            continue;
          }

          // Qarz miqdorini hisoblash
          let amount, currency;

          if (debtor.currentDebt.usd > 0 && debtor.currentDebt.uzs > 0) {
            amount = `${
              debtor.currentDebt.usd
            } USD + ${debtor.currentDebt.uzs.toLocaleString()} UZS`;
            currency = "";
          } else if (debtor.currentDebt.usd > 0) {
            amount = debtor.currentDebt.usd;
            currency = "USD";
          } else {
            amount = debtor.currentDebt.uzs.toLocaleString();
            currency = "UZS";
          }

          const message = this.getSMSTemplate(
            "bugun",
            debtor.client.name,
            amount,
            currency,
            "bugun"
          );

          // SMS yuborish
          const result = await sendSMS(formattedPhone, message);

          // SMS bazaga saqlash
          const smsRecord = new SMS({
            clientId: debtor.client._id,
            phone: formattedPhone,
            message: message,
            messageId: result.message_id,
            status: result.status,
            cost: result.cost || 0,
            parts: result.parts || 1,
            type: "debt_reminder_due_date",
            sentAt: new Date(),
          });

          await smsRecord.save();
          console.log(
            `Eslatma SMS ${debtor.client.name} ga yuborildi (to'lov kuni)`
          );

          // Qarzdor statusini overdue ga o'zgartirish
          debtor.status = "overdue";
          await debtor.save();
        } catch (error) {
          console.error(
            `Mijoz ${debtor.client.name} ga SMS yuborishda xatolik:`,
            error.message
          );
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
    const task1 = cron.schedule(
      "0 9 * * *",
      async () => {
        await this.sendReminder3DaysBefore();
      },
      {
        scheduled: false,
        timezone: "Asia/Tashkent",
      }
    );

    // Har kuni soat 10:00 da qarz qaytarish kuni SMS'larini yuborish
    const task2 = cron.schedule(
      "0 10 * * *",
      async () => {
        await this.sendReminderOnDueDate();
      },
      {
        scheduled: false,
        timezone: "Asia/Tashkent",
      }
    );

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
        reminder_due_date: "Har kuni soat 10:00",
      },
    };
  }

  // Manual test uchun
  async testReminders() {
    console.log("SMS eslatmalar test qilinmoqda...");
    await Promise.all([
      this.sendReminder3DaysBefore(),
      this.sendReminderOnDueDate(),
    ]);
    console.log("Test yakunlandi");
  }

  // Order yaratilganda faqat qarzlarni yangilash (SMS yuborilmaydi)
  async updateClientDebtOnly(orderId) {
    try {
      console.log(`Order yaratilganda qarzlar yangilanmoqda. OrderID: ${orderId}`);

      const Order = require("../models/orders/order.model");
      const Client = require("../models/clients/client.model");
      const Debtor = require("../models/debtors/debtor.model");

      // Order ma'lumotlarini olish
      const order = await Order.findById(orderId).populate("client");
        
      if (!order) {
        console.error(`❌ ERROR: Order topilmadi. OrderID: ${orderId}`);
        return { success: false, message: "Order topilmadi" };
      }

      if (!order.client) {
        console.error(`❌ ERROR: Order uchun mijoz topilmadi. OrderID: ${orderId}`);
        return { success: false, message: "Mijoz topilmadi" };
      }

      // Eski qarzni topish
      let previousDebtUsd = 0;
      let previousDebtUzs = 0;
      
      const debtor = await Debtor.findOne({
        client: order.client._id,
        status: { $ne: "paid" },
      });

      if (debtor) {
        previousDebtUsd = debtor.currentDebt?.usd || 0;
        previousDebtUzs = debtor.currentDebt?.uzs || 0;
      }

      // Hozirgi order summasi
      const currentOrderUsd = order.totalAmount?.usd || 0;
      const currentOrderUzs = order.totalAmount?.uzs || 0;

      // Jami summa (eski qarz + hozirgi order)
      const totalUsd = previousDebtUsd + currentOrderUsd;
      const totalUzs = previousDebtUzs + currentOrderUzs;

      // To'langan summa
      const paidUsd = order.paidAmount?.usd || 0;
      const paidUzs = order.paidAmount?.uzs || 0;

      // Qolgan summa (yangi qarz)
      const remainingUsd = totalUsd - paidUsd;
      const remainingUzs = totalUzs - paidUzs;

      // Mijozning qarzini yangilash
      await Client.findByIdAndUpdate(order.client._id, {
        $set: {
          "debt.usd": Math.max(0, remainingUsd),
          "debt.uzs": Math.max(0, remainingUzs),
        }
      });

      // Debtor modelini yangilash yoki yaratish
      if (remainingUsd > 0 || remainingUzs > 0) {
        if (debtor) {
          // Mavjud debtor ni yangilash
          await Debtor.findByIdAndUpdate(debtor._id, {
            $set: {
              "currentDebt.usd": Math.max(0, remainingUsd),
              "currentDebt.uzs": Math.max(0, remainingUzs),
            },
            $inc: {
              "totalPaid.usd": paidUsd,
              "totalPaid.uzs": paidUzs,
            }
          });
        } else {
          // Yangi debtor yaratish
          await Debtor.create({
            client: order.client._id,
            currentDebt: {
              usd: Math.max(0, remainingUsd),
              uzs: Math.max(0, remainingUzs),
            },
            initialDebt: {
              usd: currentOrderUsd,
              uzs: currentOrderUzs,
            },
            totalPaid: {
              usd: paidUsd,
              uzs: paidUzs,
            },
            description: `Order #${order._id} uchun qarz`,
            status: "pending"
          });
        }
      } else if (debtor) {
        // Agar qarz to'liq to'langan bo'lsa, debtor statusini paid ga o'zgartirish
        await Debtor.findByIdAndUpdate(debtor._id, {
          $set: {
            "currentDebt.usd": 0,
            "currentDebt.uzs": 0,
            status: "paid"
          },
          $inc: {
            "totalPaid.usd": paidUsd,
            "totalPaid.uzs": paidUzs,
          }
        });
      }

      console.log(`✅ SUCCESS: Order ${orderId} uchun qarzlar yangilandi: ${remainingUsd} USD, ${remainingUzs} UZS`);
      return { 
        success: true, 
        message: "Qarzlar muvaffaqiyatli yangilandi",
        data: {
          previousDebt: { usd: previousDebtUsd, uzs: previousDebtUzs },
          currentOrder: { usd: currentOrderUsd, uzs: currentOrderUzs },
          paid: { usd: paidUsd, uzs: paidUzs },
          remainingDebt: { usd: remainingUsd, uzs: remainingUzs }
        }
      };
      
    } catch (error) {
      console.error("❌ GLOBAL ERROR: Order qarzlarini yangilashda umumiy xatolik:", {
        error: error.message,
        orderId: orderId,
        stack: error.stack
      });
      return { success: false, message: error.message };
    }
  }

  // Order yaratilganda SMS yuborish
  async sendOrderCreatedSMS(orderId) {
    try {
      console.log(`Order yaratilganda SMS yuborilmoqda. OrderID: ${orderId}`);

      const Order = require("../models/orders/order.model");

      // Order ma'lumotlarini olish
      const order = await Order.findById(orderId)
        .populate("client")
        .populate("branch");

      if (!order) {
        console.error(`❌ ERROR: Order topilmadi. OrderID: ${orderId}`);
        return { success: false, message: "Order topilmadi" };
      }

      // Mijoz ma'lumotlarini tekshirish
      if (!order.client || !order.client.phone) {
        console.error(
          `❌ ERROR: Order uchun mijoz yoki telefon raqami topilmadi. OrderID: ${orderId}`
        );
        return {
          success: false,
          message: "Mijoz yoki telefon raqami topilmadi",
        };
      }

      // VIP mijozga SMS yuborilmasin
      if (order.client.isVIP) {
        console.log(
          `ℹ️ INFO: VIP mijoz ${
            order.client.fullName || order.client.name
          } ga SMS yuborilmaydi. OrderID: ${orderId}`
        );
        return { success: false, message: "VIP mijozga SMS yuborilmaydi" };
      }

      // Telefon raqamini validatsiya qilish
      if (!this.isValidPhoneNumber(order.client.phone)) {
        console.error(
          `❌ ERROR: Noto'g'ri telefon raqami formati. Phone: ${order.client.phone}, OrderID: ${orderId}`
        );
        return { success: false, message: "Noto'g'ri telefon raqami formati" };
      }

      // Telefon raqamini to'g'ri formatga keltirish
      const formattedPhone = this.formatPhoneNumber(order.client.phone);
      if (!formattedPhone) {
        console.error(
          `❌ ERROR: Telefon raqamini formatlashda xatolik. Phone: ${order.client.phone}, OrderID: ${orderId}`
        );
        return {
          success: false,
          message: "Telefon raqamini formatlashda xatolik",
        };
      }

      // Mijozning qarzi haqida ma'lumotlarni olish va yangilash
      let previousDebtUsd = 0;
      let previousDebtUzs = 0;

      // Eski qarzni topish (Debtor modelidan)
      const debtor = await Debtor.findOne({
        client: order.client._id,
        status: { $ne: "paid" },
      });

      if (debtor) {
        previousDebtUsd = debtor.currentDebt?.usd || 0;
        previousDebtUzs = debtor.currentDebt?.uzs || 0;
      }

      // Hozirgi order summasi
      const currentOrderUsd = order.totalAmount?.usd || 0;
      const currentOrderUzs = order.totalAmount?.uzs || 0;

      // Jami summa (eski qarz + hozirgi order)
      const totalUsd = previousDebtUsd + currentOrderUsd;
      const totalUzs = previousDebtUzs + currentOrderUzs;

      // To'langan summa
      const paidUsd = order.paidAmount?.usd || 0;
      const paidUzs = order.paidAmount?.uzs || 0;

      // Qolgan summa (yangi qarz)
      const remainingUsd = totalUsd - paidUsd;
      const remainingUzs = totalUzs - paidUzs;

      // Mijozning qarzini yangilash
      const Client = require("../models/clients/client.model");
      await Client.findByIdAndUpdate(order.client._id, {
        $set: {
          "debt.usd": Math.max(0, remainingUsd),
          "debt.uzs": Math.max(0, remainingUzs),
        }
      });

      // Debtor modelini yangilash yoki yaratish
      if (remainingUsd > 0 || remainingUzs > 0) {
        if (debtor) {
          // Mavjud debtor ni yangilash
          await Debtor.findByIdAndUpdate(debtor._id, {
            $set: {
              "currentDebt.usd": Math.max(0, remainingUsd),
              "currentDebt.uzs": Math.max(0, remainingUzs),
            },
            $inc: {
              "totalPaid.usd": paidUsd,
              "totalPaid.uzs": paidUzs,
            }
          });
        } else {
          // Yangi debtor yaratish
          await Debtor.create({
            client: order.client._id,
            currentDebt: {
              usd: Math.max(0, remainingUsd),
              uzs: Math.max(0, remainingUzs),
            },
            initialDebt: {
              usd: currentOrderUsd,
              uzs: currentOrderUzs,
            },
            totalPaid: {
              usd: paidUsd,
              uzs: paidUzs,
            },
            description: `Order #${order._id} uchun qarz`,
            status: "pending"
          });
        }
      } else if (debtor) {
        // Agar qarz to'liq to'langan bo'lsa, debtor statusini paid ga o'zgartirish
        await Debtor.findByIdAndUpdate(debtor._id, {
          $set: {
            "currentDebt.usd": 0,
            "currentDebt.uzs": 0,
            status: "paid"
          },
          $inc: {
            "totalPaid.usd": paidUsd,
            "totalPaid.uzs": paidUzs,
          }
        });
      }

      // SMS matni shabloni
      const clientName = order.client.fullName || order.client.name || "Mijoz";

      const message = `Xurmatli ${clientName}!
Astatka: ${previousDebtUzs.toLocaleString()} UZS, ${previousDebtUsd} USD
Hozirgi: ${currentOrderUzs.toLocaleString()} UZS, ${currentOrderUsd} USD
Jami: ${totalUzs.toLocaleString()} UZS, ${totalUsd} USD
Berdi hozir: ${paidUzs.toLocaleString()} UZS, ${paidUsd} USD
Qoldi: ${remainingUzs.toLocaleString()} UZS, ${remainingUsd} USD`;

      try {
        // SMS yuborish
        console.log(`Order haqida SMS yuborilmoqda: ${formattedPhone}`);
        const result = await sendSMS(formattedPhone, message);

        // Ma'lumotlarni bazaga saqlash
        const smsRecord = new SMS({
          clientId: order.client._id,
          orderId: order._id,
          phone: result.phone || formattedPhone,
          message: result.message || message,
          messageId: result.message_id,
          status: result.status,
          cost: result.cost || 0,
          parts: result.parts || 1,
          type: "order_created",
          sentAt: new Date(),
          response: result,
        });

        await smsRecord.save();
        console.log(
          `✅ SUCCESS: Order haqida SMS ${clientName} ga muvaffaqiyatli yuborildi`,
          {
            messageId: result.message_id,
            status: result.status,
            cost: result.cost,
            parts: result.parts,
          }
        );

        return {
          success: true,
          message: "SMS muvaffaqiyatli yuborildi",
          data: result,
        };
      } catch (smsError) {
        // Xato bo'lgan SMS ma'lumotlarini saqlash
        const errorSmsRecord = new SMS({
          clientId: order.client._id,
          orderId: order._id,
          phone: formattedPhone,
          message: message,
          status: "failed",
          type: "order_created",
          failureReason: smsError.message,
          response: { error: smsError.message },
          createdAt: new Date(),
        });

        await errorSmsRecord.save();
        console.error(
          `❌ FAILED: Mijoz ${clientName} (${formattedPhone}) ga order haqida SMS yuborishda xatolik:`,
          {
            error: smsError.message,
            clientName: clientName,
            phone: formattedPhone,
            orderId: orderId,
          }
        );

        return { success: false, message: smsError.message };
      }
    } catch (error) {
      console.error(
        "❌ GLOBAL ERROR: Order haqida SMS yuborishda umumiy xatolik:",
        {
          error: error.message,
          orderId: orderId,
          stack: error.stack,
        }
      );
      return { success: false, message: error.message };
    }
  }
}

module.exports = new SMSNotificationService();
