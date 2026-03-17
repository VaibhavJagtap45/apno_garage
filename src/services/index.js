// src/services/garage.service.js
const { Garage, GarageUser, GaragePreferences } = require("../models");
const { NotFoundError, ConflictError } = require("../middleware/errorHandler");

class GarageService {
  static async createGarage(input) {
    const existing = await Garage.findOne({ contactNo: input.contactNo });
    if (existing)
      throw new ConflictError("Garage with this contact number already exists");
    return Garage.create(input);
  }

  static async getGarageById(id) {
    const garage = await Garage.findById(id);
    if (!garage) throw new NotFoundError("Garage not found");
    return garage;
  }

  static async updateGarage(id, update) {
    const garage = await Garage.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });
    if (!garage) throw new NotFoundError("Garage not found");
    return garage;
  }

  static async getPreferences(garageId) {
    return GaragePreferences.findOne({ garageId });
  }

  static async upsertPreferences(garageId, data) {
    return GaragePreferences.findOneAndUpdate({ garageId }, data, {
      upsert: true,
      new: true,
    });
  }
}

// ─── Customer Service ────────────────────────────────────────────────────────
const { Customer } = require("../models");

class CustomerService {
  static async createCustomer(input, garageId) {
    return Customer.create({ ...input, garageId });
  }

  static async getCustomers(garageId, { page = 1, limit = 20, search } = {}) {
    const filter = { garageId };
    if (search)
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    const [data, total] = await Promise.all([
      Customer.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Customer.countDocuments(filter),
    ]);
    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  static async getCustomerById(id, garageId) {
    const c = await Customer.findOne({ _id: id, garageId });
    if (!c) throw new NotFoundError("Customer not found");
    return c;
  }

  static async updateCustomer(id, garageId, update) {
    const c = await Customer.findOneAndUpdate({ _id: id, garageId }, update, {
      new: true,
    });
    if (!c) throw new NotFoundError("Customer not found");
    return c;
  }
}

// ─── Vehicle Service ─────────────────────────────────────────────────────────
const { Vehicle } = require("../models");

class VehicleService {
  static async createVehicle(input, garageId) {
    return Vehicle.create({ ...input, garageId });
  }

  static async getVehiclesByCustomer(customerId, garageId) {
    return Vehicle.find({ customerId, garageId });
  }

  static async getVehicleById(id, garageId) {
    const v = await Vehicle.findOne({ _id: id, garageId });
    if (!v) throw new NotFoundError("Vehicle not found");
    return v;
  }
}

// ─── Part Service ─────────────────────────────────────────────────────────────
const { Part } = require("../models");

class PartService {
  static async createPart(input, garageId) {
    return Part.create({ ...input, garageId });
  }

  static async getParts(
    garageId,
    { page = 1, limit = 20, search, lowStock } = {},
  ) {
    const filter = { garageId };
    if (search)
      filter.$or = [
        { partName: { $regex: search, $options: "i" } },
        { partNumber: { $regex: search, $options: "i" } },
      ];
    if (lowStock) filter.$expr = { $lte: ["$stockQty", "$minQty"] };

    const [data, total] = await Promise.all([
      Part.find(filter)
        .sort({ partName: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Part.countDocuments(filter),
    ]);
    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  static async getPartById(id, garageId) {
    const p = await Part.findOne({ _id: id, garageId });
    if (!p) throw new NotFoundError("Part not found");
    return p;
  }

  static async updatePart(id, garageId, update) {
    const p = await Part.findOneAndUpdate({ _id: id, garageId }, update, {
      new: true,
    });
    if (!p) throw new NotFoundError("Part not found");
    return p;
  }
}

// ─── RepairOrder Service ──────────────────────────────────────────────────────
const { RepairOrder } = require("../models");
const { DashboardService } = require("./dashboard.service");

class RepairOrderService {
  static async createRepairOrder(input, garageId) {
    const ro = await RepairOrder.create({ ...input, garageId });
    await DashboardService.invalidateStats(garageId);
    return ro;
  }

  static async getRepairOrders(
    garageId,
    { page = 1, limit = 20, status } = {},
  ) {
    const filter = { garageId };
    if (status) filter.status = status;
    const [data, total] = await Promise.all([
      RepairOrder.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("customerId", "name phone")
        .populate("vehicleId", "registrationNumber brand model"),
      RepairOrder.countDocuments(filter),
    ]);
    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  static async getRepairOrderById(id, garageId) {
    const ro = await RepairOrder.findOne({ _id: id, garageId })
      .populate("customerId")
      .populate("vehicleId")
      .populate("assignedUserId", "name role")
      .populate("services.serviceId")
      .populate("parts.partId");
    if (!ro) throw new NotFoundError("Repair order not found");
    return ro;
  }

  static async updateStatus(id, garageId, status) {
    const ro = await RepairOrder.findOneAndUpdate(
      { _id: id, garageId },
      { status },
      { new: true },
    );
    if (!ro) throw new NotFoundError("Repair order not found");
    await DashboardService.invalidateStats(garageId);
    return ro;
  }
}

// ─── Vendor Service ───────────────────────────────────────────────────────────
const { Vendor } = require("../models");

class VendorService {
  static async createVendor(input, garageId) {
    return Vendor.create({ ...input, garageId });
  }

  static async getVendors(garageId, { page = 1, limit = 20 } = {}) {
    const [data, total] = await Promise.all([
      Vendor.find({ garageId })
        .sort({ vendorName: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Vendor.countDocuments({ garageId }),
    ]);
    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  static async getVendorById(id, garageId) {
    const v = await Vendor.findOne({ _id: id, garageId });
    if (!v) throw new NotFoundError("Vendor not found");
    return v;
  }
}

// ─── User Service ─────────────────────────────────────────────────────────────
class UserService {
  static async createUser(input, garageId) {
    const existing = await GarageUser.findOne({
      $or: [{ email: input.email }, { phone: input.phone }],
    });
    if (existing)
      throw new ConflictError("User with this email or phone already exists");
    return GarageUser.create({ ...input, garageId });
  }

  static async getUsers(garageId) {
    return GarageUser.find({ garageId, isActive: true }).select(
      "-tokenVersion",
    );
  }

  static async deactivateUser(id, garageId) {
    const u = await GarageUser.findOneAndUpdate(
      { _id: id, garageId },
      { isActive: false },
      { new: true },
    );
    if (!u) throw new NotFoundError("User not found");
    return u;
  }
}

module.exports = {
  GarageService,
  CustomerService,
  VehicleService,
  PartService,
  RepairOrderService,
  VendorService,
  UserService,
};
