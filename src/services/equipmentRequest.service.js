const EquipmentRequest = require("../models/equipmentRequest.model");
const StockItem = require("../models/stockItem.model");
const StockTransaction = require("../models/stockTransaction.model");
const Task = require("../models/task.model");

/**
 * Submit a new equipment request (Staff or Manager)
 */
const createRequest = async ({
  task = null,
  stockItem,
  requestedQuantity,
  reason = "",
  requestedBy,
}) => {
  if (!stockItem) {
    const error = new Error("Stock item ID is required");
    error.statusCode = 400;
    throw error;
  }

  const qty = Number(requestedQuantity);
  if (!qty || qty < 1) {
    const error = new Error("Requested quantity must be at least 1");
    error.statusCode = 400;
    throw error;
  }

  const item = await StockItem.findById(stockItem);
  if (!item) {
    const error = new Error("Stock item not found");
    error.statusCode = 404;
    throw error;
  }

  if (task) {
    const taskRecord = await Task.findById(task);
    if (!taskRecord) {
      const error = new Error("Associated task not found");
      error.statusCode = 404;
      throw error;
    }
  }

  const request = await EquipmentRequest.create({
    task: task || null,
    stockItem,
    requestedQuantity: qty,
    reason: reason?.trim() || "",
    status: "PENDING",
    requestedBy,
  });

  return getRequestById(request._id);
};

/**
 * Get equipment requests with role scoping and filters
 */
