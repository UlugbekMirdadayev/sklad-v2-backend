const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const carSchema = new mongoose.Schema({
  model: { type: String, required: true }, // Mashina rusumi
  plateNumber: { type: String, required: true }, // Mashina raqami
});

const clientSchema = withBaseFields({
  fullName: {
    type: String,
    required: true,
  },
  birthday: {
    type: Date,
  },
  phone: {
    type: String,
    required: true,
  },
  telegram: {
    type: String,
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
});

module.exports = mongoose.model("Client", clientSchema);
