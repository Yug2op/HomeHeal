import express from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import {
    getDashboardStats,
    getSystemAnalytics,
    createAdmin,
    loginAdmin,
    logoutAdmin,
    getAdminProfile,
    updateAdminProfile,
    changeAdminPassword,
    getAllAdmins,
    getAdminById,
    deleteAdminById,
    updateUserStatus,
    updateTechnicianStatus,
} from '../controllers/adminController.js';

const router = express.Router();

// Public routes
router.route('/login').post(loginAdmin);

// Protected routes (require authentication)
router.use(verifyJWT);

// Auth routes
router.route('/logout').post(logoutAdmin);

// Admin profile routes
router.route('/profile')
    .get(getAdminProfile)
    .patch(updateAdminProfile);

router.route('/profile/change-password').patch(changeAdminPassword);

// Dashboard and analytics
router.route('/dashboard/stats').get(getDashboardStats);
router.route('/analytics').get(getSystemAnalytics);

// Admin management
router.route('/admins')
    .get(getAllAdmins)
    .post(createAdmin);

router.route('/admins/:adminId')
    .get(getAdminById)
    .delete(deleteAdminById);

// User management
router.route('/users/:userId/status').patch(updateUserStatus);

// Technician management
router.route('/technicians/:technicianId/status').patch(updateTechnicianStatus);

// System settings
// router.route('/settings')
//     .get(getAdminSettings)
//     .patch(updateAdminSettings);

// Activity logs
// router.route('/activity-logs').get(getAdminActivityLogs);

export default router;
