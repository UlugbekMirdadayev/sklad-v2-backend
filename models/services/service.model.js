const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const serviceSchema = withBaseFields({
  products: {
    type: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        price: {
          type: Number,
          required: true,
          min: 0,
        },
        quantity: {
          type: Number,
          required: true,
          default: 1,
          min: 1,
        },
      },
    ],
    default: [],
  },
  description: {
    type: String,
    default: "",
    trim: true,
    maxlength: [1000, "Description cannot be longer than 1000 characters"],
  },
  totalPrice: {
    usd: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    uzs: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  discount: {
    usd: {
      type: Number,
      min: 0,
      default: 0,
    },
    uzs: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  reCheckDate: {
    type: Date,
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
  car: {
    model: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Car",
      trim: true,
      maxlength: [100, "Car model cannot be longer than 100 characters"],
    },
    plateNumber: {
      type: String,
      trim: true,
      maxlength: [20, "Plate number cannot be longer than 20 characters"],
    },
  },
});

// Add compound index for common query patterns
serviceSchema.index({ client: 1, status: 1 });
serviceSchema.index({ branch: 1, status: 1 });

// Add pre-save middleware to update totalPrice
serviceSchema.pre("save", function (next) {
  let servicesTotal = 0;
  let productsTotal = 0;
  if (this.services && this.services.length > 0) {
    servicesTotal = this.services.reduce(
      (sum, service) => sum + service.price * service.quantity,
      0
    );
  }
  if (this.products && this.products.length > 0) {
    productsTotal = this.products.reduce(
      (sum, product) => sum + product.price * product.quantity,
      0
    );
  }
  this.totalPrice = servicesTotal + productsTotal;
  next();
});

// Add method to check if service can be modified
serviceSchema.methods.canModify = function () {
  return this.status === "new";
};

module.exports = mongoose.model("Service", serviceSchema);
