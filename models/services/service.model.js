const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const serviceSchema = withBaseFields({
  name: {
    type: String,
    required: true,
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
  reCheckDate: {
    type: Date,
  },
  status: {
    type: String,
    enum: ["booked", "done", "reject"],
    default: "booked",
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
});

module.exports = mongoose.model("Service", serviceSchema);
