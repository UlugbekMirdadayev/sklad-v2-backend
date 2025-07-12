const { Schema, model } = require("mongoose");

const HistorySchema = new Schema({
  refId: {
    type: Schema.Types.ObjectId,
    ref: "Transaction",
    required: true,
  },
  type: { type: String, enum: ["kirim"], required: true },
  description: String,
  createdAt: { type: Date, default: Date.now },
});


const History = model("HistoryTransaction",HistorySchema)
module.exports = History