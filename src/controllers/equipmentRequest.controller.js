const equipmentRequestService = require("../services/equipmentRequest.service");

/**
 * Create equipment request
 * POST /api/equipment-requests
 */
const createRequest = async (req, res, next) => {
  try {
    const { task, stockItem, requestedQuantity, reason } = req.body;
    const requestedBy = req.user.userId || req.user.id || req.user._id;

    const request = await equipmentRequestService.createRequest({
      task,
      stockItem,
      requestedQuantity,
      reason,
      requestedBy,
    });

    res.status(201).json({
      success: true,
      message: "Equipment request submitted successfully",
      data: {
        request,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get equipment requests
 * GET /api/equipment-requests
 */
const getRequests = async (req, res, next) => {
  try {
    const result = await equipmentRequestService.getRequests(req.query, req.user);

    res.status(200).json({
      success: true,
      data: result.requests,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get equipment request by ID
 * GET /api/equipment-requests/:id
 */
const getRequestById = async (req, res, next) => {
  try {
    const request = await equipmentRequestService.getRequestById(req.params.id);

    res.status(200).json({
      success: true,
      data: {
        request,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve request
 * PATCH /api/equipment-requests/:id/approve
 */
const approveRequest = async (req, res, next) => {
  try {
    const request = await equipmentRequestService.approveRequest(
      req.params.id,
      req.body,
      req.user
    );

    res.status(200).json({
      success: true,
      message: "Equipment request approved successfully",
      data: {
        request,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reject request
 * PATCH /api/equipment-requests/:id/reject
 */
const rejectRequest = async (req, res, next) => {
  try {
    const request = await equipmentRequestService.rejectRequest(
      req.params.id,
      req.body,
      req.user
    );

    res.status(200).json({
      success: true,
      message: "Equipment request rejected",
      data: {
        request,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Issue equipment
 * PATCH /api/equipment-requests/:id/issue
 */
const issueRequest = async (req, res, next) => {
  try {
    const request = await equipmentRequestService.issueRequest(
      req.params.id,
      req.user
    );

    res.status(200).json({
      success: true,
      message: "Equipment issued successfully",
      data: {
        request,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Return equipment
 * PATCH /api/equipment-requests/:id/return
 */
const returnRequest = async (req, res, next) => {
  try {
    const request = await equipmentRequestService.returnRequest(
      req.params.id,
      req.user
    );

    res.status(200).json({
      success: true,
      message: "Equipment returned successfully",
      data: {
        request,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel request
 * PATCH /api/equipment-requests/:id/cancel
 */
const cancelRequest = async (req, res, next) => {
  try {
    const request = await equipmentRequestService.cancelRequest(
      req.params.id,
      req.user
    );

    res.status(200).json({
      success: true,
      message: "Equipment request cancelled",
      data: {
        request,
      },
    });
  } catch (error) {
    next(error);
  }
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
