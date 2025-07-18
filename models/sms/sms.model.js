const mongoose = require("mongoose");

const smsSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      match: /^998\d{9}$/,
    },
    message: {
      type: String,
      required: true,
      maxlength: 160,
    },
    status: {
      type: String,
      enum: ["pending", "sent", "delivered", "failed"],
      default: "pending",
    },
    eskizMessageId: {
      type: String,
      default: null,
    },
    response: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    failureReason: {
      type: String,
      default: null,
    },
    retryCount: {
      type: Number,
      default: 0,
      max: 3,
    },
    type: {
      type: String,
      enum: ["order", "notification", "verification", "marketing"],
      default: "notification",
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    cost: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: "sms",
  }
);

// Indekslar
smsSchema.index({ phone: 1 });
smsSchema.index({ status: 1 });
smsSchema.index({ type: 1 });
smsSchema.index({ createdAt: -1 });
smsSchema.index({ orderId: 1 });
smsSchema.index({ clientId: 1 });

// Virtual maydonlar
smsSchema.virtual("isDelivered").get(function () {
  return this.status === "delivered";
});

smsSchema.virtual("isFailed").get(function () {
  return this.status === "failed";
});

smsSchema.virtual("duration").get(function () {
  if (this.sentAt && this.deliveredAt) {
    return this.deliveredAt - this.sentAt;
  }
  return null;
});

// Metodlar
smsSchema.methods.markAsSent = function (eskizMessageId, response) {
  this.status = "sent";
  this.eskizMessageId = eskizMessageId;
  this.response = response;
  this.sentAt = new Date();
  return this.save();
};

smsSchema.methods.markAsDelivered = function () {
  this.status = "delivered";
  this.deliveredAt = new Date();
  return this.save();
};

smsSchema.methods.markAsFailed = function (reason) {
  this.status = "failed";
  this.failureReason = reason;
  this.retryCount += 1;
  return this.save();
};

smsSchema.methods.canRetry = function () {
  return this.retryCount < 3 && this.status === "failed";
};

// Statik metodlar
smsSchema.statics.findByPhone = function (phone) {
  return this.find({ phone });
};

smsSchema.statics.findByStatus = function (status) {
  return this.find({ status });
};

smsSchema.statics.findPendingSms = function () {
  return this.find({ status: "pending" });
};

smsSchema.statics.getStatistics = function (startDate, endDate) {
  const match = {};
  if (startDate && endDate) {
    match.createdAt = { $gte: startDate, $lte: endDate };
  }

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalCost: { $sum: "$cost" },
      },
    },
  ]);
};

smsSchema.statics.getDailyStats = function (days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
          day: { $dayOfMonth: "$createdAt" },
        },
        total: { $sum: 1 },
        sent: { $sum: { $cond: [{ $eq: ["$status", "sent"] }, 1, 0] } },
        delivered: {
          $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] },
        },
        failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
        totalCost: { $sum: "$cost" },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
  ]);
};

// Pre-save hook
smsSchema.pre("save", function (next) {
  // Telefon raqamini formatlash
  if (this.phone && !this.phone.startsWith("998")) {
    this.phone = "998" + this.phone.replace(/\D/g, "");
  }
  next();
});

// Tostring metodi
smsSchema.methods.toString = function () {
  return `SMS to ${this.phone}: ${this.message} (${this.status})`;
};

module.exports = mongoose.model("SMS", smsSchema);
