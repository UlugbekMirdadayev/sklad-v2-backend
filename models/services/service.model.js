const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const serviceSchema = withBaseFields({
  services: {
    type: [
      {
        service: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "ServiceList",
          required: true,
        },
        // Adding price field for each service
        price: {
          type: Number,
          required: true,
          min: 0,
        },
        // Adding quantity field for each service
        quantity: {
          type: Number,
          required: true,
          default: 1,
          min: 1,
        },
      },
    ],
    required: true,
    validate: {
      validator: function (arr) {
        return arr.length > 0;
      },
      message: "Services array cannot be empty",
    },
  },
  description: {
    type: String,
    default: "",
    trim: true,
    maxlength: [1000, "Description cannot be longer than 1000 characters"],
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  reCheckDate: {
    type: Date,
    validate: {
      validator: function (value) {
        return !value || value > new Date();
      },
      message: "ReCheck date must be in the future",
    },
  },
  status: {
    type: String,
    enum: ["new", "done", "reject"],
    default: "new",
    index: true,
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    required: true,
    index: true,
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Client",
    required: true,
    index: true,
  },
});

// Add compound index for common query patterns
serviceSchema.index({ client: 1, status: 1 });
serviceSchema.index({ branch: 1, status: 1 });

// Add pre-save middleware to update totalPrice
serviceSchema.pre("save", function (next) {
  if (this.services && this.services.length > 0) {
    this.totalPrice = this.services.reduce(
      (sum, service) => sum + service.price * service.quantity,
      0
    );
  }
  next();
});

// Add method to check if service can be modified
serviceSchema.methods.canModify = function () {
  return this.status === "new";
};

module.exports = mongoose.model("Service", serviceSchema);
