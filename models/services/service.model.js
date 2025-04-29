const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const serviceSchema = withBaseFields({
  name: {
    type: String,
    required: true,
    unique: true, // Har bir service nomi unik bo'lishi kerak
    trim: true,
  },
  description: {
    type: String,
    default: "",
    trim: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  duration: {
    type: Number,
    required: false, // Masalan: 30 (daqiqa), optional
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: false, // Agar service faqat 1 ta filialga tegishli bo'lsa
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // kim yaratgan
    required: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
});

// Har doim updatedAt ni yangilab borish uchun
serviceSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Service", serviceSchema);
