const express = require("express");

const {
  createRequest,
  getRequests,
  getRequestById,
  approveRequest,
  rejectRequest,
  issueRequest,
  returnRequest,
  cancelRequest,
} = require("../controllers/equipmentRequest.controller");

const { authenticate } = require("../middlewares/auth.middleware");
const { authorize } = require("../middlewares/role.middleware");

const router = express.Router();
router.use(authenticate);

// Staff and Manager can submit requests
router.post(
  "/",
  authorize("superadmin", "admin", "manager", "staff"),
  createRequest
);

// Staff and Manager can view requests (scoped in service)
router.get(
  "/",
  authorize("superadmin", "admin", "manager", "staff"),
  getRequests
);

router.get(
  "/:id",
  authorize("superadmin", "admin", "manager", "staff"),
  getRequestById
);

// Manager approval & lifecycle
router.patch(
  "/:id/approve",
  authorize("superadmin", "admin", "manager"),
  approveRequest
);

router.patch(
  "/:id/reject",
  authorize("superadmin", "admin", "manager"),
  rejectRequest
);

router.patch(
  "/:id/issue",
  authorize("superadmin", "admin", "manager"),
  issueRequest
);

router.patch(
  "/:id/return",
  authorize("superadmin", "admin", "manager", "staff"),
  returnRequest
);

router.patch(
  "/:id/cancel",
  authorize("superadmin", "admin", "manager", "staff"),
  cancelRequest
);

module.exports = router;
