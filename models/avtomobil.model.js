const mongoose = require("mongoose");

const avtomobilSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  number: {
    type: String,
    required: true,
    trim: true,
    match: [/^[0-9]{2}[A-Z]{1,3}[0-9]{2,3}$/i, "Invalid Uzbek car number format"],
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    required: true,
  },
}, { timestamps: true });

module.exports = mongoose.model("Avtomobil", avtomobilSchema);
