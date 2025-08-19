# SMS Qarzdor Eslatma Tizimi

Ushbu tizim qarzdorlarga avtomatik SMS eslatmalari yuborish uchun mo'ljallangan.

## Xususiyatlari

### 1. Avtomatik SMS Eslatmalari
- **3 kun oldin eslatma**: Qarz qaytarish sanasidan 3 kun oldin yuboriladi
- **To'lov kuni eslatma**: Qarz qaytarish sanasida yuboriladi
- **To'liq to'lov SMS**: Qarz to'liq to'langanda avtomatik SMS yuboriladi

### 2. SMS Shablonlari
Hozircha ishlatilayotgan shablonlar (Eskiz.uz dan tasdiqdan o'tgandan keyin o'zgartiriladi):

#### 3 Kun Oldin SMS Shablon:
```
Hurmatli {mijoz_nomi}!
Sizning {qarz_miqdori} {valyuta} qarzingizni qaytarish muddati 3 kundan keyin ({sana}) tugaydi.
Vaqtida to'lov qiling. Ma'lumot: +998996572600
```

#### To'lov Kuni SMS Shablon:
```
Hurmatli {mijoz_nomi}!
Bugun sizning {qarz_miqdori} {valyuta} qarzingizni qaytarish muddati tugaydi.
Zudlik bilan to'lov qiling. Ma'lumot: +998996572600
```

#### Qarz To'liq To'langanligi SMS:
```
Hurmatli {mijoz_nomi}! Sizning qarzingiz to'liq to'landi. Bizga ishonch bildirganingiz uchun rahmat! Ma'lumot: +998996572600
```

### 3. Cron Job Jadvallar
- **3 kun oldin eslatma**: Har kuni soat 09:00 da
- **To'lov kuni eslatma**: Har kuni soat 10:00 da

## API Endpoint'lar

### 1. SMS Eslatma Service'ini Boshqarish

#### Service'ni Ishga Tushirish
```http
POST /api/sms/debt-reminders/start
Authorization: Bearer {token}
```

#### Service'ni To'xtatish
```http
POST /api/sms/debt-reminders/stop
Authorization: Bearer {token}
```

#### Service Holatini Tekshirish
```http
GET /api/sms/debt-reminders/status
Authorization: Bearer {token}
```

#### Manual Test
```http
POST /api/sms/debt-reminders/test
Authorization: Bearer {token}
```

### 2. Javob Formatlari

#### Service Holati:
```json
{
  "message": "SMS notification service holati",
  "status": {
    "isRunning": true,
    "activeTasks": ["reminder_3_days", "reminder_due_date"],
    "nextExecutions": {
      "reminder_3_days": "Har kuni soat 09:00",
      "reminder_due_date": "Har kuni soat 10:00"
    }
  }
}
```

## Baza Ma'lumotlari

### SMS Model'iga Qo'shilgan Yangi Type'lar:
- `debt_reminder_3_days` - 3 kun oldin eslatma
- `debt_reminder_due_date` - to'lov kuni eslatma

### Debtor Model'iga Qo'shilgan:
```javascript
remindersSent: {
  threeDaysBefore: {
    sent: Boolean,
    sentAt: Date
  },
  dueDate: {
    sent: Boolean, 
    sentAt: Date
  }
}
```

## Xavfsizlik

### Takroriy SMS'larni Oldini Olish
- Har bir mijoz uchun kuniga faqat bitta eslatma SMS yuboriladi
- Bazada tekshiruv amalga oshiriladi

### Xato Qaytish
- SMS yuborishda xato bo'lsa, log yoziladi va keyingi mijozga o'tiladi
- Service xatolar tufayli to'xtamaydi

## Sozlashlar

### Time Zone
Barcha cron job'lar "Asia/Tashkent" vaqt zonasida ishleydi.

### Server Ishga Tushganda
SMS notification service avtomatik ishga tushadi va server loglarida quyidagi xabar ko'rsatiladi:
```
SMS notification service avtomatik ishga tushirildi
- 3 kun oldin eslatma: har kuni soat 09:00
- To'lov kuni eslatma: har kuni soat 10:00
```

## Eskiz.uz Shablon Integratsiyasi

Hozirgi vaqtda quyidagi shablon nomlar ishlatilmoqda:
- `3_kun_oldin` - 3 kun oldin yuborilgan SMS uchun
- `bugun` - to'lov kuni yuborilgan SMS uchun

Eskiz.uz dan tasdiqdan o'tgan shablonlar olgach, `smsNotificationService.js` faylidagi `getSMSTemplate()` metodini yangilash kerak.

## Monitoring

### Loglar
Barcha SMS eslatma faoliyatlari console'ga log qilinadi:
- SMS yuborish boshlanishi
- Har bir mijoz uchun SMS holati
- Xatolar va muvaffaqiyatli yuborimlar

### SMS Tarixi
Barcha yuborilgan SMS'lar `sms` to'plamida saqlanadi va API orqali ko'rish mumkin.

## Texnik Talablar

- Node.js
- MongoDB
- node-cron paketi
- Eskiz.uz API kaliti

## Ishga Tushirish

1. Server ishga tushganda service avtomatik faollashadi
2. Manual boshqarish uchun API endpoint'lardan foydalaning
3. Test rejimida ishlatish uchun `/test` endpoint'idan foydalaning
