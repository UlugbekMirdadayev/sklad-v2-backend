const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const carSchema = new mongoose.Schema({
  model: { type: mongoose.Schema.Types.ObjectId,ref:"Car", required: true }, // Mashina rusumi
  plateNumber: { type: String, required: true },
  dailyKm: { type: Number, default: 0 }, // Kunlik km
  monthlyKm: { type: Number, default: 0 }, // Oylik km  
});

const clientSchema = withBaseFields({
  fullName: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  cars: {
    type: [carSchema],
    default: [],
  },
  isVip: {
    type: Boolean,
    default: false,
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
  },
  debt: {
    type: Number,
    default: 0,
  },
  partialPayments: {
    type: [
      {
        amount: Number,
        date: Date,
      },
    ],
    default: [],
  },
  notes: {
    type: String,
    default: "",
  },
  birthday: {
    type: Date,
    default: null,
  },
  password: {
    type: String,
    default: "123456",
  },
});

module.exports = mongoose.model("Client", clientSchema);