const getRequests = async (query = {}, currentUser = null) => {
  const {
    task,
    stockItem,
    status,
    requestedBy,
    page = 1,
    limit = 50,
  } = query;

  const currentPage = Math.max(Number(page) || 1, 1);
  const perPage = Math.min(Math.max(Number(limit) || 50, 1), 500);

  const filter = {};

  // Staff can only view their own requests
  if (currentUser && currentUser.role?.toLowerCase() === "staff") {
    filter.requestedBy = currentUser.userId || currentUser.id || currentUser._id;
  } else if (requestedBy) {
    filter.requestedBy = requestedBy;
  }

  if (task) {
    filter.task = task;
  }

  if (stockItem) {
    filter.stockItem = stockItem;
  }

  if (status) {
    filter.status = status.toUpperCase();
  }

  const skip = (currentPage - 1) * perPage;

  const [requests, total] = await Promise.all([
    EquipmentRequest.find(filter)
      .populate("stockItem", "name category totalQuantity availableQuantity unit location imageUrl")
      .populate("task", "title dueDate status priority")
      .populate("requestedBy", "name username employeeId avatar department role")
      .populate("approvedBy", "name username role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage)
      .lean(),
    EquipmentRequest.countDocuments(filter),
  ]);

  return {
    requests,
    pagination: {
      page: currentPage,
      limit: perPage,
      total,
      totalPages: Math.ceil(total / perPage) || 1,
    },
  };
};

/**
 * Get request by ID
 */
const getRequestById = async (requestId) => {
  const request = await EquipmentRequest.findById(requestId)
    .populate("stockItem", "name category totalQuantity availableQuantity unit location imageUrl")
    .populate("task", "title dueDate status priority")
    .populate("requestedBy", "name username employeeId avatar department role")
    .populate("approvedBy", "name username role");

  if (!request) {
    const error = new Error("Equipment request not found");
    error.statusCode = 404;
    throw error;
  }

  return request;
};

/**
 * Approve an equipment request (Manager only)
 */
const approveRequest = async (requestId, { managerNotes = "" } = {}, managerUser) => {
  const request = await EquipmentRequest.findById(requestId);
  if (!request) {
    const error = new Error("Equipment request not found");
    error.statusCode = 404;
    throw error;
  }

  if (request.status !== "PENDING") {
    const error = new Error(`Cannot approve a request with status ${request.status}`);
    error.statusCode = 400;
    throw error;
  }

  const item = await StockItem.findById(request.stockItem);
  if (!item) {
    const error = new Error("Stock item not found");
    error.statusCode = 404;
    throw error;
  }

  if (item.availableQuantity < request.requestedQuantity) {
    const error = new Error(
      `Insufficient available stock for ${item.name}. Available: ${item.availableQuantity}, Requested: ${request.requestedQuantity}`
    );
    error.statusCode = 400;
    throw error;
  }

  request.status = "APPROVED";
  request.approvedBy = managerUser.userId || managerUser.id || managerUser._id;
  request.approvedAt = new Date();
  if (managerNotes) {
    request.managerNotes = managerNotes.trim();
  }

  await request.save();

  return getRequestById(request._id);
};

/**
 * Reject an equipment request (Manager only)
 */
const rejectRequest = async (
  requestId,
  { rejectionReason = "", managerNotes = "" } = {},
  managerUser
) => {
  const request = await EquipmentRequest.findById(requestId);
  if (!request) {
    const error = new Error("Equipment request not found");
    error.statusCode = 404;
    throw error;
  }

  if (request.status !== "PENDING" && request.status !== "APPROVED") {
    const error = new Error(`Cannot reject a request with status ${request.status}`);
    error.statusCode = 400;
    throw error;
  }

  request.status = "REJECTED";
  request.approvedBy = managerUser.userId || managerUser.id || managerUser._id;
  request.rejectionReason = rejectionReason?.trim() || "Request rejected by manager";
  if (managerNotes) {
    request.managerNotes = managerNotes.trim();
  }

  await request.save();

  return getRequestById(request._id);
};

/**
 * Issue approved equipment to staff with atomic stock protection
 */
const issueRequest = async (requestId, managerUser) => {
  // 1. Atomically transition request from APPROVED to ISSUED to prevent duplicate issuance
  const request = await EquipmentRequest.findOneAndUpdate(
    { _id: requestId, status: "APPROVED" },
    {
      $set: {
        status: "ISSUED",
        issuedAt: new Date(),
        issuedBy: managerUser.userId || managerUser.id || managerUser._id,
      },
    },
    { new: true }
  );

  if (!request) {
    // Check if it exists or already issued/invalid
    const existing = await EquipmentRequest.findById(requestId);
    if (!existing) {
      const error = new Error("Equipment request not found");
      error.statusCode = 404;
      throw error;
    }
    const error = new Error(`Cannot issue equipment. Current request status is ${existing.status}`);
    error.statusCode = 400;
    throw error;
  }

  // 2. Fetch existing item to capture previous numbers
  const originalItem = await StockItem.findById(request.stockItem);
  if (!originalItem) {
    // Revert request
    await EquipmentRequest.findByIdAndUpdate(requestId, { status: "APPROVED", issuedAt: null });
    const error = new Error("Stock item not found");
    error.statusCode = 404;
    throw error;
  }

  const prevAvailable = originalItem.availableQuantity;
  const prevTotal = originalItem.totalQuantity;

  // 3. Atomically decrement stock verifying sufficient availability
  const updatedItem = await StockItem.findOneAndUpdate(
    { _id: request.stockItem, availableQuantity: { $gte: request.requestedQuantity } },
    { $inc: { availableQuantity: -request.requestedQuantity } },
    { new: true }
  );

  if (!updatedItem) {
    // Rollback request status back to APPROVED due to concurrent depletion
    await EquipmentRequest.findByIdAndUpdate(requestId, { status: "APPROVED", issuedAt: null });
    const error = new Error(
      `Insufficient available stock for ${originalItem.name}. Available: ${originalItem.availableQuantity}, Requested: ${request.requestedQuantity}`
    );
    error.statusCode = 400;
    throw error;
  }

  // 4. Record complete audit StockTransaction
  await StockTransaction.create({
    stockItem: updatedItem._id,
    task: request.task || null,
    type: "TAKEN",
    quantity: request.requestedQuantity,
    previousAvailable: prevAvailable,
    newAvailable: updatedItem.availableQuantity,
    previousTotal: prevTotal,
    newTotal: prevTotal,
    performedBy: managerUser.userId || managerUser.id || managerUser._id,
    notes: `Issued to staff for request ${request._id}${request.task ? ` (Task: ${request.task})` : ""}`,
  });

  return getRequestById(request._id);
};

/**
 * Return equipment back to stock inventory with atomic restoration
 */
const returnRequest = async (requestId, user) => {
  // 1. Atomically transition request from ISSUED to RETURNED to prevent double restoration
  const request = await EquipmentRequest.findOneAndUpdate(
    { _id: requestId, status: "ISSUED" },
    {
      $set: {
        status: "RETURNED",
        returnedAt: new Date(),
      },
    },
    { new: true }
  );

  if (!request) {
    const existing = await EquipmentRequest.findById(requestId);
    if (!existing) {
      const error = new Error("Equipment request not found");
      error.statusCode = 404;
      throw error;
    }
    const error = new Error(`Cannot return equipment. Current request status is ${existing.status}`);
    error.statusCode = 400;
    throw error;
  }

  const originalItem = await StockItem.findById(request.stockItem);
  if (!originalItem) {
    const error = new Error("Stock item not found");
    error.statusCode = 404;
    throw error;
  }

  const prevAvailable = originalItem.availableQuantity;
  const prevTotal = originalItem.totalQuantity;

  // 2. Atomically replenish available quantity (capped at totalQuantity)
  const targetAvailable = Math.min(prevAvailable + request.requestedQuantity, prevTotal);
  const updatedItem = await StockItem.findByIdAndUpdate(
    request.stockItem,
    { availableQuantity: targetAvailable },
    { new: true }
  );

  // 3. Record audit StockTransaction
  await StockTransaction.create({
    stockItem: updatedItem._id,
    task: request.task || null,
    type: "RETURNED",
    quantity: request.requestedQuantity,
    previousAvailable: prevAvailable,
    newAvailable: updatedItem.availableQuantity,
    previousTotal: prevTotal,
    newTotal: prevTotal,
    performedBy: user.userId || user.id || user._id,
    notes: `Returned by staff for request ${request._id}${request.task ? ` (Task: ${request.task})` : ""}`,
  });

  return getRequestById(request._id);
};

/**
 * Cancel request (Staff before approval)
 */
const cancelRequest = async (requestId, user) => {
  const request = await EquipmentRequest.findById(requestId);
  if (!request) {
    const error = new Error("Equipment request not found");
    error.statusCode = 404;
    throw error;
  }

  const userId = (user.userId || user.id || user._id).toString();
  const isStaff = user.role?.toLowerCase() === "staff";

  if (isStaff && request.requestedBy.toString() !== userId) {
    const error = new Error("Unauthorized to cancel this request");
    error.statusCode = 403;
    throw error;
  }

  if (request.status !== "PENDING") {
    const error = new Error(`Cannot cancel a request that is already ${request.status}`);
    error.statusCode = 400;
    throw error;
  }

  request.status = "CANCELLED";
  await request.save();

  return request;
};

module.exports = {
  createRequest,
  getRequests,
  getRequestById,
  approveRequest,
  rejectRequest,
  issueRequest,
  returnRequest,
  cancelRequest,
};
