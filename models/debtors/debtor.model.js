const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const debtorSchema = withBaseFields({
  // Kim qarzdor
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Client",
    required: true,
  },
  // Joriy qarz miqdori (USD va UZS)
  currentDebt: {
    usd: { type: Number, required: true, default: 0 },
    uzs: { type: Number, required: true, default: 0 },
  },
  // Birinchi marta qancha qarz bo'lgani va qachon
  initialDebt: {
    usd: { type: Number, required: true, default: 0 },
    uzs: { type: Number, required: true, default: 0 },
  },
  initialDebtDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  // Umumiy to'langan qarzlar
  totalPaid: {
    usd: { type: Number, required: true, default: 0 },
    uzs: { type: Number, required: true, default: 0 },
  },
  // Oxirgi to'lov ma'lumotlari
  lastPayment: {
    amount: {
      usd: { type: Number, default: 0 },
      uzs: { type: Number, default: 0 },
    },
    date: {
      type: Date,
      default: null,
    },
  },
  // Keyingi to'lov rejasi
  nextPayment: {
    amount: {
      usd: { type: Number, default: 0 },
      uzs: { type: Number, default: 0 },
    },
    dueDate: {
      type: Date,
      default: null,
    },
  },
  description: {
    type: String,
    trim: true,
    default: "",
  },
  status: {
    type: String,
    enum: ["pending", "partial", "paid", "overdue"],
    default: "pending",
    required: true,
  },
});

// Qarzdorlik statusini avtomatik yangilash
debtorSchema.pre("save", function (next) {
  const totalCurrentDebt = this.currentDebt.usd + this.currentDebt.uzs;

  if (totalCurrentDebt <= 0) {
    this.status = "paid";
  } else if (this.totalPaid.usd > 0 || this.totalPaid.uzs > 0) {
    this.status = "partial";
  } else if (
    this.nextPayment.dueDate &&
    this.nextPayment.dueDate < new Date()
  ) {
    this.status = "overdue";
  } else {
    this.status = "pending";
  }

  next();
});

module.exports = mongoose.model("Debtor", debtorSchema);
