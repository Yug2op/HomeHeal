import express from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import {
    getDashboardStats,
    getSystemAnalytics,
    updateUserStatus,
    updateTechnicianStatus,
} from '../controllers/adminController.js';

const router = express.Router();
// Protected routes (require authentication)
router.use(verifyJWT);
// Dashboard and analytics
router.route('/dashboard/stats').get(getDashboardStats);
router.route('/analytics').get(getSystemAnalytics);

// User management
router.route('/users/:userId/status').patch(updateUserStatus);

// Technician management
router.route('/technicians/:technicianId/status').patch(updateTechnicianStatus);

export default router;
